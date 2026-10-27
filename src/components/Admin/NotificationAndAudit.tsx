/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { EmailNotification, NDPAAuditLog } from '../../types/visitor';
import {
  Mail,
  FileText,
  Send,
  CheckCircle2,
  Clock,
  Shield,
  Eye,
  X,
  Building,
} from 'lucide-react';

interface NotificationAndAuditProps {
  notifications: EmailNotification[];
  auditLogs: NDPAAuditLog[];
  onSendTestNotification: () => void;
}

export const NotificationAndAudit: React.FC<NotificationAndAuditProps> = ({
  notifications,
  auditLogs,
  onSendTestNotification,
}) => {
  const [activeSubTab, setActiveSubTab] = useState<'notifications' | 'audit'>('notifications');
  const [selectedEmail, setSelectedEmail] = useState<EmailNotification | null>(null);

  return (
    <div className="space-y-6">
      {/* Sub-navigation Switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
        <div className="flex items-center gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
          <button
            type="button"
            onClick={() => setActiveSubTab('notifications')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeSubTab === 'notifications'
                ? 'bg-slate-800 text-slate-100 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Mail className="w-3.5 h-3.5 text-emerald-400" /> Dispatched Notifications ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setActiveSubTab('audit')}
            className={`px-3.5 py-1.5 text-xs font-medium rounded-lg transition-colors flex items-center gap-1.5 ${
              activeSubTab === 'audit'
                ? 'bg-slate-800 text-slate-100 font-semibold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Shield className="w-3.5 h-3.5 text-emerald-400" /> Immutable NDPA Audit Trail ({auditLogs.length})
          </button>
        </div>

        {activeSubTab === 'notifications' && (
          <button
            type="button"
            onClick={onSendTestNotification}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-950 bg-emerald-400 hover:bg-emerald-300 rounded-xl transition-colors shadow-sm self-start sm:self-auto"
          >
            <Send className="w-3.5 h-3.5" /> Dispatch Test Host Alert
          </button>
        )}
      </div>

      {/* SUB-TAB 1: EMAIL NOTIFICATIONS */}
      {activeSubTab === 'notifications' && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {notifications.map((notif) => (
              <div
                key={notif.id}
                onClick={() => setSelectedEmail(notif)}
                className="p-4 bg-slate-900 border border-slate-800 hover:border-slate-700 rounded-2xl space-y-2.5 cursor-pointer transition-colors shadow-md group"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400 bg-emerald-950/60 px-2 py-0.5 rounded border border-emerald-800">
                    {notif.type.replace(/_/g, ' ')}
                  </span>
                  <span className="text-[11px] text-slate-500 font-mono">
                    {new Date(notif.sentAt).toLocaleTimeString('en-GB', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-100 group-hover:text-emerald-300 transition-colors">
                    {notif.subject}
                  </h4>
                  <p className="text-[11px] text-slate-400 line-clamp-2 mt-1">
                    {notif.bodyPreview}
                  </p>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500">
                  <span>To: <strong className="text-slate-300">{notif.recipientName}</strong> ({notif.recipientEmail})</span>
                  <span className="flex items-center gap-1 text-emerald-400">
                    <CheckCircle2 className="w-3 h-3" /> {notif.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SUB-TAB 2: NDPA IMMUTABLE AUDIT TRAIL */}
      {activeSubTab === 'audit' && (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 text-[11px] font-semibold uppercase tracking-wider font-mono">
                <tr>
                  <th className="py-3 px-4">Timestamp</th>
                  <th className="py-3 px-4">System Actor</th>
                  <th className="py-3 px-4">Action</th>
                  <th className="py-3 px-4">Lawful Basis (NDPA 2023)</th>
                  <th className="py-3 px-4">Telemetry Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-sans">
                {auditLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-800/30">
                    <td className="py-2.5 px-4 font-mono text-[11px] text-slate-400 tabular-nums whitespace-nowrap">
                      {new Date(log.timestamp).toLocaleString('en-GB')}
                    </td>
                    <td className="py-2.5 px-4 font-medium text-slate-200 whitespace-nowrap">
                      {log.actor}
                    </td>
                    <td className="py-2.5 px-4">
                      <span className="font-mono text-[11px] font-bold text-emerald-400">
                        {log.action}
                      </span>
                    </td>
                    <td className="py-2.5 px-4 text-slate-300 font-mono text-[11px]">
                      <div>{log.lawfulBasis}</div>
                      <div className="text-[10px] text-slate-500">{log.complianceArticle}</div>
                    </td>
                    <td className="py-2.5 px-4 text-slate-400 text-[11px] max-w-xs truncate">
                      {log.details}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* EMAIL PREVIEW MODAL */}
      {selectedEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
          <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-6 space-y-4 animate-in fade-in">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold text-xs">
                <Mail className="w-4 h-4" />
                <span>Simulated Enterprise Dispatch (SMTP/SES)</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedEmail(null)}
                className="p-1 text-slate-400 hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl space-y-1 text-xs">
              <div>
                <span className="text-slate-500">From:</span>{' '}
                <span className="text-slate-300">reception-alerts@zenithholdings.ng</span>
              </div>
              <div>
                <span className="text-slate-500">To:</span>{' '}
                <strong className="text-slate-200">{selectedEmail.recipientName}</strong>{' '}
                <span className="text-slate-400 font-mono">&lt;{selectedEmail.recipientEmail}&gt;</span>
              </div>
              <div>
                <span className="text-slate-500">Subject:</span>{' '}
                <span className="text-slate-100 font-bold">{selectedEmail.subject}</span>
              </div>
              <div>
                <span className="text-slate-500">Delivered:</span>{' '}
                <span className="text-slate-400 font-mono">
                  {new Date(selectedEmail.sentAt).toLocaleString('en-GB')}
                </span>
              </div>
            </div>

            <div className="p-4 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed space-y-3 font-sans">
              <p>{selectedEmail.bodyPreview}</p>
              <div className="pt-3 border-t border-slate-800/80 text-[11px] text-slate-500">
                This automated transmission is delivered via SecurePass Enterprise in accordance with
                Nigerian Data Protection Act (NDPA 2023) premises governance guidelines.
              </div>
            </div>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setSelectedEmail(null)}
                className="px-4 py-2 bg-slate-800 text-slate-200 hover:bg-slate-700 text-xs font-medium rounded-xl transition-colors"
              >
                Close Preview
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
