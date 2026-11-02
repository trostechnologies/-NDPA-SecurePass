export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const res = await fetch(`/api${path}`, { credentials: 'same-origin', ...options, headers: { ...(options.body ? {'Content-Type':'application/json'} : {}), ...options.headers }});
  if (!res.ok) { const data = await res.json().catch(()=>({})); throw new Error(data.error || `Request failed (${res.status})`); }
  return res.json() as Promise<T>;
}
export const jsonBody=(value:unknown)=>JSON.stringify(value);
