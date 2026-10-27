/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from 'react';
import { Visitor } from '../../types/visitor';
import { NDPA_ORGANIZATION_INFO } from '../../utils/ndpaCompliance';
import { AlertTriangle, Printer, CheckSquare, Square, Building2, Phone, ShieldAlert } from 'lucide-react';

interface EmergencyMusterListProps {
  visitors: Visitor[];
}

export const EmergencyMusterList: React.FC<EmergencyMusterListProps> = ({ visitors }) => {
  // Only visitors currently on site
  const activeVisitors = visitors.filter((v) => v.status === 'checked_in');
  const [accountedIds, setAccountedIds] = useState<Set<string>>(new Set());

  const toggleAccounted = (id: string) => {
    setAccountedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handlePrint = () => {
    window.print();
  };

  // Group by floor / department
  const groupedByDept = activeVisitors.reduce<Record<string, Visitor[]>>((acc, v) => {
    const key = v.hostDepartment || 'General Areas';
    if (!acc[key]) acc[key] = [];
    acc[key].push(v);
    return acc;
  }, {});

  const totalActive = activeVisitors.length;
  const totalAccounted = activeVisitors.filter(v => accountedIds.has(v.id)).length;

  return (
    <div className="space-y-6">
      {/* Alert Header */}
      <div className="p-6 bg-rose-950/30 border border-rose-900/60 rounded-2xl shadow-lg flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-rose-950 border border-rose-700 flex items-center justify-center text-rose-400 flex-shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="text-[11px] font-mono font-bold text-rose-400">
              LIFE SAFETY &amp; EMERGENCIES · NDPA SEC 25(1)(d) VITAL INTEREST
            </div>
            <h2 className="text-lg font-bold text-slate-100 tracking-tight mt-0.5">
              Live Building Evacuation &amp; Muster Roll-Call
            </h2>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Real-time manifest of all visitors currently verified inside {NDPA_ORGANIZATION_INFO.facilityName}.
              Use during emergency evacuations to verify all visitors at Muster Points A &amp; B.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold text-slate-950 bg-rose-400 hover:bg-rose-300 rounded-xl transition-colors shadow-sm"
          >
            <Printer className="w-4 h-4" /> Print Muster Sheet
          </button>
        </div>
      </div>

      {/* Progress Counter */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <span className="text-xs text-slate-400">Total Visitors on Premises</span>
          <div className="text-2xl font-bold font-mono text-slate-100 tabular-nums">
            {totalActive}
          </div>
          <span className="text-[11px] text-slate-500">Active checked-in badges</span>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <span className="text-xs text-slate-400">Accounted for at Safe Muster Point</span>
          <div className="text-2xl font-bold font-mono text-emerald-400 tabular-nums">
            {totalAccounted}
          </div>
          <span className="text-[11px] text-emerald-400/80 font-mono">
            {totalActive > 0 ? `${Math.round((totalAccounted / totalActive) * 100)}% Verified` : 'Clear'}
          </span>
        </div>

        <div className="p-4 bg-slate-900 border border-slate-800 rounded-xl space-y-1">
          <span className="text-xs text-slate-400">Pending Headcount</span>
          <div className="text-2xl font-bold font-mono text-rose-400 tabular-nums">
            {totalActive - totalAccounted}
          </div>
          <span className="text-[11px] text-rose-400/80">Search required</span>
        </div>
      </div>

      {/* Roster grouped by Host Department */}
      <div className="space-y-4">
        {totalActive === 0 ? (
          <div className="p-12 text-center bg-slate-900 border border-slate-800 rounded-2xl text-slate-400">
            <p className="text-sm font-medium">All visitors have checked out.</p>
            <p className="text-xs text-slate-500 mt-1">Zero visitors currently logged in the facility.</p>
          </div>
        ) : (
          Object.entries(groupedByDept).map(([dept, visitorsInDept]) => (
            <div
              key={dept}
              className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-md"
            >
              <div className="px-5 py-3 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">
                    {dept} ({visitorsInDept.length} Visitor{visitorsInDept.length > 1 ? 's' : ''})
                  </h3>
                </div>
              </div>

              <div className="divide-y divide-slate-800/60">
                {visitorsInDept.map((v) => {
                  const isAccounted = accountedIds.has(v.id);

                  return (
                    <div
                      key={v.id}
                      onClick={() => toggleAccounted(v.id)}
                      className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer transition-colors ${
                        isAccounted ? 'bg-emerald-950/20' : 'hover:bg-slate-800/30'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          className="text-slate-400 hover:text-emerald-400 transition-colors"
                        >
                          {isAccounted ? (
                            <CheckSquare className="w-5 h-5 text-emerald-400" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-600" />
                          )}
                        </button>

                        <div>
                          <div className="font-bold text-sm text-slate-100 flex items-center gap-2">
                            <span>{v.fullName}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.2 bg-slate-800 rounded text-slate-300">
                              {v.passCode}
                            </span>
                          </div>
                          <div className="text-xs text-slate-400">
                            {v.organization} · Host: <strong className="text-slate-300">{v.hostEmployeeName}</strong>
                          </div>
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-xs font-mono text-slate-400 sm:text-right">
                        <div>
                          <span className="text-slate-500 block text-[10px]">VISITOR CONTACT</span>
                          <span className="text-slate-200">{v.phone}</span>
                        </div>
                        {v.emergencyContactName && (
                          <div>
                            <span className="text-slate-500 block text-[10px]">EMERGENCY NEXT-OF-KIN</span>
                            <span className="text-rose-300 font-medium">
                              {v.emergencyContactName} ({v.emergencyContactPhone || 'N/A'})
                            </span>
                          </div>
                        )}
                        <div>
                          <span className="text-slate-500 block text-[10px]">CHECK-IN</span>
                          <span className="text-slate-300">
                            {new Date(v.checkInTime).toLocaleTimeString('en-GB', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
