/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import QRCode from 'qrcode';
import { PreRegistrationInvite, HostEmployee } from '../../types/visitor';
import {
  Ticket,
  Plus,
  Send,
  Copy,
  Check,
  Calendar,
  Clock,
  Car,
  UserCheck,
  Building2,
  X,
} from 'lucide-react';

interface PreRegistrationManagerProps {
  invitations: PreRegistrationInvite[];
  hosts: HostEmployee[];
  onCreateInvite: (newInvite: PreRegistrationInvite) => void;
  onQuickCheckIn: (inviteCode: string) => void;
}

export const PreRegistrationManager: React.FC<PreRegistrationManagerProps> = ({
  invitations,
  hosts,
  onCreateInvite,
  onQuickCheckIn,
}) => {
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  // Form Fields
  const [guestName, setGuestName] = useState<string>('');
  const [guestEmail, setGuestEmail] = useState<string>('');
  const [guestPhone, setGuestPhone] = useState<string>('');
  const [guestOrg, setGuestOrg] = useState<string>('');
  const [hostId, setHostId] = useState<string>(hosts[0]?.id || '');
  const [expectedDate, setExpectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [expectedTime, setExpectedTime] = useState<string>('11:00');
  const [purpose, setPurpose] = useState<string>('Executive Strategic Consultation');
  const [parkingReserved, setParkingReserved] = useState<boolean>(true);
  const [specialInstructions, setSpecialInstructions] = useState<string>(
    'Please present this invitation at the Ground Floor security reception turnstiles.'
  );

  // Selected invite preview
  const [previewInvite, setPreviewInvite] = useState<PreRegistrationInvite | null>(null);
  const [previewQr, setPreviewQr] = useState<string>('');

  const handleCopyCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  const handleOpenPreview = async (inv: PreRegistrationInvite) => {
    setPreviewInvite(inv);
    try {
      const qr = await QRCode.toDataURL(
        JSON.stringify({
          type: 'INVITE',
          code: inv.inviteCode,
          name: inv.guestName,
          host: inv.hostEmployeeName,
          date: inv.expectedDate,
          time: inv.expectedTime,
        }),
        { width: 140, margin: 1 }
      );
      setPreviewQr(qr);
    } catch (err) {
      console.error(err);
    }
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!guestName || !guestEmail) {
      alert('Please provide guest name and email.');
      return;
    }

    const host = hosts.find(h => h.id === hostId) || hosts[0];
    const newCode = `INV-${Math.floor(1000 + Math.random() * 9000)}`;

    const newInvite: PreRegistrationInvite = {
      id: `INV-2026-${Math.floor(200 + Math.random() * 800)}`,
      inviteCode: newCode,
      guestName: guestName.trim(),
      guestEmail: guestEmail.trim(),
      guestPhone: guestPhone.trim() || '+234 800 000 0000',
      guestOrganization: guestOrg.trim() || 'Guest Organization',
      hostEmployeeId: host.id,
      hostEmployeeName: host.name,
      hostDepartment: host.department,
      expectedDate,
      expectedTime,
      purpose,
      status: 'pending',
      createdAt: new Date().toISOString(),
      specialInstructions,
      parkingReserved,
    };

    onCreateInvite(newInvite);
    setIsModalOpen(false);

    // Reset Form
    setGuestName('');
    setGuestEmail('');
    setGuestPhone('');
    setGuestOrg('');
  };

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
        <div>
          <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
            <Ticket className="w-4 h-4" />
            <span>VIP &amp; Scheduled Visitor Invitations</span>
          </div>
          <h2 className="text-lg font-bold text-slate-100 tracking-tight mt-0.5">
            Invite-Only Pre-Registration Hub
          </h2>
          <p className="text-xs text-slate-400 mt-1 max-w-xl">
            Pre-register high-value guests and partners in advance. Dispatches an automated email invitation
            with a secure QR code for accelerated front desk check-in.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsModalOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Create Guest Invitation
        </button>
      </div>

      {/* Invitations Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {invitations.map((inv) => {
          const isPending = inv.status === 'pending';

          return (
            <div
              key={inv.id}
              className="p-5 bg-slate-900 border border-slate-800 rounded-2xl space-y-4 hover:border-slate-700 transition-colors shadow-md flex flex-col justify-between"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-[10px] font-mono font-bold text-slate-500">
                      INVITATION PASS
                    </div>
                    <h3 className="text-base font-bold text-slate-100 leading-snug">
                      {inv.guestName}
                    </h3>
                    <p className="text-xs text-slate-400">{inv.guestOrganization}</p>
                  </div>
                  <span
                    className={`text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded border ${
                      isPending
                        ? 'bg-amber-950/40 text-amber-300 border-amber-800'
                        : 'bg-emerald-950/40 text-emerald-300 border-emerald-800'
                    }`}
                  >
                    {inv.status}
                  </span>
                </div>

                {/* Details */}
                <div className="p-3 bg-slate-950 border border-slate-800/80 rounded-xl text-xs space-y-1.5">
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Building2 className="w-3.5 h-3.5" /> Host:
                    </span>
                    <span className="text-slate-200 font-medium truncate max-w-[170px]">
                      {inv.hostEmployeeName}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="flex items-center gap-1 text-slate-500">
                      <Calendar className="w-3.5 h-3.5" /> Expected:
                    </span>
                    <span className="text-slate-200 font-mono">
                      {inv.expectedDate} at {inv.expectedTime}
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-slate-400">
                    <span className="text-slate-500">Purpose:</span>
                    <span className="text-slate-300 truncate max-w-[170px]">{inv.purpose}</span>
                  </div>
                  {inv.parkingReserved && (
                    <div className="text-[11px] text-emerald-400 flex items-center gap-1 pt-1 border-t border-slate-800">
                      <Car className="w-3 h-3" /> VIP Basement Parking Allocated
                    </div>
                  )}
                </div>

                {/* Invite Code Box */}
                <div className="flex items-center justify-between p-2.5 bg-slate-950 border border-slate-800 rounded-xl">
                  <div className="text-xs">
                    <span className="text-slate-500 block text-[10px] font-mono">INVITE CODE:</span>
                    <span className="text-sm font-mono font-bold text-emerald-400">
                      {inv.inviteCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleCopyCode(inv.inviteCode)}
                    className="p-1.5 text-slate-400 hover:text-slate-200 bg-slate-900 hover:bg-slate-800 border border-slate-800 rounded-lg transition-colors"
                    title="Copy Invite Code"
                  >
                    {copiedCode === inv.inviteCode ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-between gap-2 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => handleOpenPreview(inv)}
                  className="text-xs text-slate-400 hover:text-slate-200 transition-colors"
                >
                  View QR Pass
                </button>

                {isPending && (
                  <button
                    type="button"
                    onClick={() => onQuickCheckIn(inv.inviteCode)}
                    className="flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors shadow-sm"
                  >
                    <UserCheck className="w-3.5 h-3.5" /> Check In Now
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* CREATE INVITATION MODAL */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-5 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                <Ticket className="w-4 h-4" />
                <span>Issue New Guest Invitation</span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Guest Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="e.g. Dr. Ngozi Okonjo"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Guest Email *
                  </label>
                  <input
                    type="email"
                    required
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="e.g. guest@partner.com"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Guest Phone
                  </label>
                  <input
                    type="tel"
                    value={guestPhone}
                    onChange={(e) => setGuestPhone(e.target.value)}
                    placeholder="+234 803 000 0000"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Organization
                  </label>
                  <input
                    type="text"
                    value={guestOrg}
                    onChange={(e) => setGuestOrg(e.target.value)}
                    placeholder="e.g. World Bank / Stanbic"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Host Staff Member *
                </label>
                <select
                  value={hostId}
                  onChange={(e) => setHostId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-400"
                >
                  {hosts.map(h => (
                    <option key={h.id} value={h.id}>
                      {h.name} ({h.department} · {h.floor})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Expected Date
                  </label>
                  <input
                    type="date"
                    value={expectedDate}
                    onChange={(e) => setExpectedDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-slate-300 font-medium mb-1">
                    Expected Time
                  </label>
                  <input
                    type="time"
                    value={expectedTime}
                    onChange={(e) => setExpectedTime(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  Purpose of Visit
                </label>
                <input
                  type="text"
                  value={purpose}
                  onChange={(e) => setPurpose(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-slate-100 focus:outline-none focus:border-emerald-400"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-slate-300">
                <input
                  type="checkbox"
                  checked={parkingReserved}
                  onChange={(e) => setParkingReserved(e.target.checked)}
                  className="rounded border-slate-700 text-emerald-500 focus:ring-emerald-400"
                />
                <span>Reserve VIP Visitor Parking Stall in Tower Basement</span>
              </label>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold rounded-xl flex items-center gap-1.5 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" /> Dispatch Invitation Email
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* INVITATION PASS PREVIEW MODAL */}
      {previewInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-sm bg-white text-slate-900 rounded-2xl p-6 space-y-4 shadow-2xl animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div>
                <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  Zenith Holdings Tower Pass
                </div>
                <div className="text-sm font-bold text-slate-900">Digital Access Invitation</div>
              </div>
              <button
                type="button"
                onClick={() => setPreviewInvite(null)}
                className="p-1 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col items-center justify-center p-3 bg-slate-50 rounded-xl border border-slate-200">
              {previewQr && (
                <img src={previewQr} alt="Invite QR" className="w-32 h-32 rounded border border-slate-200" />
              )}
              <div className="mt-2 text-center">
                <span className="text-[10px] text-slate-400 block font-mono">INVITE CODE:</span>
                <span className="text-base font-mono font-bold text-slate-900 tracking-wider">
                  {previewInvite.inviteCode}
                </span>
              </div>
            </div>

            <div className="text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-slate-500">Guest:</span>
                <strong className="text-slate-800">{previewInvite.guestName}</strong>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Host:</span>
                <span className="text-slate-700">{previewInvite.hostEmployeeName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Date &amp; Time:</span>
                <span className="text-slate-700 font-mono">
                  {previewInvite.expectedDate} · {previewInvite.expectedTime}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Facility:</span>
                <span className="text-slate-700">Victoria Island Corporate Tower</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-200 flex justify-end">
              <button
                type="button"
                onClick={() => setPreviewInvite(null)}
                className="w-full py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold hover:bg-slate-800 transition-colors"
              >
                Close Pass Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
