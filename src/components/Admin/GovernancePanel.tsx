import React, { useEffect, useState } from 'react';
import { api, jsonBody } from '../../api';
import { Visitor } from '../../types/visitor';
import { downloadFile, NDPA_ORGANIZATION_INFO } from '../../utils/ndpaCompliance';
import { HostDirectoryControls } from './HostDirectoryControls';
type Request = {
  id: string;
  visitorId: string;
  type: 'access' | 'erase';
  status: string;
  requestedBy: string;
  verifiedBy?: string;
};
type Hold = { id: string; case_ref: string; created_by: string; released_at?: string };
export const GovernancePanel: React.FC<{
  visitors: Visitor[];
  userId: string;
  onChanged: () => Promise<void>;
}> = ({ visitors, userId, onChanged }) => {
  const [requests, setRequests] = useState<Request[]>([]),
    [holds, setHolds] = useState<Hold[]>([]),
    [visitorId, setVisitorId] = useState(''),
    [caseReference, setCaseReference] = useState(''),
    [verified, setVerified] = useState(false),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const load = async () => {
    const state = await api<{ requests: Request[]; holds: Hold[] }>('/privacy');
    setRequests(state.requests);
    setHolds(state.holds);
  };
  useEffect(() => {
    void load().catch((e) => setMessage(e.message));
  }, [visitors]);
  const run = async (fn: () => Promise<void>) => {
    if (busy) return;
    setBusy(true);
    setMessage('');
    try {
      await fn();
      await load();
      await onChanged();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Operation failed');
    } finally {
      setBusy(false);
    }
  };
  return (
    <section className="p-5 rounded-xl border border-slate-700 bg-slate-900 space-y-4">
      <h2 className="text-xl font-bold">Privacy approvals and access control</h2>
      <p className="text-sm text-slate-400">
        Verify the account owner's identity in the approved case system. A different administrator
        must approve each disclosure or erasure. Legal holds block deletion.
      </p>
      <label className="block text-sm">
        Visitor
        <select
          aria-label="Governance visitor"
          className="block p-2 bg-slate-950 rounded max-w-full"
          value={visitorId}
          onChange={(e) => setVisitorId(e.target.value)}
        >
          <option value="">Select visitor</option>
          {visitors.map((v) => (
            <option key={v.id} value={v.id}>
              {v.fullName} · {v.status}
            </option>
          ))}
        </select>
      </label>
      <div className="flex flex-wrap gap-2">
        {(['access', 'erase'] as const).map((type) => (
          <button
            key={type}
            disabled={busy || !visitorId}
            className="p-2 rounded bg-slate-700 disabled:opacity-50"
            onClick={() =>
              void run(async () => {
                await api('/privacy/requests', {
                  method: 'POST',
                  body: jsonBody({ visitorId, type }),
                });
                setMessage('Request created. An independent administrator must verify it.');
              })
            }
          >
            Request {type === 'access' ? 'verified disclosure' : 'erasure'}
          </button>
        ))}
      </div>
      <label className="block text-sm">
        Non-sensitive identity/hold case reference
        <input
          className="block w-full max-w-lg p-2 rounded bg-slate-950"
          value={caseReference}
          onChange={(e) => setCaseReference(e.target.value)}
          placeholder="CASE-2026-001"
        />
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        I independently verified the requester's identity using the referenced case.
      </label>
      <button
        disabled={busy || !visitorId || !caseReference}
        className="p-2 rounded bg-amber-900 disabled:opacity-50"
        onClick={() =>
          void run(async () => {
            await api('/privacy/holds', {
              method: 'POST',
              body: jsonBody({ visitorId, caseReference }),
            });
            setMessage('Legal hold recorded.');
          })
        }
      >
        Place subject on legal hold
      </button>
      {requests.map((r) => (
        <article key={r.id} className="p-3 border border-slate-700 rounded space-y-2">
          <p className="text-sm">
            {r.type === 'access' ? 'Disclosure' : 'Erasure'} · {r.status} ·{' '}
            <span className="font-mono text-xs">{r.id}</span>
          </p>
          {r.status === 'pending' && r.requestedBy !== userId && (
            <button
              disabled={busy || !verified || !caseReference}
              className="p-2 bg-emerald-900 rounded disabled:opacity-50"
              onClick={() =>
                void run(async () => {
                  await api(`/privacy/requests/${r.id}/verify`, {
                    method: 'POST',
                    body: jsonBody({
                      verificationReference: caseReference,
                      verificationMethod: 'in_person',
                    }),
                  });
                  setVerified(false);
                })
              }
            >
              Record independent identity approval
            </button>
          )}
          {r.status === 'verified' &&
            (r.type === 'erase' ? (
              <button
                disabled={busy}
                className="p-2 bg-red-900 rounded"
                onClick={() =>
                  void run(async () => {
                    const result = await api<{ receipt: unknown }>(
                      `/privacy/requests/${r.id}/fulfill`,
                      { method: 'POST' },
                    );
                    downloadFile(
                      JSON.stringify(result.receipt, null, 2),
                      `erasure-receipt-${r.id}.json`,
                      'application/json',
                    );
                    setMessage(
                      'Primary records erased; signed receipt recorded for managed restore enforcement.',
                    );
                  })
                }
              >
                Execute approved erasure
              </button>
            ) : (
              <button
                disabled={busy}
                className="p-2 bg-emerald-900 rounded"
                onClick={() =>
                  void run(async () => {
                    const result = await api(`/privacy/requests/${r.id}/export`);
                    downloadFile(
                      JSON.stringify(result, null, 2),
                      `verified-disclosure-${r.id}.json`,
                      'application/json',
                    );
                  })
                }
              >
                Download approved disclosure
              </button>
            ))}
        </article>
      ))}
      {holds
        .filter((h) => !h.released_at)
        .map((h) => (
          <div key={h.id} className="text-sm p-3 border border-amber-800 rounded">
            Active hold · {h.case_ref}
            {h.created_by !== userId && (
              <button
                disabled={busy || !caseReference}
                className="ml-3 underline"
                onClick={() =>
                  void run(async () => {
                    await api(`/privacy/holds/${h.id}/release`, {
                      method: 'POST',
                      body: jsonBody({ caseReference }),
                    });
                  })
                }
              >
                Release reviewed hold
              </button>
            )}
          </div>
        ))}
      {NDPA_ORGANIZATION_INFO.gateEnabled && (
        <div className="border-t border-slate-700 pt-3 space-y-2">
          <h3 className="font-semibold">Online gate authorization</h3>
          <p className="text-sm text-slate-400">
            Registration alone grants no gate access. Verify the visitor before authorizing a
            time-limited pass.
          </p>
          {visitors
            .filter((v) => v.status === 'checked_in' && v.accessStatus !== 'authorized')
            .map((v) => (
              <div key={v.id} className="flex gap-3 text-sm items-center">
                <span>{v.fullName}</span>
                <button
                  disabled={busy}
                  className="p-2 bg-emerald-900 rounded"
                  onClick={() =>
                    void run(async () => {
                      await api(`/visitors/${v.id}/authorize`, { method: 'POST' });
                    })
                  }
                >
                  Authorize online gate access
                </button>
              </div>
            ))}
        </div>
      )}
      <HostDirectoryControls />
      <button
        disabled={busy}
        className="text-sm underline"
        onClick={() =>
          void run(async () => {
            const result = await api<{ ok: boolean }>('/audit/verify');
            setMessage(
              result.ok ? 'Audit chain verification passed.' : 'Audit verification failed.',
            );
          })
        }
      >
        Verify audit integrity
      </button>
      {message && (
        <p role="status" className="text-sm text-amber-200">
          {message}
        </p>
      )}
    </section>
  );
};
