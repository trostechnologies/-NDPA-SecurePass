import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AppUser } from '../../types/visitor';
import { api, jsonBody } from '../../api';

export interface AuthResult {
  user?: AppUser;
  challengeToken?: string;
  mfaRequired?: boolean;
  enrollment?: boolean;
  secret?: string;
  uri?: string;
  recoveryCodes?: string[];
}
export const RecoveryCodes: React.FC<{ codes: string[]; onDone: () => void }> = ({
  codes,
  onDone,
}) => (
  <div className="space-y-4">
    <h2 className="text-xl font-bold">Save your recovery codes</h2>
    <p>Each code works once. Keep these offline in a safe place. They will not be shown again.</p>
    <div className="grid gap-2 text-xs font-mono select-all">
      {codes.map((code) => (
        <code key={code}>{code}</code>
      ))}
    </div>
    <button className="p-3 bg-emerald-500 text-slate-950 rounded" onClick={onDone}>
      I saved my recovery codes
    </button>
  </div>
);
export const FactorPrompt: React.FC<{
  challenge: AuthResult;
  code: string;
  setCode: (value: string) => void;
}> = ({ challenge, code, setCode }) => {
  const [qr, setQr] = useState('');
  useEffect(() => {
    let active = true;
    setQr('');
    if (challenge.uri)
      void QRCode.toDataURL(challenge.uri).then((url) => {
        if (active) setQr(url);
      });
    return () => {
      active = false;
    };
  }, [challenge.uri]);
  return (
    <div className="space-y-3">
      {challenge.enrollment ? (
        <>
          <h2 className="text-xl">Set up your authenticator</h2>
          <p>Scan this code with your authenticator app, then enter its six-digit code.</p>
          {qr && <img src={qr} alt="Authenticator enrollment QR" className="w-48 h-48" />}
          <p className="break-all text-xs">
            Manual setup key: <code>{challenge.secret}</code>
          </p>
        </>
      ) : (
        <p>Enter a fresh authenticator code or one unused recovery code.</p>
      )}
      <label className="block">
        Authenticator or recovery code
        <input
          autoComplete="one-time-code"
          aria-label="Authenticator or recovery code"
          className="block w-full p-3 bg-slate-950 rounded border border-slate-700"
          value={code}
          onChange={(e) => setCode(e.target.value.trim())}
          required
        />
      </label>
    </div>
  );
};
export const LoginPage: React.FC<{
  users: AppUser[];
  onLoginSuccess: (user: AppUser) => void;
  onCancelToKiosk: () => void;
}> = ({ onLoginSuccess, onCancelToKiosk }) => {
  const [email, setEmail] = useState(''),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [challenge, setChallenge] = useState<AuthResult | null>(null),
    [complete, setComplete] = useState<AuthResult | null>(null);
  const [reset, setReset] = useState(false),
    [resetToken, setResetToken] = useState(''),
    [newPassword, setNewPassword] = useState('');
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      if (reset) {
        await api('/password-reset', {
          method: 'POST',
          body: jsonBody({ token: resetToken, newPassword, code }),
        });
        setReset(false);
        setResetToken('');
        setNewPassword('');
        setCode('');
        setError('Password updated. Sign in with the new password.');
        return;
      }
      const result = challenge
        ? await api<AuthResult>('/mfa/complete', {
            method: 'POST',
            body: jsonBody({ challengeToken: challenge.challengeToken, code }),
          })
        : await api<AuthResult>('/login', { method: 'POST', body: jsonBody({ email, password }) });
      setPassword('');
      setCode('');
      if (result.challengeToken) setChallenge(result);
      else if (result.recoveryCodes?.length) setComplete(result);
      else if (result.user) onLoginSuccess(result.user);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sign-in failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-md mx-auto mt-12 p-8 rounded-2xl bg-slate-900 border border-slate-700 space-y-5">
      {complete?.user && complete.recoveryCodes ? (
        <RecoveryCodes
          codes={complete.recoveryCodes}
          onDone={() => onLoginSuccess(complete.user!)}
        />
      ) : (
        <>
          <h1 className="text-2xl font-bold">SecurePass staff sign-in</h1>
          <form onSubmit={submit} className="space-y-4">
            {reset ? (
              <>
                <label className="block">
                  Password reset token
                  <input
                    required
                    className="w-full p-3 bg-slate-950 rounded"
                    value={resetToken}
                    onChange={(e) => setResetToken(e.target.value)}
                  />
                </label>
                <label className="block">
                  New password
                  <input
                    required
                    minLength={16}
                    maxLength={1024}
                    type="password"
                    autoComplete="new-password"
                    className="w-full p-3 bg-slate-950 rounded"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                </label>
                <label className="block">
                  Authenticator or recovery code if enrolled
                  <input
                    className="w-full p-3 bg-slate-950 rounded"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
              </>
            ) : challenge ? (
              <FactorPrompt challenge={challenge} code={code} setCode={setCode} />
            ) : (
              <>
                <label className="block text-sm">
                  Work email
                  <input
                    className="w-full p-3 mt-1 rounded-lg bg-slate-950 border border-slate-700"
                    type="email"
                    autoComplete="username"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  Password
                  <input
                    className="w-full p-3 mt-1 rounded-lg bg-slate-950 border border-slate-700"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              </>
            )}
            {error && (
              <p role="alert" className="text-red-300">
                {error}
              </p>
            )}
            <button
              className="w-full p-3 rounded-lg bg-emerald-400 text-slate-950 font-bold disabled:opacity-50"
              disabled={busy}
            >
              {busy
                ? 'Verifying…'
                : reset
                  ? 'Set new password'
                  : challenge
                    ? 'Verify authenticator'
                    : 'Sign in'}
            </button>
          </form>
          <div className="flex justify-between text-sm">
            <button
              onClick={() => {
                setChallenge(null);
                setReset(!reset);
                setError('');
              }}
            >
              {reset ? 'Back to sign-in' : 'Use a password reset token'}
            </button>
            <button onClick={onCancelToKiosk}>Return to visitor kiosk</button>
          </div>
        </>
      )}
    </div>
  );
};
