import React, { useState } from 'react';
import { api, jsonBody } from '../../api';
import { HostEmployee, Visitor } from '../../types/visitor';
import { NDPA_ORGANIZATION_INFO, maskEmail, maskPhoneNumber } from '../../utils/ndpaCompliance';
import { formatInviteCode } from '../../utils/inviteCode';
import { Search, UserPlus, Users, LogOut, CheckCircle2 } from 'lucide-react';

interface InvitationDetails {
  id: string;
  inviteCode: string;
  guestName: string;
  guestEmail: string;
  guestPhone: string;
  guestOrganization: string;
  hostEmployeeId: string;
  hostEmployeeName: string;
  expectedDate: string;
  expectedTime: string;
  purpose: string;
}

interface ReceptionDeskProps {
  hosts: HostEmployee[];
  visitors: Visitor[];
  onCheckedIn: (visitor: Visitor) => void;
  onCheckOut: (id: string) => void;
}

const inputClass =
  'w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400';
const buttonClass =
  'px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors disabled:opacity-50';

export const ReceptionDesk: React.FC<ReceptionDeskProps> = ({
  hosts,
  visitors,
  onCheckedIn,
  onCheckOut,
}) => {
  const [mode, setMode] = useState<'invite' | 'walkin'>('invite');
  const [code, setCode] = useState('');
  const [invite, setInvite] = useState<InvitationDetails | null>(null);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [organization, setOrganization] = useState('');
  const [purpose, setPurpose] = useState('');
  const [hostId, setHostId] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const resetForm = () => {
    setInvite(null);
    setCode('');
    setFullName('');
    setEmail('');
    setPhone('');
    setOrganization('');
    setPurpose('');
    setHostId('');
    setAcknowledged(false);
  };

  const lookup = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !code.trim()) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const result = await api<{ invitation: InvitationDetails }>('/reception/lookup', {
        method: 'POST',
        body: jsonBody({ inviteCode: code }),
      });
      const i = result.invitation;
      setInvite(i);
      setFullName(i.guestName);
      setEmail(i.guestEmail);
      setPhone(i.guestPhone || '');
      setOrganization(i.guestOrganization || '');
      setPurpose(i.purpose || '');
      setHostId(i.hostEmployeeId);
      setAcknowledged(false);
    } catch (e) {
      setInvite(null);
      setError(e instanceof Error ? e.message : 'Invitation unavailable');
    } finally {
      setBusy(false);
    }
  };

  const checkIn = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (!acknowledged) {
      setError('The visitor must acknowledge the privacy notice first.');
      return;
    }
    setBusy(true);
    setError('');
    setMessage('');
    try {
      const saved = await api<Visitor>('/reception/checkin', {
        method: 'POST',
        body: jsonBody({
          fullName,
          email,
          phone,
          organization,
          purpose,
          hostEmployeeId: hostId,
          generalConsentGranted: true,
          noticeVersion: NDPA_ORGANIZATION_INFO.noticeVersion,
          ...(mode === 'invite' && invite ? { inviteCode: invite.inviteCode } : {}),
        }),
      });
      onCheckedIn(saved);
      setMessage(`${saved.fullName} is checked in.`);
      resetForm();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Check-in failed');
    } finally {
      setBusy(false);
    }
  };

  const onSite = visitors.filter((v) => v.status === 'checked_in');
  const showForm = mode === 'walkin' || invite;

  return (
    <div className="space-y-6">
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-100">Reception Desk</h2>
            <p className="text-xs text-slate-400">{NDPA_ORGANIZATION_INFO.facilityName}</p>
          </div>
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onClick={() => {
                setMode('invite');
                resetForm();
                setError('');
              }}
              className={`px-3 py-1.5 rounded-lg border ${
                mode === 'invite'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-slate-800 text-slate-400'
              }`}
            >
              <Search className="w-3.5 h-3.5 inline mr-1" />
              Invited guest
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('walkin');
                resetForm();
                setError('');
              }}
              className={`px-3 py-1.5 rounded-lg border ${
                mode === 'walkin'
                  ? 'border-emerald-500 text-emerald-400'
                  : 'border-slate-800 text-slate-400'
              }`}
            >
              <UserPlus className="w-3.5 h-3.5 inline mr-1" />
              Walk-in
            </button>
          </div>
        </div>

        {mode === 'invite' && !invite && (
          <form onSubmit={lookup} className="flex flex-col sm:flex-row gap-2">
            <input
              aria-label="Invite code"
              className={`${inputClass} font-mono uppercase`}
              placeholder="Enter the guest's invite code"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              autoComplete="off"
            />
            <button type="submit" className={buttonClass} disabled={busy || !code.trim()}>
              Look up invitation
            </button>
          </form>
        )}

        {mode === 'invite' && invite && (
          <div className="p-3 rounded-xl border border-emerald-800/60 bg-emerald-950/20 text-xs text-slate-300 space-y-1">
            <div className="font-mono text-emerald-400">{formatInviteCode(invite.inviteCode)}</div>
            <div>
              Host: <span className="text-slate-100">{invite.hostEmployeeName}</span> · Expected{' '}
              {invite.expectedDate} {invite.expectedTime}
            </div>
          </div>
        )}

        {showForm && (
          <form onSubmit={checkIn} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="text-xs text-slate-400 space-y-1">
              <span>Full name</span>
              <input
                required
                className={inputClass}
                placeholder="Your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>Email</span>
              <input
                required
                type="email"
                className={inputClass}
                placeholder="you@yourcompany.com"
                value={email}
                readOnly={mode === 'invite'}
                onChange={(e) => setEmail(e.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>Phone</span>
              <input
                required
                className={inputClass}
                placeholder="Your phone number"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </label>
            <label className="text-xs text-slate-400 space-y-1">
              <span>Organisation</span>
              <input
                className={inputClass}
                placeholder="Your organisation"
                value={organization}
                onChange={(e) => setOrganization(e.target.value)}
              />
            </label>
            {mode === 'walkin' && (
              <label className="text-xs text-slate-400 space-y-1">
                <span>Host</span>
                <select
                  required
                  className={inputClass}
                  value={hostId}
                  onChange={(e) => setHostId(e.target.value)}
                >
                  <option value="">Select host</option>
                  {hosts.map((h) => (
                    <option key={h.id} value={h.id}>
                      {h.name}
                      {h.department ? ` · ${h.department}` : ''}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <label className="text-xs text-slate-400 space-y-1">
              <span>Purpose</span>
              <input
                className={inputClass}
                placeholder="Purpose of visit"
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
              />
            </label>
            <label className="sm:col-span-2 flex items-start gap-2 text-xs text-slate-300">
              <input
                type="checkbox"
                className="mt-0.5"
                checked={acknowledged}
                onChange={(e) => setAcknowledged(e.target.checked)}
              />
              <span>
                The visitor has been shown the privacy notice (version{' '}
                {NDPA_ORGANIZATION_INFO.noticeVersion}): {NDPA_ORGANIZATION_INFO.privacyNoticeText}
              </span>
            </label>
            <div className="sm:col-span-2 flex flex-wrap gap-2">
              <button type="submit" className={buttonClass} disabled={busy}>
                {mode === 'invite' ? 'Confirm check-in' : 'Check in walk-in'}
              </button>
              {mode === 'invite' && (
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setError('');
                  }}
                  className="px-4 py-2 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        )}

        {error && (
          <p role="alert" className="text-xs text-red-300">
            {error}
          </p>
        )}
        {message && (
          <p className="text-xs text-emerald-300 flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5" /> {message}
          </p>
        )}
      </div>

      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl space-y-3">
        <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
          <Users className="w-4 h-4 text-emerald-400" /> Currently on site ({onSite.length})
        </h3>
        {onSite.length === 0 ? (
          <p className="text-xs text-slate-500">No visitors are checked in.</p>
        ) : (
          <ul className="divide-y divide-slate-800">
            {onSite.map((v) => (
              <li
                key={v.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <div className="font-semibold text-slate-100">{v.fullName}</div>
                  <div className="text-slate-400">
                    {maskEmail(v.email)} · {maskPhoneNumber(v.phone)} · Host: {v.hostEmployeeName}
                  </div>
                  <div className="text-slate-500">
                    In:{' '}
                    {new Date(v.checkInTime).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onCheckOut(v.id)}
                  className="self-start sm:self-auto px-3 py-1.5 text-xs text-slate-200 bg-slate-800 hover:bg-slate-700 rounded-lg flex items-center gap-1"
                >
                  <LogOut className="w-3.5 h-3.5" /> Check out
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
};
