import React, { useEffect, useState } from 'react';
import { api, jsonBody } from '../../api';
import { HostEmployee } from '../../types/visitor';
type Host = HostEmployee & { publicLabel?: string; publicVisible?: boolean };
export const HostDirectoryControls: React.FC = () => {
  const [hosts, setHosts] = useState<Host[]>([]),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<Host[]>('/hosts')
      .then(setHosts)
      .catch((e) => setMessage(e.message));
  }, []);
  const update = (id: string, value: Partial<Host>) =>
    setHosts((all) => all.map((h) => (h.id === id ? { ...h, ...value } : h)));
  return (
    <details className="p-4 border border-slate-700 rounded-xl bg-slate-900">
      <summary className="cursor-pointer">Site host directory settings</summary>
      <p className="my-3 text-sm text-slate-400">
        Public display requires both this opt-in and the controller's site directory policy.
        Otherwise guests see reception or an invitation-specific host label.
      </p>
      <div className="space-y-3">
        {hosts
          .filter((h) => h.id !== 'reception')
          .map((h) => (
            <div key={h.id} className="p-3 border border-slate-700 rounded space-y-2">
              <p>{h.name}</p>
              <label className="block text-sm">
                Destination floor
                <input
                  className="block p-2 bg-slate-950 rounded w-full"
                  maxLength={80}
                  value={h.floor}
                  onChange={(e) => update(h.id, { floor: e.target.value })}
                />
              </label>
              <label className="block text-sm">
                Public display label
                <input
                  className="block p-2 bg-slate-950 rounded w-full"
                  maxLength={120}
                  value={h.publicLabel || ''}
                  onChange={(e) => update(h.id, { publicLabel: e.target.value })}
                />
              </label>
              <label className="flex gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={h.publicVisible === true}
                  onChange={(e) => update(h.id, { publicVisible: e.target.checked })}
                />
                Allow public directory display under the controller's policy
              </label>
              <button
                disabled={busy}
                className="p-2 bg-slate-700 rounded"
                onClick={async () => {
                  setBusy(true);
                  setMessage('');
                  try {
                    await api(`/hosts/${h.id}`, {
                      method: 'PATCH',
                      body: jsonBody({
                        floor: h.floor,
                        publicLabel: h.publicLabel || '',
                        publicVisible: h.publicVisible === true,
                      }),
                    });
                    setMessage('Host directory saved.');
                  } catch (e) {
                    setMessage(e instanceof Error ? e.message : 'Could not save');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                Save host directory entry
              </button>
            </div>
          ))}
      </div>
      {message && (
        <p role="status" className="mt-3 text-amber-200 text-sm">
          {message}
        </p>
      )}
    </details>
  );
};
