import { randomInt } from 'node:crypto';

// Crockford base32 alphabet: no I, L, O or U.
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function newInviteCode() {
  let code = '';
  for (let i = 0; i < 10; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

// Accepts any case, dashes and spaces. Maps Crockford look-alikes (O→0, I/L→1).
// Returns the stored form, or null if it is neither a short code nor a legacy 32-hex code.
export function normalizeInviteCode(input) {
  if (typeof input !== 'string' || input.length > 80) return null;
  const compact = input.replace(/[\s-]/g, '').toUpperCase();
  if (/^[A-F0-9]{32}$/.test(compact)) return compact;
  const mapped = compact.replace(/O/g, '0').replace(/[IL]/g, '1');
  return /^[0-9A-HJKMNP-TV-Z]{10}$/.test(mapped) ? mapped : null;
}

export const formatInviteCode = (code) =>
  code.length === 10 ? `${code.slice(0, 5)}-${code.slice(5)}` : code;
