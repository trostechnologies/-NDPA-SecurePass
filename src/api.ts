export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
  ) {
    super(message);
  }
}
export async function api<T>(path: string, options: RequestInit = {}): Promise<T> {
  const site =
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('site');
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(site ? { 'X-SecurePass-Site': site } : {}),
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers,
    },
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    if (
      res.status === 401 &&
      !['/login', '/mfa/complete', '/password-reset'].includes(path) &&
      typeof window !== 'undefined'
    )
      window.dispatchEvent(new Event('securepass:session-expired'));
    throw new ApiError(data.error || `Request failed (${res.status})`, res.status);
  }
  return res.json() as Promise<T>;
}
export const jsonBody = (value: unknown) => JSON.stringify(value);

/** Bound, one-use proof work supplements server-side rate limits without a third party. */
export async function receptionProof(): Promise<{ token: string; answer: string }> {
  const challenge = await api<{ token: string; difficulty: number }>('/checkin/challenge', {
    method: 'POST',
    body: '{}',
  });
  const encoder = new TextEncoder();
  for (let answer = 0; answer < 5000000; answer++) {
    const digest = await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(`${challenge.token}:${answer}`),
    );
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    if (hex.startsWith('0'.repeat(challenge.difficulty)))
      return { token: challenge.token, answer: String(answer) };
    if (answer % 250 === 0) await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error('Reception verification could not finish. Contact reception.');
}
