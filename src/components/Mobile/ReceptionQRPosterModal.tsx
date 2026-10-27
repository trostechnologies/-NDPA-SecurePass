/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { QrCode, X, Printer, ExternalLink, Copy, Check, Smartphone, ShieldCheck } from 'lucide-react';
import { NDPA_ORGANIZATION_INFO } from '../../utils/ndpaCompliance';

interface ReceptionQRPosterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenMobileView: () => void;
}

export const ReceptionQRPosterModal: React.FC<ReceptionQRPosterModalProps> = ({
  isOpen,
  onClose,
  onOpenMobileView,
}) => {
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState<boolean>(false);

  // Compute the public shared URL that doesn't require Google authentication
  const getPublicBaseUrl = () => {
    if (typeof window === 'undefined') return 'https://ais-pre-rayw6msee7266veof7o7n5-698969150133.europe-west1.run.app';
    const origin = window.location.origin;
    // Replace ais-dev- with ais-pre- so that it points to the public Shared App URL
    if (origin.includes('ais-dev-')) {
      return origin.replace('ais-dev-', 'ais-pre-');
    }
    return origin;
  };

  const defaultPublicUrl = `${getPublicBaseUrl()}?mode=mobile`;
  const [customUrl, setCustomUrl] = useState<string>(defaultPublicUrl);
  const [isEditingUrl, setIsEditingUrl] = useState<boolean>(false);

  const activeUrl = customUrl.trim() || defaultPublicUrl;

  useEffect(() => {
    if (isOpen) {
      QRCode.toDataURL(activeUrl, {
        width: 240,
        margin: 2,
        color: {
          dark: '#0f172a',
          light: '#ffffff',
        },
      })
        .then(url => setQrDataUrl(url))
        .catch(err => console.error('Failed to generate poster QR:', err));
    }
  }, [isOpen, activeUrl]);

  if (!isOpen) return null;

  const handleCopyUrl = () => {
    navigator.clipboard.writeText(activeUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintStandee = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Top Bar */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/90">
          <div className="flex items-center gap-2">
            <Smartphone className="w-5 h-5 text-emerald-400" />
            <h2 className="text-base font-semibold text-slate-100">
              Reception Desk Mobile Check-In QR
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Printable Standee Area */}
        <div className="p-6 bg-slate-950/60 flex justify-center">
          <div
            id="printable-badge-area"
            className="w-full max-w-[380px] bg-white text-slate-900 rounded-2xl border-2 border-slate-200 shadow-xl p-6 flex flex-col items-center text-center space-y-4"
          >
            {/* Standee Header */}
            <div className="space-y-1">
              <div className="text-[11px] font-bold tracking-widest text-emerald-700 uppercase">
                {NDPA_ORGANIZATION_INFO.companyName}
              </div>
              <h3 className="text-xl font-extrabold text-slate-900 tracking-tight">
                Self Check-In on Your Mobile
              </h3>
              <p className="text-xs text-slate-600 max-w-[280px]">
                Scan with your smartphone camera to register and generate your digital visitor pass.
              </p>
            </div>

            {/* Public Access Badge */}
            <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 text-emerald-800 rounded-full border border-emerald-200 text-[10px] font-bold font-mono">
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span>PUBLIC GUEST ACCESS · NO GOOGLE SIGN-IN</span>
            </div>

            {/* Big Scannable QR Code */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-inner flex flex-col items-center">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt="Scan to check in on mobile"
                  className="w-48 h-48 rounded-lg"
                />
              ) : (
                <div className="w-48 h-48 bg-slate-200 animate-pulse rounded-lg flex items-center justify-center text-xs text-slate-500">
                  Generating QR...
                </div>
              )}
              <div className="mt-2 text-[10px] font-mono font-semibold text-slate-500 uppercase tracking-wider">
                POINT PHONE CAMERA HERE
              </div>
              <div className="mt-1 text-[9px] text-slate-400 font-mono max-w-[300px] truncate">
                {activeUrl}
              </div>
            </div>

            {/* 3 Step Instructions */}
            <div className="w-full grid grid-cols-3 gap-2 text-left pt-2 border-t border-slate-100">
              <div className="text-center">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center mx-auto mb-1">
                  1
                </div>
                <div className="text-[10px] font-medium text-slate-700 leading-tight">
                  Scan QR with Camera
                </div>
              </div>
              <div className="text-center">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center mx-auto mb-1">
                  2
                </div>
                <div className="text-[10px] font-medium text-slate-700 leading-tight">
                  Confirm Details &amp; Consent
                </div>
              </div>
              <div className="text-center">
                <div className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center mx-auto mb-1">
                  3
                </div>
                <div className="text-[10px] font-medium text-slate-700 leading-tight">
                  Get Instant Digital Pass
                </div>
              </div>
            </div>

            {/* NDPA Regulatory Footer */}
            <div className="w-full pt-2 border-t border-slate-100 flex items-center justify-center gap-1.5 text-[9px] text-slate-400 font-mono">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>NDPA 2023 Compliant · NDPC Reg #{NDPA_ORGANIZATION_INFO.ndpcRegistrationNumber}</span>
            </div>
          </div>
        </div>

        {/* URL Configuration Accordion */}
        <div className="px-6 py-3 bg-slate-950/80 border-t border-slate-800 text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-400 font-medium">QR Code Destination Link:</span>
            <button
              type="button"
              onClick={() => setIsEditingUrl(!isEditingUrl)}
              className="text-emerald-400 hover:text-emerald-300 font-mono text-[11px]"
            >
              {isEditingUrl ? 'Close URL Settings' : 'Custom Domain / Edit URL'}
            </button>
          </div>

          {isEditingUrl ? (
            <div className="space-y-2 pt-1 animate-in fade-in">
              <input
                type="text"
                value={customUrl}
                onChange={(e) => setCustomUrl(e.target.value)}
                placeholder="https://..."
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-xs font-mono text-slate-100 focus:outline-none focus:border-emerald-400"
              />
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Directs guests to the public preview (bypasses Google login).</span>
                <button
                  type="button"
                  onClick={() => setCustomUrl(defaultPublicUrl)}
                  className="text-slate-400 hover:text-slate-200 underline"
                >
                  Reset to Default Public URL
                </button>
              </div>
            </div>
          ) : (
            <div className="text-[11px] font-mono text-emerald-400/90 truncate bg-slate-900 px-2.5 py-1.5 rounded border border-slate-800">
              {activeUrl}
            </div>
          )}
        </div>

        {/* Modal Action Controls */}
        <div className="p-5 bg-slate-900 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleCopyUrl}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              <span>{copied ? 'URL Copied!' : 'Copy Mobile Link'}</span>
            </button>
            <button
              type="button"
              onClick={handlePrintStandee}
              className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print Standee</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => {
              onClose();
              onOpenMobileView();
            }}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors shadow-sm"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Open Mobile Check-In Now</span>
          </button>
        </div>
      </div>
    </div>
  );
};
