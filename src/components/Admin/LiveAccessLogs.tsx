/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Visitor, VisitorStatus } from '../../types/visitor';
import {
  maskPhoneNumber,
  maskEmail,
  exportVisitorsCSV,
  exportDSARReport,
} from '../../utils/ndpaCompliance';
import {
  Search,
  Download,
  Printer,
  LogOut,
  FileText,
  Trash2,
  Eye,
  EyeOff,
  UserCheck,
  CheckCircle2,
} from 'lucide-react';

interface LiveAccessLogsProps {
  visitors: Visitor[];
  onCheckOut: (visitorId: string) => void;
  onPrintBadge: (visitor: Visitor) => void;
  onErasureRequest: (visitorId: string) => void;
}

export const LiveAccessLogs: React.FC<LiveAccessLogsProps> = ({
  visitors,
  onCheckOut,
  onPrintBadge,
  onErasureRequest,
}) => {
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | VisitorStatus>('all');
  const [maskPII, setMaskPII] = useState<boolean>(true); // Enabled by default for NDPA data protection!
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);

  const filteredVisitors = visitors.filter((v) => {
    const matchesSearch =
      v.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.passCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.organization.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.hostEmployeeName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      v.email.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const activeCount = visitors.filter((v) => v.status === 'checked_in').length;
  const checkedOutCount = visitors.filter((v) => v.status === 'checked_out').length;

  return (
    <div className="space-y-4">
      {/* Top Filter and Controls Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-2xl">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search className="w-4 h-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search by name, pass code, host, company..."
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-400"
          />
        </div>

        {/* Status Filters & Actions */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Segmented Status Selector */}
          <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
            <button
              type="button"
              onClick={() => setStatusFilter('all')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'all'
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              All Records ({visitors.length})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('checked_in')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'checked_in'
                  ? 'bg-emerald-500/20 text-emerald-300 font-semibold shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Active On Premises ({activeCount})
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter('checked_out')}
              className={`px-3 py-1 text-xs font-medium rounded-lg transition-colors whitespace-nowrap ${
                statusFilter === 'checked_out'
                  ? 'bg-slate-800 text-slate-100 shadow-sm'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Checked Out ({checkedOutCount})
            </button>
          </div>

          {/* NDPA Privacy Screen Masking Toggle */}
          <button
            type="button"
            onClick={() => setMaskPII(!maskPII)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-xl border transition-colors whitespace-nowrap ${
              maskPII
                ? 'bg-emerald-950/30 border-emerald-700/60 text-emerald-300'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
            }`}
            title="Toggles front-desk bystander privacy protection per NDPA Section 24"
          >
            {maskPII ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            <span>{maskPII ? 'PII Masking Active' : 'PII Revealed'}</span>
          </button>

          {/* CSV Export */}
          <button
            type="button"
            onClick={() => exportVisitorsCSV(filteredVisitors)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-950 hover:bg-slate-800 border border-slate-800 rounded-xl text-slate-200 transition-colors whitespace-nowrap"
          >
            <Download className="w-3.5 h-3.5" /> Export CSV
          </button>
        </div>
      </div>

      {/* Access Logs Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Visitor &amp; Pass Code</th>
                <th className="py-3 px-4">Contact Telemetry</th>
                <th className="py-3 px-4">Host &amp; Destination</th>
                <th className="py-3 px-4">Entry / Exit Time</th>
                <th className="py-3 px-4">Biometric Status</th>
                <th className="py-3 px-4">Status &amp; Clearance</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-sans">
              {filteredVisitors.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    No visitor records match the current search or status filter.
                  </td>
                </tr>
              ) : (
                filteredVisitors.map((visitor) => {
                  const isCheckedIn = visitor.status === 'checked_in';
                  const displayPhone = maskPII ? maskPhoneNumber(visitor.phone) : visitor.phone;
                  const displayEmail = maskPII ? maskEmail(visitor.email) : visitor.email;

                  return (
                    <tr
                      key={visitor.id}
                      className="hover:bg-slate-800/40 transition-colors group"
                    >
                      {/* Visitor Name & Pass Code */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-full bg-slate-800 flex-shrink-0 overflow-hidden flex items-center justify-center border border-slate-700">
                            {visitor.hasBiometricPhoto && visitor.photoUrl ? (
                              <img
                                src={visitor.photoUrl}
                                alt={visitor.fullName}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                              />
                            ) : (
                              <UserCheck className="w-4 h-4 text-slate-400" />
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                              <span className="truncate">{visitor.fullName}</span>
                              {visitor.isAnonymized && (
                                <span className="text-[9px] font-mono font-bold text-amber-400 bg-amber-950/40 px-1.5 py-0.2 rounded border border-amber-800">
                                  ERASURE APPLIED
                                </span>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 font-mono">
                              {visitor.passCode} · <span className="text-slate-500">{visitor.organization}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Contact Info */}
                      <td className="py-3 px-4 text-slate-300 font-mono text-[11px]">
                        <div>{displayPhone}</div>
                        <div className="text-slate-500">{displayEmail}</div>
                      </td>

                      {/* Host & Destination */}
                      <td className="py-3 px-4">
                        <div className="font-medium text-slate-200">{visitor.hostEmployeeName}</div>
                        <div className="text-[11px] text-slate-400 font-mono">
                          {visitor.hostDepartment}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate max-w-[180px]">
                          {visitor.purpose}
                        </div>
                      </td>

                      {/* Entry & Exit Times */}
                      <td className="py-3 px-4 font-mono text-[11px] tabular-nums">
                        <div className="text-slate-300">
                          In:{' '}
                          {new Date(visitor.checkInTime).toLocaleTimeString('en-GB', {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                        {visitor.checkOutTime ? (
                          <div className="text-slate-500">
                            Out:{' '}
                            {new Date(visitor.checkOutTime).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </div>
                        ) : (
                          <div className="text-emerald-400 font-medium">On Site</div>
                        )}
                      </td>

                      {/* Biometric Status (NDPA Sec 30) */}
                      <td className="py-3 px-4 text-slate-400">
                        {visitor.hasBiometricPhoto ? (
                          <span className="text-[11px] text-emerald-400 font-medium flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Consented Photo
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 flex items-center gap-1">
                            Opt-Out (Sec 30)
                          </span>
                        )}
                      </td>

                      {/* Status & Clearance */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span
                            className={`text-[11px] font-semibold uppercase tracking-wider inline-block ${
                              isCheckedIn ? 'text-emerald-400' : 'text-slate-400'
                            }`}
                          >
                            {isCheckedIn ? '● Checked In' : '○ Checked Out'}
                          </span>
                          <span className="text-[10px] text-slate-400 font-mono">
                            {visitor.securityClearance}
                          </span>
                        </div>
                      </td>

                      {/* Row Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {isCheckedIn && (
                            <button
                              type="button"
                              onClick={() => onCheckOut(visitor.id)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-rose-300 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800 rounded-lg flex items-center gap-1 transition-colors shadow-sm"
                              title="Record visitor departure"
                            >
                              <LogOut className="w-3 h-3" /> Check Out
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => onPrintBadge(visitor)}
                            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Print Badge"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => exportDSARReport(visitor)}
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors"
                            title="Generate NDPA Sec 34 DSAR Access Dossier"
                          >
                            <FileText className="w-3.5 h-3.5" />
                          </button>
                          {!visitor.isAnonymized && (
                            <button
                              type="button"
                              onClick={() => {
                                if (
                                  confirm(
                                    `Execute NDPA Section 37 Right to Erasure for ${visitor.fullName}? All personal identifiable info will be permanently redacted.`
                                  )
                                ) {
                                  onErasureRequest(visitor.id);
                                }
                              }}
                              className="p-1.5 text-slate-500 hover:text-amber-400 hover:bg-slate-800 rounded-lg transition-colors"
                              title="Right to Erasure (NDPA Sec 37)"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
