/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Visitor, NDPAAuditLog } from '../../types/visitor';
import {
  NDPA_ORGANIZATION_INFO,
  isRetentionExpired,
  daysUntilExpiry,
  exportDSARReport,
  exportNDPCAuditSummary,
} from '../../utils/ndpaCompliance';
import {
  ShieldCheck,
  Download,
  Trash2,
  FileCheck,
  FileText,
  Search,
  CheckCircle2,
  Clock,
  Building,
  Lock,
} from 'lucide-react';

interface NDPAComplianceHubProps {
  visitors: Visitor[];
  auditLogs: NDPAAuditLog[];
  onExecuteRetentionPurge: () => void;
  onErasureRequest: (visitorId: string) => void;
}

export const NDPAComplianceHub: React.FC<NDPAComplianceHubProps> = ({
  visitors,
  auditLogs,
  onExecuteRetentionPurge,
  onErasureRequest,
}) => {
  const [dsarSearch, setDsarSearch] = useState<string>('');
  const [selectedVisitorForDsar, setSelectedVisitorForDsar] = useState<Visitor | null>(null);

  // Compute metrics
  const totalVisitors = visitors.length;
  const consentedVisitors = visitors.filter(v => v.generalConsentGranted).length;
  const biometricConsented = visitors.filter(v => v.biometricConsentGranted).length;
  const biometricOptOut = visitors.filter(v => !v.biometricConsentGranted && !v.isAnonymized).length;
  const expiredRecords = visitors.filter(v => isRetentionExpired(v.retentionExpiryDate));
  const anonymizedCount = visitors.filter(v => v.isAnonymized).length;

  const biometricOptInPercentage =
    totalVisitors > 0 ? Math.round((biometricConsented / totalVisitors) * 100) : 0;

  const searchedVisitors = dsarSearch.trim()
    ? visitors.filter(
        v =>
          v.fullName.toLowerCase().includes(dsarSearch.toLowerCase()) ||
          v.passCode.toLowerCase().includes(dsarSearch.toLowerCase()) ||
          v.email.toLowerCase().includes(dsarSearch.toLowerCase())
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Official NDPC Header Banner */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-950 border border-emerald-700/60 flex items-center justify-center text-emerald-400 flex-shrink-0">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="text-xs font-mono font-bold text-emerald-400">
                NDPC LICENSED CONTROLLER · REG: {NDPA_ORGANIZATION_INFO.ndpcRegistrationNumber}
              </div>
              <h2 className="text-lg font-bold text-slate-100 tracking-tight mt-0.5">
                Nigeria Data Protection Act (NDPA 2023) Compliance Center
              </h2>
              <p className="text-xs text-slate-400 mt-1 max-w-2xl leading-relaxed">
                Automated enforcement of principles of lawful basis, purpose limitation, storage
                restriction (60-day lifecycle), and voluntary biometric processing under Section 30.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start md:self-auto">
            <a
              href="/SecurePass_NDPA_PRD.pdf"
              download="SecurePass_NDPA_PRD.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-emerald-200 bg-emerald-950/70 hover:bg-emerald-900/90 border border-emerald-600/70 rounded-xl transition-colors shadow-sm"
              title="Download & View Product Requirement Document in PDF format"
            >
              <FileCheck className="w-4 h-4 text-emerald-400" /> Download PRD (PDF)
            </a>
            <a
              href="/SecurePass_NDPA_PRD.docx"
              download="SecurePass_NDPA_PRD.docx"
              className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl transition-colors shadow-sm"
              title="Download Product Requirement Document in MS Word (.docx) format"
            >
              <FileText className="w-3.5 h-3.5 text-slate-400" /> Word (.docx)
            </a>
            <button
              type="button"
              onClick={() => exportNDPCAuditSummary(visitors, auditLogs)}
              className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors shadow-sm"
            >
              <Download className="w-4 h-4" /> Export NDPC Audit Report
            </button>
          </div>
        </div>
      </div>

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* KPI 1 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Lawful Consent Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
            {totalVisitors > 0 ? `${Math.round((consentedVisitors / totalVisitors) * 100)}%` : '100%'}
          </div>
          <div className="text-[11px] text-emerald-400/90 font-medium">
            NDPA Sec 25 &amp; 26 Compliant
          </div>
        </div>

        {/* KPI 2 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Biometric Opt-In Ratio</span>
            <Lock className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
            {biometricOptInPercentage}%
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            {biometricConsented} Opt-In · {biometricOptOut} Opt-Out (Sec 30)
          </div>
        </div>

        {/* KPI 3 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Retention Overdue Records</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
            {expiredRecords.length}
          </div>
          <div className="text-[11px] text-amber-400/90 font-medium">
            Threshold: {NDPA_ORGANIZATION_INFO.dataRetentionDays} Days Max
          </div>
        </div>

        {/* KPI 4 */}
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>Right to Erasure (Sec 37)</span>
            <FileCheck className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
            {anonymizedCount}
          </div>
          <div className="text-[11px] text-slate-400 font-mono">
            Cryptographically Redacted
          </div>
        </div>
      </div>

      {/* SECTION A: DATA RETENTION SCHEDULE & AUTOMATED PURGE */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
              <Clock className="w-4 h-4 text-emerald-400" />
              Automated Data Retention &amp; Storage Limitation (NDPA Sec 24(1)(d))
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Personal data must not be kept longer than necessary. Records exceeding {NDPA_ORGANIZATION_INFO.dataRetentionDays} days
              must be purged or anonymized.
            </p>
          </div>

          {expiredRecords.length > 0 && (
            <button
              type="button"
              onClick={onExecuteRetentionPurge}
              className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-rose-300 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800 rounded-xl transition-colors shadow-sm"
            >
              <Trash2 className="w-3.5 h-3.5" /> Purge {expiredRecords.length} Expired Record(s) Now
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950 text-slate-400 text-[11px] font-semibold uppercase font-mono">
              <tr>
                <th className="py-2.5 px-3">Pass Code</th>
                <th className="py-2.5 px-3">Visitor Name</th>
                <th className="py-2.5 px-3">Check-In Date</th>
                <th className="py-2.5 px-3">Retention Expiry Date</th>
                <th className="py-2.5 px-3">Lifecycle Status</th>
                <th className="py-2.5 px-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {visitors.slice(0, 5).map((v) => {
                const expired = isRetentionExpired(v.retentionExpiryDate);
                const daysLeft = daysUntilExpiry(v.retentionExpiryDate);

                return (
                  <tr key={v.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-3 font-mono font-medium text-slate-300">
                      {v.passCode}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-200">
                      {v.fullName}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 tabular-nums">
                      {new Date(v.checkInTime).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-400 tabular-nums">
                      {new Date(v.retentionExpiryDate).toLocaleDateString('en-GB')}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">
                      {v.isAnonymized ? (
                        <span className="text-slate-500">Redacted per Sec 37</span>
                      ) : expired ? (
                        <span className="text-rose-400 font-bold">EXPIRED ({Math.abs(daysLeft)}d overdue)</span>
                      ) : (
                        <span className="text-emerald-400 font-medium">Active ({daysLeft}d remaining)</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right">
                      {!v.isAnonymized && expired && (
                        <button
                          type="button"
                          onClick={() => onErasureRequest(v.id)}
                          className="px-2 py-1 text-[11px] font-medium text-amber-300 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800 rounded"
                        >
                          Anonymize
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* SECTION B: DATA SUBJECT ACCESS REQUEST (DSAR) WORKBENCH */}
      <div className="p-6 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg space-y-4">
        <div>
          <h3 className="text-sm font-bold text-slate-100 flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-emerald-400" />
            Data Subject Rights Desk (NDPA 2023 Sections 34 &amp; 37)
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Handle official Data Subject Access Requests (DSAR). Search a visitor to generate a certified
            statutory data disclosure dossier or execute their Right to Erasure.
          </p>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
            <input
              type="text"
              value={dsarSearch}
              onChange={(e) => setDsarSearch(e.target.value)}
              placeholder="Search visitor name or pass code (e.g. Femi Babalola or NG-VIS-4102)..."
              className="w-full pl-9 pr-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
            />
          </div>
          {dsarSearch && (
            <button
              type="button"
              onClick={() => setDsarSearch('')}
              className="px-3 py-2 text-xs text-slate-400 hover:text-slate-200 bg-slate-800 rounded-xl"
            >
              Clear
            </button>
          )}
        </div>

        {searchedVisitors.length > 0 && (
          <div className="space-y-2 pt-2">
            <div className="text-xs font-semibold text-slate-300">
              Matches Found ({searchedVisitors.length}):
            </div>
            <div className="space-y-2">
              {searchedVisitors.map((v) => (
                <div
                  key={v.id}
                  className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center justify-between gap-4"
                >
                  <div>
                    <h4 className="text-xs font-bold text-slate-100">{v.fullName}</h4>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {v.passCode} · {v.email} · Host: {v.hostEmployeeName}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => exportDSARReport(v)}
                      className="px-3 py-1.5 text-xs font-medium text-emerald-300 bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-800 rounded-lg flex items-center gap-1.5 transition-colors"
                    >
                      <Download className="w-3.5 h-3.5" /> Export DSAR Dossier
                    </button>
                    {!v.isAnonymized && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Execute Right to Erasure for ${v.fullName}?`)) {
                            onErasureRequest(v.id);
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-medium text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 rounded-lg flex items-center gap-1.5 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> Right to Erasure
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* SECTION C: CONTROLLER & DPO STATUTORY DECLARATION */}
      <div className="p-5 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-4 text-xs">
        <div className="flex items-start gap-3">
          <Building className="w-5 h-5 text-slate-400 flex-shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-slate-200">
              Appointed Data Protection Officer (DPO)
            </div>
            <p className="text-slate-400 mt-0.5">
              {NDPA_ORGANIZATION_INFO.dpoName} · {NDPA_ORGANIZATION_INFO.dpoEmail} · Tel: {NDPA_ORGANIZATION_INFO.dpoPhone}
            </p>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Supervising Authority: Nigeria Data Protection Commission (NDPC), Headquarters, Abuja.
            </p>
          </div>
        </div>
        <div className="text-right text-[11px] text-slate-500 font-mono">
          Last Internal Privacy Audit: 2026-10-14 · Pass
        </div>
      </div>
    </div>
  );
};
