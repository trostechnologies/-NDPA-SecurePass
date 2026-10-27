/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import {
  Visitor,
  HostEmployee,
  PreRegistrationInvite,
  VisitType,
  GovernmentIdType,
  SecurityClearance,
} from '../../types/visitor';
import { CameraCapture } from './CameraCapture';
import { ConsentNoticeModal } from './ConsentNoticeModal';
import {
  generatePassCode,
  generateBadgeId,
  generateWifiCode,
  NDPA_ORGANIZATION_INFO,
} from '../../utils/ndpaCompliance';
import {
  User,
  Building,
  KeyRound,
  ShieldCheck,
  CheckCircle2,
  Ticket,
  Car,
  ChevronRight,
  ArrowLeft,
  Sparkles,
  Search,
} from 'lucide-react';

interface VisitorKioskProps {
  hosts: HostEmployee[];
  invitations: PreRegistrationInvite[];
  onCheckInComplete: (newVisitor: Visitor, updatedInviteId?: string) => void;
  onOpenBadge: (visitor: Visitor) => void;
}

export const VisitorKiosk: React.FC<VisitorKioskProps> = ({
  hosts,
  invitations,
  onCheckInComplete,
  onOpenBadge,
}) => {
  const [mode, setMode] = useState<'walk_in' | 'redeem_invite'>('walk_in');

  // Form State for Walk-In
  const [step, setStep] = useState<number>(1);
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [organization, setOrganization] = useState<string>('');
  const [selectedHostId, setSelectedHostId] = useState<string>(hosts[0]?.id || '');
  const [purpose, setPurpose] = useState<string>('Business Meeting & Partnership');
  const [visitType, setVisitType] = useState<VisitType>('walk_in');
  const [vehiclePlate, setVehiclePlate] = useState<string>('');
  const [govIdType, setGovIdType] = useState<GovernmentIdType>('NIN');
  const [govIdNumber, setGovIdNumber] = useState<string>('');
  const [emergencyName, setEmergencyName] = useState<string>('');
  const [emergencyPhone, setEmergencyPhone] = useState<string>('');
  const [securityClearance, setSecurityClearance] = useState<SecurityClearance>('Standard');

  // Biometrics & Consent
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [biometricConsent, setBiometricConsent] = useState<boolean>(false);
  const [generalConsent, setGeneralConsent] = useState<boolean>(true);
  const [isConsentModalOpen, setIsConsentModalOpen] = useState<boolean>(false);

  // Invite Redemption State
  const [inviteCodeInput, setInviteCodeInput] = useState<string>('');
  const [matchedInvite, setMatchedInvite] = useState<PreRegistrationInvite | null>(null);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Filter hosts
  const [hostSearch, setHostSearch] = useState<string>('');
  const filteredHosts = hosts.filter(
    h =>
      h.name.toLowerCase().includes(hostSearch.toLowerCase()) ||
      h.department.toLowerCase().includes(hostSearch.toLowerCase()) ||
      h.title.toLowerCase().includes(hostSearch.toLowerCase())
  );

  const selectedHost = hosts.find(h => h.id === selectedHostId) || hosts[0];

  const handleLookupInvite = (code: string) => {
    setInviteError(null);
    const cleaned = code.trim().toUpperCase();
    const found = invitations.find(
      inv => inv.inviteCode.toUpperCase() === cleaned && inv.status === 'pending'
    );
    if (found) {
      setMatchedInvite(found);
      setFullName(found.guestName);
      setEmail(found.guestEmail);
      setPhone(found.guestPhone);
      setOrganization(found.guestOrganization);
      setSelectedHostId(found.hostEmployeeId);
      setPurpose(found.purpose);
      setVisitType('pre_registered');
    } else {
      setMatchedInvite(null);
      setInviteError(`Invite code "${cleaned}" not found or already checked in. Check code or proceed as walk-in.`);
    }
  };

  const handleFinalSubmit = () => {
    if (!fullName || !email || !phone) {
      alert('Please fill in your Name, Email, and Phone Number.');
      return;
    }
    if (!generalConsent) {
      alert('Statutory NDPA 2023 consent must be confirmed to proceed.');
      return;
    }

    const host = hosts.find(h => h.id === selectedHostId) || hosts[0];

    // Mask ID number for data minimization (NDPA Sec 24(1)(c))
    let maskedId = '';
    if (govIdNumber) {
      const clean = govIdNumber.trim();
      maskedId = clean.length > 4 ? `•••• •••• ${clean.slice(-4)}` : '••••';
    }

    const newVisitor: Visitor = {
      id: `VIS-2026-${Math.floor(100 + Math.random() * 900)}`,
      passCode: generatePassCode(),
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      organization: organization.trim() || 'Independent Visitor',
      hostEmployeeId: host.id,
      hostEmployeeName: host.name,
      hostDepartment: host.department,
      purpose: purpose.trim(),
      visitType: matchedInvite ? 'pre_registered' : visitType,
      checkInTime: new Date().toISOString(),
      status: 'checked_in',
      hasBiometricPhoto: Boolean(photoUrl && biometricConsent),
      photoUrl: photoUrl && biometricConsent ? photoUrl : undefined,
      biometricConsentGranted: Boolean(photoUrl && biometricConsent),
      generalConsentGranted: true,
      consentTimestamp: new Date().toISOString(),
      vehiclePlate: vehiclePlate.trim() || undefined,
      governmentIdType: govIdType,
      governmentIdNumberMasked: maskedId || undefined,
      emergencyContactName: emergencyName.trim() || undefined,
      emergencyContactPhone: emergencyPhone.trim() || undefined,
      badgePrinted: false,
      retentionExpiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(), // 60 days
      securityClearance,
      wifiAccessGranted: true,
      wifiCode: generateWifiCode(),
      badgeId: generateBadgeId(),
    };

    onCheckInComplete(newVisitor, matchedInvite?.id);
    onOpenBadge(newVisitor);

    // Reset form
    setStep(1);
    setFullName('');
    setEmail('');
    setPhone('');
    setOrganization('');
    setVehiclePlate('');
    setGovIdNumber('');
    setPhotoUrl(null);
    setBiometricConsent(false);
    setMatchedInvite(null);
    setInviteCodeInput('');
  };

  return (
    <div className="space-y-6">
      {/* Clean Compact Kiosk Header (Image banner removed) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
        <div>
          <div className="text-[11px] font-mono font-bold tracking-wider uppercase text-emerald-400">
            {NDPA_ORGANIZATION_INFO.facilityName} · NDPA 2023 COMPLIANT
          </div>
          <h1 className="text-lg sm:text-xl font-bold text-white tracking-tight mt-0.5">
            Visitor Access Registration Kiosk
          </h1>
          <p className="text-xs text-slate-400 mt-0.5">
            Self-service reception check-in with voluntary biometrics and instant badge generation.
          </p>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-slate-950 border border-slate-800 rounded-xl self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setMode('walk_in');
              setMatchedInvite(null);
            }}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              mode === 'walk_in'
                ? 'bg-emerald-400 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            New Visitor Check-In
          </button>
          <button
            type="button"
            onClick={() => setMode('redeem_invite')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
              mode === 'redeem_invite'
                ? 'bg-emerald-400 text-slate-950 font-semibold shadow-sm'
                : 'text-slate-300 hover:text-white'
            }`}
          >
            I Have an Invite Code
          </button>
        </div>
      </div>

      {/* MODE 1: REDEEM PRE-REGISTRATION INVITATION */}
      {mode === 'redeem_invite' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg max-w-2xl mx-auto space-y-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
              <Ticket className="w-4 h-4" />
              <span>Redeem Pre-Registered Guest Pass</span>
            </div>
            <p className="text-xs text-slate-400">
              Enter the unique invite code sent to your email by your host for expedited 10-second check-in.
            </p>
          </div>

          <div className="space-y-3">
            <div className="flex gap-2">
              <input
                type="text"
                value={inviteCodeInput}
                onChange={(e) => setInviteCodeInput(e.target.value.toUpperCase())}
                placeholder="e.g. INV-7821"
                className="flex-1 px-4 py-2.5 bg-slate-950 border border-slate-800 rounded-xl text-sm font-mono text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
              />
              <button
                type="button"
                onClick={() => handleLookupInvite(inviteCodeInput)}
                className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs rounded-xl transition-colors whitespace-nowrap shadow-sm"
              >
                Lookup Invite
              </button>
            </div>

            {/* Quick demo chips for convenient testing */}
            <div className="flex items-center gap-2 text-xs text-slate-400 flex-wrap">
              <span>Quick test invites:</span>
              {invitations
                .filter(i => i.status === 'pending')
                .slice(0, 3)
                .map(inv => (
                  <button
                    key={inv.id}
                    type="button"
                    onClick={() => {
                      setInviteCodeInput(inv.inviteCode);
                      handleLookupInvite(inv.inviteCode);
                    }}
                    className="px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded font-mono text-[11px] transition-colors"
                  >
                    {inv.inviteCode} ({inv.guestName.split(' ')[0]})
                  </button>
                ))}
            </div>

            {inviteError && (
              <p className="text-xs text-amber-400 bg-amber-950/30 p-2.5 rounded-lg border border-amber-900/50">
                {inviteError}
              </p>
            )}
          </div>

          {/* Matched Invite Preview Card */}
          {matchedInvite && (
            <div className="p-4 bg-slate-950 border border-emerald-500/30 rounded-xl space-y-4 animate-in fade-in">
              <div className="flex items-start justify-between border-b border-slate-800 pb-3">
                <div>
                  <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    INVITATION VERIFIED
                  </span>
                  <h3 className="text-base font-bold text-slate-100 mt-1">
                    {matchedInvite.guestName}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {matchedInvite.guestOrganization} · {matchedInvite.guestEmail}
                  </p>
                </div>
                <div className="text-right text-xs text-slate-400">
                  <div className="font-semibold text-slate-300">Host: {matchedInvite.hostEmployeeName}</div>
                  <div>{matchedInvite.hostDepartment}</div>
                  <div className="text-emerald-400 font-mono mt-0.5">Time: {matchedInvite.expectedTime}</div>
                </div>
              </div>

              {matchedInvite.specialInstructions && (
                <div className="text-xs text-slate-300 bg-slate-900 p-2.5 rounded-lg border border-slate-800">
                  <strong className="text-slate-200">Host Note:</strong> {matchedInvite.specialInstructions}
                  {matchedInvite.parkingReserved && (
                    <span className="ml-2 text-emerald-400">· Reserved Parking Stall Active</span>
                  )}
                </div>
              )}

              {/* Optional Camera for Invited Guest */}
              <div className="pt-2">
                <CameraCapture
                  onCapture={(photo, consent) => {
                    setPhotoUrl(photo);
                    setBiometricConsent(consent);
                  }}
                  onSkip={() => {
                    setPhotoUrl(null);
                    setBiometricConsent(false);
                  }}
                  initialPhotoUrl={photoUrl || undefined}
                />
              </div>

              {/* Instant Check-In Button */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setIsConsentModalOpen(true)}
                  className="text-xs text-emerald-400 hover:underline"
                >
                  View NDPA Privacy Notice &amp; Rights
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  className="px-6 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs rounded-xl shadow-md flex items-center gap-2 transition-transform active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" /> Complete Check-In &amp; Print Pass
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* MODE 2: STEP-BY-STEP WALK-IN REGISTRATION */}
      {mode === 'walk_in' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-lg space-y-6">
          {/* Stepper Header */}
          <div className="flex items-center justify-between pb-4 border-b border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-emerald-400/10 text-emerald-400 border border-emerald-400/20 flex items-center justify-center font-bold text-xs">
                0{step}
              </div>
              <div>
                <h2 className="text-sm font-bold text-slate-100">
                  {step === 1 && 'Visitor Personal Telemetry'}
                  {step === 2 && 'Host & Purpose Specification'}
                  {step === 3 && 'Optional Biometric Photograph (NDPA Sec 30)'}
                  {step === 4 && 'NDPA Consent & Security Clearance'}
                </h2>
                <p className="text-xs text-slate-400">
                  {step === 1 && 'Basic identity details required under NDPA principles of data minimization.'}
                  {step === 2 && 'Designate the official staff member or department hosting your visit.'}
                  {step === 3 && 'Biometric images are strictly voluntary. You may skip without hesitation.'}
                  {step === 4 && 'Statutory consent review and immediate visitor badge issuance.'}
                </p>
              </div>
            </div>

            <div className="text-xs font-mono text-slate-500">
              Step {step} of 4
            </div>
          </div>

          {/* STEP 1: PERSONAL DETAILS */}
          {step === 1 && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Full Legal Name <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <User className="w-4 h-4 text-slate-500 absolute left-3 top-3" />
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g. Babatunde Fashola"
                      className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Official Email Address <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. b.fashola@enterprise.com.ng"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Phone Number (Nigerian Format) <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="tel"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="e.g. +234 803 123 4567"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Company / Organization Representing
                  </label>
                  <input
                    type="text"
                    value={organization}
                    onChange={(e) => setOrganization(e.target.value)}
                    placeholder="e.g. KPMG Nigeria / Stanbic IBTC"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400"
                  />
                </div>
              </div>

              {/* Secondary Details: Vehicle & ID */}
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center gap-1">
                    <Car className="w-3.5 h-3.5" /> Vehicle Plate (Optional)
                  </label>
                  <input
                    type="text"
                    value={vehiclePlate}
                    onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                    placeholder="e.g. LAG-902-BD"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    ID Document Type
                  </label>
                  <select
                    value={govIdType}
                    onChange={(e) => setGovIdType(e.target.value as GovernmentIdType)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="NIN">National Identity Number (NIN)</option>
                    <option value="Voters Card">INEC Voter's Card</option>
                    <option value="Drivers License">FRSC Driver's License</option>
                    <option value="International Passport">International Passport</option>
                    <option value="Corporate ID">Corporate Employee Badge</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    ID Number (Masked for Privacy)
                  </label>
                  <input
                    type="text"
                    value={govIdNumber}
                    onChange={(e) => setGovIdNumber(e.target.value)}
                    placeholder="Last 4 digits or ID number"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              {/* Emergency Contact */}
              <div className="pt-2 border-t border-slate-800/80 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Emergency Contact Name (Facility Safety)
                  </label>
                  <input
                    type="text"
                    value={emergencyName}
                    onChange={(e) => setEmergencyName(e.target.value)}
                    placeholder="e.g. Folake Fashola"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Emergency Contact Phone
                  </label>
                  <input
                    type="tel"
                    value={emergencyPhone}
                    onChange={(e) => setEmergencyPhone(e.target.value)}
                    placeholder="e.g. +234 802 331 4455"
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-4">
                <button
                  type="button"
                  onClick={() => {
                    if (!fullName || !email || !phone) {
                      alert('Please complete the required fields: Full Name, Email, and Phone Number.');
                      return;
                    }
                    setStep(2);
                  }}
                  className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  Proceed to Host Selection <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: HOST SELECTION & PURPOSE */}
          {step === 2 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">
                  Select Host Employee / Department Head <span className="text-rose-400">*</span>
                </label>

                {/* Search Bar for Host */}
                <div className="relative mb-3">
                  <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={hostSearch}
                    onChange={(e) => setHostSearch(e.target.value)}
                    placeholder="Search by host name, department, or title..."
                    className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 max-h-60 overflow-y-auto pr-1">
                  {filteredHosts.map((h) => {
                    const isSelected = selectedHostId === h.id;
                    return (
                      <div
                        key={h.id}
                        onClick={() => setSelectedHostId(h.id)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all ${
                          isSelected
                            ? 'bg-emerald-950/30 border-emerald-500 text-slate-100 shadow-sm'
                            : 'bg-slate-950 border-slate-800 hover:border-slate-700 text-slate-300'
                        }`}
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={h.avatar}
                            alt={h.name}
                            className="w-9 h-9 rounded-full object-cover border border-slate-700"
                            referrerPolicy="no-referrer"
                          />
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold truncate text-slate-100">
                              {h.name}
                            </h4>
                            <p className="text-[11px] text-slate-400 truncate">{h.title}</p>
                            <p className="text-[10px] text-emerald-400/90 truncate font-mono">
                              {h.floor}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Purpose & Visit Type */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Purpose of Visit <span className="text-rose-400">*</span>
                  </label>
                  <select
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="Business Meeting & Partnership">Business Meeting &amp; Partnership</option>
                    <option value="Executive Boardroom Briefing">Executive Boardroom Briefing</option>
                    <option value="Regulatory Inspection & Audit">Regulatory Inspection &amp; Audit</option>
                    <option value="Recruitment & Job Interview">Recruitment &amp; Job Interview</option>
                    <option value="IT Infrastructure & Data Center Maintenance">IT Infrastructure &amp; Data Center Maintenance</option>
                    <option value="Vendor Delivery & Supplies">Vendor Delivery &amp; Supplies</option>
                    <option value="Facilities / Engineering Contractor">Facilities / Engineering Contractor</option>
                    <option value="Legal & Compliance Consultation">Legal &amp; Compliance Consultation</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">
                    Visitor Classification
                  </label>
                  <select
                    value={visitType}
                    onChange={(e) => setVisitType(e.target.value as VisitType)}
                    className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-400"
                  >
                    <option value="walk_in">Standard Walk-In Visitor</option>
                    <option value="vip">VIP Guest / Executive Delegations</option>
                    <option value="contractor">Maintenance Contractor</option>
                    <option value="delivery">Courier / Logistics Delivery</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  Proceed to Optional Photo <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: OPTIONAL BIOMETRIC PHOTO CAPTURE */}
          {step === 3 && (
            <div className="space-y-4">
              <CameraCapture
                onCapture={(photo, consent) => {
                  setPhotoUrl(photo);
                  setBiometricConsent(consent);
                }}
                onSkip={() => {
                  setPhotoUrl(null);
                  setBiometricConsent(false);
                  setStep(4);
                }}
                initialPhotoUrl={photoUrl || undefined}
              />

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="px-5 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-semibold text-xs rounded-xl flex items-center gap-1.5 transition-colors shadow-sm"
                >
                  Continue to Consent Review <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: NDPA STATUTORY CONSENT & CONFIRMATION */}
          {step === 4 && (
            <div className="space-y-5">
              {/* Summary of Visit */}
              <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
                <div className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                  Registration Summary Review
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 block">Visitor Name</span>
                    <strong className="text-slate-200 truncate block">{fullName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Host Person</span>
                    <strong className="text-slate-200 truncate block">{selectedHost?.name}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Destination</span>
                    <span className="text-slate-300 font-mono block">{selectedHost?.floor}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">Biometric Photo</span>
                    <span className="text-slate-300 block">
                      {photoUrl && biometricConsent ? 'Captured (Consented)' : 'Skipped (Sec 30 Opt-Out)'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Security Clearance Selection (Admin / Front desk control) */}
              <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-2">
                <label className="block text-xs font-semibold text-slate-200">
                  Assigned Security Clearance
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(['Standard', 'Escort Required', 'Level 1 High Security', 'Data Center Restricted'] as SecurityClearance[]).map((clearance) => (
                    <button
                      key={clearance}
                      type="button"
                      onClick={() => setSecurityClearance(clearance)}
                      className={`p-2 rounded-lg text-left text-[11px] font-medium border transition-colors ${
                        securityClearance === clearance
                          ? 'bg-emerald-950/40 border-emerald-500 text-emerald-300 font-semibold'
                          : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      {clearance}
                    </button>
                  ))}
                </div>
              </div>

              {/* Statutory Legal Consent Checkbox */}
              <div className="p-4 bg-slate-950 border border-emerald-900/40 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                    <ShieldCheck className="w-4 h-4" />
                    <span>Nigerian Data Protection Act (NDPA 2023) Legal Declaration</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsConsentModalOpen(true)}
                    className="text-xs text-emerald-400 hover:underline"
                  >
                    Read Full Legal Notice
                  </button>
                </div>

                <label className="flex items-start gap-3 cursor-pointer text-xs text-slate-300">
                  <input
                    type="checkbox"
                    checked={generalConsent}
                    onChange={(e) => setGeneralConsent(e.target.checked)}
                    className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-400"
                  />
                  <span className="leading-relaxed">
                    I declare that the information provided is accurate. I understand and grant lawful consent
                    pursuant to Section 25 of the NDPA 2023 for {NDPA_ORGANIZATION_INFO.companyName} to process
                    my personal data strictly for premises security, emergency evacuation muster, and authorized
                    access control for a maximum retention period of {NDPA_ORGANIZATION_INFO.dataRetentionDays} days.
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-xl flex items-center gap-1.5 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" /> Back
                </button>
                <button
                  type="button"
                  onClick={handleFinalSubmit}
                  className="px-6 py-2.5 bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs rounded-xl shadow-lg flex items-center gap-2 transition-transform active:scale-95"
                >
                  <CheckCircle2 className="w-4 h-4" /> Complete Registration &amp; Print Badge
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Consent Legal Modal */}
      <ConsentNoticeModal
        isOpen={isConsentModalOpen}
        onClose={() => setIsConsentModalOpen(false)}
        onAccept={() => setGeneralConsent(true)}
      />
    </div>
  );
};
