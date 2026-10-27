/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Visitor } from '../../types/visitor';
import { Printer, Download, X, ShieldCheck, Wifi, UserCheck, Calendar, Clock, Building2 } from 'lucide-react';
import { NDPA_ORGANIZATION_INFO } from '../../utils/ndpaCompliance';

interface VisitorBadgeModalProps {
  visitor: Visitor | null;
  isOpen: boolean;
  onClose: () => void;
}

export const VisitorBadgeModal: React.FC<VisitorBadgeModalProps> = ({ visitor, isOpen, onClose }) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');

  useEffect(() => {
    if (visitor) {
      const payload = JSON.stringify({
        v: 'NDPA-2023',
        code: visitor.passCode,
        id: visitor.badgeId,
        name: visitor.fullName,
        host: visitor.hostEmployeeName,
        time: visitor.checkInTime,
        clearance: visitor.securityClearance,
      });

      QRCode.toDataURL(payload, {
        width: 140,
        margin: 1,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('QR code generation error:', err));
    }
  }, [visitor]);

  if (!isOpen || !visitor) return null;

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const jsonStr = JSON.stringify(visitor, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Visitor_Badge_${visitor.passCode}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formattedDate = new Date(visitor.checkInTime).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  const formattedTime = new Date(visitor.checkInTime).toLocaleTimeString('en-GB', {
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header Modal Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">Enterprise Visitor Pass</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
            aria-label="Close pass view"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Badge Area (Printed on window.print()) */}
        <div className="p-6 flex justify-center bg-slate-950/50">
          <div
            id="printable-badge-area"
            className="w-full max-w-[360px] bg-white text-slate-900 rounded-xl border border-slate-300 shadow-md p-5 flex flex-col justify-between"
          >
            {/* Badge Card Header */}
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <div>
                  <div className="text-[11px] font-bold tracking-wider text-slate-500 uppercase">
                    {NDPA_ORGANIZATION_INFO.facilityName}
                  </div>
                  <div className="text-xs font-semibold text-slate-800">
                    {NDPA_ORGANIZATION_INFO.companyName}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    NDPA VERIFIED
                  </div>
                  <div className="text-[9px] text-slate-400 mt-0.5 font-mono">
                    {NDPA_ORGANIZATION_INFO.ndpcRegistrationNumber}
                  </div>
                </div>
              </div>

              {/* Clearance Ribbon */}
              <div className="mt-3 flex items-center justify-between">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 bg-slate-100 px-2.5 py-0.5 rounded">
                  {visitor.visitType.replace('_', ' ')}
                </span>
                <span className="text-[11px] font-mono font-bold text-slate-700">
                  {visitor.badgeId}
                </span>
              </div>

              {/* Photo & Identity Section */}
              <div className="mt-4 flex gap-4 items-center">
                <div className="w-20 h-24 rounded-lg bg-slate-100 border border-slate-200 flex-shrink-0 overflow-hidden flex flex-col items-center justify-center text-center p-1">
                  {visitor.hasBiometricPhoto && visitor.photoUrl ? (
                    <img
                      src={visitor.photoUrl}
                      alt={visitor.fullName}
                      className="w-full h-full object-cover rounded"
                      referrerPolicy="no-referrer"
                    />
                  ) : (
                    <div className="flex flex-col items-center justify-center text-slate-400 h-full">
                      <UserCheck className="w-8 h-8 text-slate-400 mb-1" />
                      <span className="text-[8px] font-medium leading-tight text-slate-500">
                        {visitor.biometricConsentGranted ? 'NO PHOTO' : 'NDPA SEC 30 OPT-OUT'}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="text-lg font-bold text-slate-900 leading-snug truncate">
                    {visitor.fullName}
                  </h3>
                  <p className="text-xs text-slate-600 font-medium truncate mt-0.5">
                    {visitor.organization || 'Independent Visitor'}
                  </p>
                  <div className="mt-2 text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">Pass Code:</span>{' '}
                    <span className="font-mono font-bold text-slate-900">{visitor.passCode}</span>
                  </div>
                  <div className="text-[11px] text-slate-500">
                    <span className="font-semibold text-slate-700">Clearance:</span>{' '}
                    <span className="font-medium text-slate-800">{visitor.securityClearance}</span>
                  </div>
                </div>
              </div>

              {/* Host & Visit Details */}
              <div className="mt-4 pt-3 border-t border-slate-100 text-xs space-y-1.5">
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-500 font-medium flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5" /> Host:
                  </span>
                  <span className="font-semibold text-slate-800 text-right truncate max-w-[200px]">
                    {visitor.hostEmployeeName}
                  </span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-500 font-medium">Department:</span>
                  <span className="text-slate-700">{visitor.hostDepartment}</span>
                </div>
                <div className="flex items-center justify-between text-slate-600">
                  <span className="text-slate-500 font-medium">Purpose:</span>
                  <span className="text-slate-700 truncate max-w-[200px]">{visitor.purpose}</span>
                </div>
              </div>
            </div>

            {/* Bottom QR & Guest Wi-Fi */}
            <div className="mt-4 pt-3 border-t border-slate-200">
              <div className="flex items-center justify-between gap-3">
                <div className="flex-1">
                  <div className="flex items-center gap-1 text-[11px] font-semibold text-slate-700">
                    <Calendar className="w-3 h-3 text-slate-500" /> {formattedDate}
                    <Clock className="w-3 h-3 text-slate-500 ml-2" /> {formattedTime}
                  </div>
                  {visitor.wifiAccessGranted && (
                    <div className="mt-2 p-1.5 bg-slate-50 border border-slate-200 rounded text-[10px] text-slate-600">
                      <div className="flex items-center gap-1 font-semibold text-slate-800">
                        <Wifi className="w-3 h-3 text-emerald-600" /> Guest Wi-Fi
                      </div>
                      <div className="font-mono text-slate-700 mt-0.5">
                        {visitor.wifiCode || 'ZENITH-GUEST-ACCESS'}
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col items-center">
                  {qrDataUrl ? (
                    <img src={qrDataUrl} alt="Visitor QR" className="w-20 h-20 rounded border border-slate-200" />
                  ) : (
                    <div className="w-20 h-20 bg-slate-100 flex items-center justify-center text-[10px] text-slate-400">
                      QR Code
                    </div>
                  )}
                  <span className="text-[8px] font-mono text-slate-400 mt-0.5">SCAN FOR EXIT</span>
                </div>
              </div>

              {/* NDPA Footnote */}
              <div className="mt-3 pt-2 border-t border-slate-100 text-[8px] text-slate-400 text-center leading-tight">
                Issued in compliance with Nigeria Data Protection Act (NDPA 2023). Must be worn visibly at all times and surrendered upon departure.
              </div>
            </div>
          </div>
        </div>

        {/* Actions Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900">
          <div className="text-xs text-slate-400">
            Thermal or A4 Avery printer ready
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-lg transition-colors"
            >
              <Download className="w-4 h-4" /> Export Token
            </button>
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors shadow-sm"
            >
              <Printer className="w-4 h-4" /> Print Badge
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
