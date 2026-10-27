/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from 'react';
import { ShieldCheck, X, FileText, CheckCircle2 } from 'lucide-react';
import { NDPA_ORGANIZATION_INFO } from '../../utils/ndpaCompliance';

interface ConsentNoticeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;
}

export const ConsentNoticeModal: React.FC<ConsentNoticeModalProps> = ({
  isOpen,
  onClose,
  onAccept,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-2.5">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
            <div>
              <h2 className="text-base font-semibold text-slate-100">
                NDPA 2023 Statutory Privacy Notice & Consent
              </h2>
              <p className="text-xs text-slate-400">
                Nigeria Data Protection Act 2023 · NDPC Reg: {NDPA_ORGANIZATION_INFO.ndpcRegistrationNumber}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Legal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs text-slate-300 leading-relaxed font-sans">
          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider">
              1. Identity of the Data Controller
            </div>
            <p className="text-slate-400">
              {NDPA_ORGANIZATION_INFO.companyName} (&quot;The Controller&quot;), operating at{' '}
              {NDPA_ORGANIZATION_INFO.facilityName}, {NDPA_ORGANIZATION_INFO.address}. Regulated by the
              Nigeria Data Protection Commission (NDPC).
            </p>
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-100 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-emerald-400" /> 2. Purpose and Lawful Basis of Processing (NDPA Sec 24 &amp; 25)
            </h4>
            <p>
              Your personal data (Full name, official email, phone number, organization, host, and vehicle license plate)
              is collected strictly for premises physical safety, emergency evacuation roll-call, and authorized
              access verification. The lawful bases are:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong>Section 25(1)(a) Consent:</strong> Your unambiguous, informed agreement below.</li>
              <li><strong>Section 25(1)(d) Vital Interests:</strong> Ensuring emergency headcounts in the event of building hazards or fire alarm muster.</li>
              <li><strong>Section 25(1)(b) Legitimate Interests:</strong> Protecting facility infrastructure, confidential work environments, and visitor safety.</li>
            </ul>
          </div>

          <div className="p-3 bg-emerald-950/20 border border-emerald-800/40 rounded-xl space-y-1.5">
            <div className="text-[11px] font-bold text-emerald-300 uppercase tracking-wider">
              3. Biometric Data &amp; Photographic Capture (NDPA Sec 30)
            </div>
            <p className="text-slate-300">
              Under Section 30 of the NDPA 2023, biometric facial photographs are classified as <strong>Sensitive Personal Data</strong>.
              Capturing a badge photo is <strong>strictly optional and voluntary</strong>. You have the statutory right to decline a photo
              without any restriction, delay, or refusal of legitimate facility entry.
            </p>
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-100">4. Retention Schedule &amp; Storage Limitation (NDPA Sec 24(1)(d))</h4>
            <p className="text-slate-400">
              Visitor access records are retained for a maximum duration of <strong>{NDPA_ORGANIZATION_INFO.dataRetentionDays} days</strong> from check-in.
              Upon expiration, all personally identifiable information is irreversibly redacted and anonymized per automated retention schedules.
            </p>
          </div>

          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-slate-100">5. Your Statutory Rights as a Data Subject (NDPA Part VI)</h4>
            <p className="text-slate-400">
              Under Sections 34 to 38 of the NDPA, you possess the right to:
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li><strong>Right of Access (Sec 34):</strong> Request a complete disclosure dossier of your visitor telemetry.</li>
              <li><strong>Right to Rectification (Sec 35):</strong> Request prompt correction of inaccurate visitor details.</li>
              <li><strong>Right to Erasure (Sec 37):</strong> Request deletion/anonymization of your personal data before standard retention expiry.</li>
              <li><strong>Right to Withdraw Consent (Sec 25(3)):</strong> You may withdraw consent at any time without retroactive penalty.</li>
            </ul>
          </div>

          <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1">
            <div className="text-[11px] font-bold text-slate-200">
              Data Protection Officer (DPO) Contact
            </div>
            <p className="text-slate-400">
              {NDPA_ORGANIZATION_INFO.dpoName} · Email: <span className="text-emerald-400">{NDPA_ORGANIZATION_INFO.dpoEmail}</span> · Tel: {NDPA_ORGANIZATION_INFO.dpoPhone}
            </p>
            <p className="text-[11px] text-slate-500 mt-1">
              You also have the statutory right to lodge an inquiry or complaint with the Nigeria Data Protection Commission (NDPC) at ndpc.gov.ng.
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-slate-800 bg-slate-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
          >
            Review Later
          </button>
          <button
            onClick={() => {
              onAccept();
              onClose();
            }}
            className="flex items-center gap-1.5 px-5 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-lg transition-colors shadow-sm"
          >
            <CheckCircle2 className="w-4 h-4" /> Acknowledge &amp; Consent
          </button>
        </div>
      </div>
    </div>
  );
};
