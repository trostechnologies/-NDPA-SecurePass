/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from 'react';
import QRCode from 'qrcode';
import {
  Visitor,
  HostEmployee,
  PreRegistrationInvite,
  VisitType,
  SecurityClearance,
} from '../../types/visitor';
import {
  generatePassCode,
  generateBadgeId,
  generateWifiCode,
  NDPA_ORGANIZATION_INFO,
} from '../../utils/ndpaCompliance';
import {
  Smartphone,
  ShieldCheck,
  User,
  Building,
  Camera,
  CheckCircle2,
  ArrowLeft,
  ChevronRight,
  Wifi,
  Download,
  Printer,
  Calendar,
  Clock,
  Car,
  Ticket,
  Maximize2,
  SmartphoneNfc,
} from 'lucide-react';

interface MobileSelfCheckInProps {
  hosts: HostEmployee[];
  invitations: PreRegistrationInvite[];
  onCheckInComplete: (newVisitor: Visitor, updatedInviteId?: string) => void;
  onExitMobileView?: () => void;
}

export const MobileSelfCheckIn: React.FC<MobileSelfCheckInProps> = ({
  hosts,
  invitations,
  onCheckInComplete,
  onExitMobileView,
}) => {
  // Mobile device container wrapper toggle (for desktop evaluators)
  const [deviceFrame, setDeviceFrame] = useState<boolean>(false);

  // Flow State
  const [step, setStep] = useState<number>(1);
  const [hasInvite, setHasInvite] = useState<boolean>(false);
  const [inviteCode, setInviteCode] = useState<string>('');
  const [inviteError, setInviteError] = useState<string | null>(null);

  // Visitor fields
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [organization, setOrganization] = useState<string>('');
  const [vehiclePlate, setVehiclePlate] = useState<string>('');
  const [selectedHostId, setSelectedHostId] = useState<string>(hosts[0]?.id || '');
  const [purpose, setPurpose] = useState<string>('Business Meeting & Partnership');
  const [hostSearch, setHostSearch] = useState<string>('');

  // Photo & Biometrics
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [biometricConsent, setBiometricConsent] = useState<boolean>(false);
  const [generalConsent, setGeneralConsent] = useState<boolean>(true);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Issued Digital Pass
  const [issuedPass, setIssuedPass] = useState<Visitor | null>(null);
  const [passQrDataUrl, setPassQrDataUrl] = useState<string>('');

  const selectedHost = hosts.find((h) => h.id === selectedHostId) || hosts[0];

  const filteredHosts = hosts.filter(
    (h) =>
      h.name.toLowerCase().includes(hostSearch.toLowerCase()) ||
      h.department.toLowerCase().includes(hostSearch.toLowerCase())
  );

  // Camera start/stop
  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 480 }, height: { ideal: 480 } },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setCameraActive(true);
    } catch (err) {
      console.warn('Camera failed:', err);
      alert('Camera access could not be opened. You can upload a photo or skip under NDPA Section 30.');
    }
  };

  const takeSnapshot = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth || 480;
      canvas.height = video.videoHeight || 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
        setPhotoUrl(dataUrl);
        setBiometricConsent(true);
      }
      // Stop video track
      const stream = video.srcObject as MediaStream;
      stream?.getTracks().forEach((track) => track.stop());
      setCameraActive(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setPhotoUrl(event.target?.result as string);
        setBiometricConsent(true);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleLookupInvite = () => {
    setInviteError(null);
    const cleaned = inviteCode.trim().toUpperCase();
    const found = invitations.find(
      (inv) => inv.inviteCode.toUpperCase() === cleaned && inv.status === 'pending'
    );
    if (found) {
      setFullName(found.guestName);
      setEmail(found.guestEmail);
      setPhone(found.guestPhone);
      setOrganization(found.guestOrganization);
      setSelectedHostId(found.hostEmployeeId);
      setPurpose(found.purpose);
      setStep(3); // Jump straight to consent & photo!
    } else {
      setInviteError('Invite code not found. Please check code or enter details manually.');
    }
  };

  const handleFinalSubmit = async () => {
    if (!fullName || !email || !phone) {
      alert('Please fill in required fields: Name, Email, and Phone.');
      return;
    }
    if (!generalConsent) {
      alert('Please accept statutory NDPA 2023 processing consent.');
      return;
    }

    const host = hosts.find((h) => h.id === selectedHostId) || hosts[0];
    const newVisitor: Visitor = {
      id: `VIS-MOB-${Date.now()}`,
      passCode: generatePassCode(),
      fullName: fullName.trim(),
      email: email.trim(),
      phone: phone.trim(),
      organization: organization.trim() || 'Independent Visitor',
      hostEmployeeId: host.id,
      hostEmployeeName: host.name,
      hostDepartment: host.department,
      purpose: purpose.trim(),
      visitType: hasInvite ? 'pre_registered' : 'walk_in',
      checkInTime: new Date().toISOString(),
      status: 'checked_in',
      hasBiometricPhoto: Boolean(photoUrl && biometricConsent),
      photoUrl: photoUrl && biometricConsent ? photoUrl : undefined,
      biometricConsentGranted: Boolean(photoUrl && biometricConsent),
      generalConsentGranted: true,
      consentTimestamp: new Date().toISOString(),
      vehiclePlate: vehiclePlate.trim() || undefined,
      badgePrinted: false,
      retentionExpiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 60).toISOString(),
      securityClearance: 'Standard',
      wifiAccessGranted: true,
      wifiCode: generateWifiCode(),
      badgeId: generateBadgeId(),
    };

    onCheckInComplete(newVisitor);
    setIssuedPass(newVisitor);

    // Generate Pass QR Code for mobile screen
    try {
      const qr = await QRCode.toDataURL(
        JSON.stringify({
          t: 'PASS',
          code: newVisitor.passCode,
          id: newVisitor.badgeId,
          name: newVisitor.fullName,
          host: newVisitor.hostEmployeeName,
        }),
        { width: 200, margin: 1 }
      );
      setPassQrDataUrl(qr);
    } catch (e) {
      console.error(e);
    }

    setStep(4); // Digital Pass view!
  };

  // Content of the Mobile Self Check-In UI
  const mobileContent = (
    <div className="bg-slate-950 text-slate-100 min-h-[640px] flex flex-col justify-between">
      {/* Mobile Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-slate-900/95 backdrop-blur-md border-b border-slate-800 px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold text-xs">
            <Smartphone className="w-4 h-4" />
          </div>
          <div>
            <div className="text-[10px] font-mono font-bold text-emerald-400 uppercase tracking-wider">
              MOBILE CHECK-IN
            </div>
            <div className="text-xs font-bold text-slate-100 truncate max-w-[200px]">
              {NDPA_ORGANIZATION_INFO.facilityName}
            </div>
          </div>
        </div>

        {onExitMobileView && (
          <button
            type="button"
            onClick={onExitMobileView}
            className="text-[11px] font-medium text-slate-400 hover:text-slate-200 px-2 py-1 rounded bg-slate-800 transition-colors"
          >
            Admin View
          </button>
        )}
      </header>

      {/* Main Body */}
      <div className="p-4 sm:p-5 flex-1 space-y-4">
        {/* Progress Indicator (if not on final pass) */}
        {step < 4 && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px] font-mono text-slate-400">
              <span>
                {step === 1 && '1. Your Details'}
                {step === 2 && '2. Host & Purpose'}
                {step === 3 && '3. Consent & Photo'}
              </span>
              <span>Step {step} of 3</span>
            </div>
            <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
              <div
                className="bg-emerald-400 h-full transition-all duration-300"
                style={{ width: `${(step / 3) * 100}%` }}
              />
            </div>
          </div>
        )}

        {/* STEP 1: PERSONAL DETAILS */}
        {step === 1 && (
          <div className="space-y-4">
            {/* Invite Option Box */}
            <div className="p-3 bg-slate-900 border border-slate-800 rounded-xl space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                  <Ticket className="w-3.5 h-3.5 text-emerald-400" /> Have an Invitation Code?
                </span>
                <button
                  type="button"
                  onClick={() => setHasInvite(!hasInvite)}
                  className="text-xs text-emerald-400 font-medium"
                >
                  {hasInvite ? 'Enter Manually' : 'Redeem Code'}
                </button>
              </div>

              {hasInvite && (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inviteCode}
                      onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                      placeholder="e.g. INV-7821"
                      className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs font-mono text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
                    />
                    <button
                      type="button"
                      onClick={handleLookupInvite}
                      className="px-3 py-2 bg-emerald-400 text-slate-950 font-bold text-xs rounded-lg whitespace-nowrap"
                    >
                      Verify
                    </button>
                  </div>
                  {inviteError && (
                    <p className="text-[11px] text-amber-400">{inviteError}</p>
                  )}
                </div>
              )}
            </div>

            {/* Form Fields */}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Full Legal Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Amina Bello"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 focus:ring-1 focus:ring-emerald-400 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Mobile Phone Number <span className="text-rose-400">*</span>
                </label>
                <input
                  type="tel"
                  required
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g. +234 803 123 4567"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 min-h-[44px]"
                />
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
                  placeholder="e.g. a.bello@company.com"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">
                  Company / Organization
                </label>
                <input
                  type="text"
                  value={organization}
                  onChange={(e) => setOrganization(e.target.value)}
                  placeholder="e.g. Zenith Bank / MTN Nigeria"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400 min-h-[44px]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1 flex items-center gap-1">
                  <Car className="w-3.5 h-3.5" /> Vehicle Plate (If Driving)
                </label>
                <input
                  type="text"
                  value={vehiclePlate}
                  onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                  placeholder="e.g. EKY-402-AB"
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 font-mono placeholder-slate-500 focus:outline-none focus:border-emerald-400 min-h-[44px]"
                />
              </div>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => {
                  if (!fullName || !email || !phone) {
                    alert('Please enter your Name, Phone Number, and Email.');
                    return;
                  }
                  setStep(2);
                }}
                className="w-full h-12 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-[0.98] transition-transform"
              >
                <span>Continue to Host Selection</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: HOST SELECTION & PURPOSE */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Who are you visiting today?
              </label>

              {/* Host Search */}
              <input
                type="text"
                value={hostSearch}
                onChange={(e) => setHostSearch(e.target.value)}
                placeholder="Search staff name or department..."
                className="w-full px-3 py-2 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 mb-2 focus:outline-none focus:border-emerald-400"
              />

              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {filteredHosts.map((h) => {
                  const isSelected = selectedHostId === h.id;
                  return (
                    <div
                      key={h.id}
                      onClick={() => setSelectedHostId(h.id)}
                      className={`p-3 rounded-xl border flex items-center justify-between cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-emerald-950/40 border-emerald-500 text-slate-100'
                          : 'bg-slate-900 border-slate-800 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
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
                          <p className="text-[10px] text-slate-400 truncate">{h.department}</p>
                          <p className="text-[9px] text-emerald-400 font-mono">{h.floor}</p>
                        </div>
                      </div>
                      {isSelected && (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1">
                Purpose of Visit
              </label>
              <select
                value={purpose}
                onChange={(e) => setPurpose(e.target.value)}
                className="w-full px-3 py-2.5 bg-slate-900 border border-slate-800 rounded-xl text-xs text-slate-200 focus:outline-none focus:border-emerald-400 min-h-[44px]"
              >
                <option value="Business Meeting & Partnership">Business Meeting &amp; Partnership</option>
                <option value="Official Advisory & Consultation">Official Advisory &amp; Consultation</option>
                <option value="Executive Boardroom Briefing">Executive Boardroom Briefing</option>
                <option value="Regulatory Inspection & Audit">Regulatory Inspection &amp; Audit</option>
                <option value="Vendor / Delivery / Contractor">Vendor / Delivery / Contractor</option>
                <option value="Personal Appointment">Personal Appointment</option>
              </select>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="w-1/3 h-12 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-medium text-xs flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={() => setStep(3)}
                className="w-2/3 h-12 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-[0.98] transition-transform"
              >
                <span>Photo &amp; Consent</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: OPTIONAL PHOTO & NDPA CONSENT */}
        {step === 3 && (
          <div className="space-y-4">
            {/* NDPA Section 30 notice */}
            <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl text-xs space-y-1">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4 flex-shrink-0" />
                <span>NDPA 2023 Sec 30: Photo is Optional</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Biometric photos are sensitive personal data. You are free to take a selfie for your badge,
                or skip this step with zero delay.
              </p>
            </div>

            {/* Photo Preview / Camera */}
            <div className="w-full aspect-[4/3] bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden relative flex items-center justify-center">
              {photoUrl ? (
                <div className="relative w-full h-full">
                  <img src={photoUrl} alt="Selfie" className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => setPhotoUrl(null)}
                    className="absolute bottom-2 right-2 px-2.5 py-1 bg-slate-900/80 backdrop-blur-sm text-[11px] text-slate-200 rounded-lg border border-slate-700"
                  >
                    Retake
                  </button>
                </div>
              ) : cameraActive ? (
                <div className="relative w-full h-full bg-black">
                  <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={takeSnapshot}
                    className="absolute bottom-3 left-1/2 -translate-x-1/2 px-4 py-2 bg-emerald-400 text-slate-950 font-bold text-xs rounded-full shadow-lg"
                  >
                    Snap Selfie
                  </button>
                </div>
              ) : (
                <div className="text-center p-4 space-y-2">
                  <Camera className="w-8 h-8 text-slate-500 mx-auto" />
                  <p className="text-xs text-slate-400">Add badge photo (Optional)</p>
                  <div className="flex flex-wrap gap-2 justify-center">
                    <button
                      type="button"
                      onClick={startCamera}
                      className="px-3 py-1.5 bg-emerald-400 text-slate-950 font-semibold text-xs rounded-lg"
                    >
                      Open Camera
                    </button>
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="px-3 py-1.5 bg-slate-800 text-slate-300 text-xs rounded-lg"
                    >
                      Upload
                    </button>
                  </div>
                </div>
              )}
            </div>

            <canvas ref={canvasRef} className="hidden" />
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept="image/*"
              className="hidden"
            />

            {/* Consent Checkbox */}
            <label className="flex items-start gap-2.5 p-3 bg-slate-900 border border-slate-800 rounded-xl cursor-pointer text-[11px] text-slate-300">
              <input
                type="checkbox"
                checked={generalConsent}
                onChange={(e) => setGeneralConsent(e.target.checked)}
                className="mt-0.5 rounded border-slate-700 text-emerald-500 focus:ring-emerald-400"
              />
              <span className="leading-relaxed">
                I agree to the processing of my visitor telemetry under NDPA 2023 Section 25 for physical facility
                security for {NDPA_ORGANIZATION_INFO.dataRetentionDays} days.
              </span>
            </label>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="w-1/3 h-12 rounded-xl bg-slate-900 border border-slate-800 text-slate-300 font-medium text-xs flex items-center justify-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" /> Back
              </button>
              <button
                type="button"
                onClick={handleFinalSubmit}
                className="w-2/3 h-12 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 shadow-lg active:scale-[0.98] transition-transform"
              >
                <CheckCircle2 className="w-4 h-4" /> Check In &amp; Get Pass
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: DIGITAL VISITOR PASS (WALLET PASS AESTHETIC) */}
        {step === 4 && issuedPass && (
          <div className="space-y-4 animate-in fade-in zoom-in-95">
            {/* Apple Wallet Style Digital Pass Card */}
            <div className="w-full bg-gradient-to-b from-slate-900 to-slate-950 border border-emerald-500/40 rounded-3xl p-5 shadow-2xl relative overflow-hidden space-y-4">
              {/* Card Header */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <div className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase">
                    DIGITAL VISITOR PASS
                  </div>
                  <div className="text-xs font-semibold text-slate-200">
                    {NDPA_ORGANIZATION_INFO.companyName}
                  </div>
                </div>
                <div className="text-right">
                  <span className="text-[9px] font-mono font-bold text-emerald-300 bg-emerald-950/80 px-2 py-0.5 rounded border border-emerald-700">
                    PASS ACTIVE
                  </span>
                </div>
              </div>

              {/* Name & Photo */}
              <div className="flex items-center gap-3">
                <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 overflow-hidden flex items-center justify-center flex-shrink-0">
                  {issuedPass.hasBiometricPhoto && issuedPass.photoUrl ? (
                    <img
                      src={issuedPass.photoUrl}
                      alt={issuedPass.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-7 h-7 text-slate-400" />
                  )}
                </div>
                <div className="min-w-0">
                  <h3 className="text-lg font-bold text-white truncate leading-snug">
                    {issuedPass.fullName}
                  </h3>
                  <p className="text-xs text-slate-400 truncate">{issuedPass.organization}</p>
                  <div className="text-[11px] font-mono text-emerald-400 mt-1">
                    Pass: <strong>{issuedPass.passCode}</strong>
                  </div>
                </div>
              </div>

              {/* Destination Details */}
              <div className="p-3 bg-slate-950/70 border border-slate-800/80 rounded-2xl text-xs space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Host Person:</span>
                  <strong className="text-slate-200">{issuedPass.hostEmployeeName}</strong>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Floor:</span>
                  <span className="text-slate-200 font-mono">{selectedHost?.floor}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Clearance:</span>
                  <span className="text-slate-300">{issuedPass.securityClearance}</span>
                </div>
              </div>

              {/* Dynamic QR Code for Turnstile Scanning */}
              <div className="p-4 bg-white text-slate-900 rounded-2xl flex flex-col items-center justify-center space-y-1 shadow-md">
                {passQrDataUrl ? (
                  <img src={passQrDataUrl} alt="Pass QR" className="w-36 h-36" />
                ) : (
                  <div className="w-36 h-36 bg-slate-100 flex items-center justify-center text-xs">
                    QR Ready
                  </div>
                )}
                <span className="text-[9px] font-mono font-bold tracking-wider text-slate-500">
                  HOLD NEAR TURNSTILE SCANNER
                </span>
              </div>

              {/* Guest Wi-Fi */}
              {issuedPass.wifiAccessGranted && (
                <div className="p-2.5 bg-slate-900/90 border border-slate-800 rounded-xl flex items-center justify-between text-xs">
                  <div className="flex items-center gap-2">
                    <Wifi className="w-4 h-4 text-emerald-400" />
                    <div>
                      <div className="text-[10px] text-slate-400">Guest Wi-Fi (SSID: Zenith-Guest)</div>
                      <div className="font-mono text-slate-200 font-semibold">{issuedPass.wifiCode}</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Mobile Actions */}
            <div className="space-y-2 pt-2">
              <button
                type="button"
                onClick={() => window.print()}
                className="w-full h-12 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold text-xs flex items-center justify-center gap-2"
              >
                <Printer className="w-4 h-4" /> Print / Save Pass as PDF
              </button>

              <button
                type="button"
                onClick={() => {
                  setStep(1);
                  setIssuedPass(null);
                  setFullName('');
                  setEmail('');
                  setPhone('');
                  setOrganization('');
                  setPhotoUrl(null);
                }}
                className="w-full py-2.5 text-center text-xs text-slate-400 hover:text-slate-200"
              >
                Register Another Visitor
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Sticky Regulatory Badge */}
      <footer className="p-3 border-t border-slate-900 text-center text-[10px] text-slate-500 font-mono">
        Nigeria Data Protection Act (NDPA 2023) Verified · Reg: {NDPA_ORGANIZATION_INFO.ndpcRegistrationNumber}
      </footer>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Viewport mode toggle bar (allows testing on desktop in realistic mobile bezel or full-width) */}
      <div className="flex items-center justify-between p-3 bg-slate-900 border border-slate-800 rounded-xl text-xs">
        <div className="flex items-center gap-2 text-slate-300">
          <SmartphoneNfc className="w-4 h-4 text-emerald-400" />
          <span>Mobile Self Check-In Page (Accessible via Reception QR code)</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setDeviceFrame(!deviceFrame)}
            className="flex items-center gap-1 px-2.5 py-1 text-[11px] rounded bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
          >
            <Maximize2 className="w-3 h-3" />
            <span>{deviceFrame ? 'Full Screen View' : 'Simulate Phone Frame'}</span>
          </button>
        </div>
      </div>

      {deviceFrame ? (
        <div className="py-6 flex justify-center bg-slate-950/70 rounded-2xl border border-slate-900">
          {/* Simulated Smartphone Bezel */}
          <div className="w-full max-w-[400px] bg-slate-950 rounded-[40px] border-4 border-slate-800 shadow-2xl p-2 overflow-hidden ring-1 ring-slate-700/50">
            {/* Phone Speaker Notch */}
            <div className="w-28 h-4 bg-slate-800 rounded-full mx-auto mb-2" />
            <div className="rounded-[32px] overflow-hidden border border-slate-800">
              {mobileContent}
            </div>
          </div>
        </div>
      ) : (
        <div className="max-w-xl mx-auto rounded-2xl border border-slate-800 overflow-hidden shadow-2xl">
          {mobileContent}
        </div>
      )}
    </div>
  );
};
