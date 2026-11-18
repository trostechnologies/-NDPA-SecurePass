import React, { useEffect, useState } from 'react';
import { api, jsonBody } from '../../api';
import { AuthResult, FactorPrompt, RecoveryCodes } from './LoginPage';
export const AccountSecurity: React.FC<{ onSignedOut: () => void }> = ({ onSignedOut }) => {
  const [security, setSecurity] = useState<{
      mfaEnabled: boolean;
      recoveryCodesRemaining: number;
    } | null>(null),
    [password, setPassword] = useState(''),
    [code, setCode] = useState(''),
    [newPassword, setNewPassword] = useState(''),
    [challenge, setChallenge] = useState<AuthResult | null>(null),
    [codes, setCodes] = useState<string[]>([]),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState('');
  const load = () => api<typeof security>('/account/security').then(setSecurity);
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, []);
  const run = async (task: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await task();
      setPassword('');
      setCode('');
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="p-4 rounded-xl border border-slate-700 bg-slate-900">
      <summary className="cursor-pointer">
        My account security ·{' '}
        {security?.mfaEnabled ? 'Authenticator enabled' : 'Authenticator not enrolled'}
      </summary>
      <div className="max-w-lg mt-4 space-y-3">
        {codes.length ? (
          <RecoveryCodes
            codes={codes}
            onDone={() => {
              setCodes([]);
              void load();
            }}
          />
        ) : challenge ? (
          <>
            <FactorPrompt challenge={challenge} code={code} setCode={setCode} />
            <button
              disabled={busy}
              className="p-3 bg-emerald-700 rounded"
              onClick={() =>
                void run(async () => {
                  const result = await api<AuthResult>('/mfa/complete', {
                    method: 'POST',
                    body: jsonBody({ challengeToken: challenge.challengeToken, code }),
                  });
                  setCodes(result.recoveryCodes || []);
                  setChallenge(null);
                })
              }
            >
              Confirm authenticator
            </button>
          </>
        ) : (
          <>
            <p>
              Recovery codes remaining: {security?.recoveryCodesRemaining ?? 0}. Changing
              credentials requires a recent sign-in.
            </p>
            <label className="block">
              Current password
              <input
                type="password"
                autoComplete="current-password"
                className="w-full p-2 bg-slate-950 rounded"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            <label className="block">
              Fresh authenticator or recovery code
              <input
                className="w-full p-2 bg-slate-950 rounded"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
            </label>
            <button
              disabled={busy}
              className="p-3 bg-slate-700 rounded"
              onClick={() =>
                void run(async () => {
                  setChallenge(
                    await api<AuthResult>('/account/mfa/start', {
                      method: 'POST',
                      body: jsonBody({ password, code }),
                    }),
                  );
                })
              }
            >
              {security?.mfaEnabled
                ? 'Replace authenticator and recovery codes'
                : 'Enroll authenticator'}
            </button>
            <label className="block">
              New password
              <input
                type="password"
                autoComplete="new-password"
                minLength={16}
                maxLength={1024}
                className="w-full p-2 bg-slate-950 rounded"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </label>
            <button
              disabled={busy}
              className="p-3 bg-emerald-700 rounded"
              onClick={() =>
                void run(async () => {
                  await api('/account/password', {
                    method: 'POST',
                    body: jsonBody({ password, newPassword, code }),
                  });
                  onSignedOut();
                })
              }
            >
              Change password and sign out
            </button>
          </>
        )}
        {message && (
          <p role="alert" className="text-red-300">
            {message}
          </p>
        )}
      </div>
    </details>
  );
};
