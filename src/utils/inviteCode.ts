/** Shows 10-character invite codes as XXXXX-XXXXX; older long codes are shown unchanged. */
export function formatInviteCode(code: string): string {
  const clean = (code || '').replace(/[\s-]/g, '').toUpperCase();
  return clean.length === 10 ? `${clean.slice(0, 5)}-${clean.slice(5)}` : code;
}
