import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import * as OTPAuth from 'otpauth';

export const digest = (value) => createHash('sha256').update(String(value)).digest('hex');
export const equal = (a, b) => {
  const x = Buffer.from(String(a)),
    y = Buffer.from(String(b));
  return x.length === y.length && timingSafeEqual(x, y);
};
export function loadKeys(env, dir, production) {
  const file = path.join(dir, '.development-keys.json');
  let saved;
  if (!production && !env.SECUREPASS_DATA_KEYS) {
    if (existsSync(file)) saved = JSON.parse(readFileSync(file, 'utf8'));
    else {
      if (existsSync(path.join(dir, '.database-initialized')))
        throw Error(
          'Development keys missing for an initialized database; restore the original keys',
        );
      saved = {
        data: { development: randomBytes(32).toString('base64') },
        index: randomBytes(32).toString('base64'),
        audit: randomBytes(32).toString('base64'),
        backup: randomBytes(32).toString('base64'),
      };
      writeFileSync(file, JSON.stringify(saved), { mode: 0o600, flag: 'wx' });
    }
  }
  const decode = (s) => {
    if (typeof s !== 'string' || !/^[A-Za-z0-9+/]{43}=$/.test(s))
      throw Error('Keys must be base64-encoded 32-byte values');
    const k = Buffer.from(s, 'base64');
    if (k.length !== 32) throw Error('Invalid key');
    return k;
  };
  const ring = JSON.parse(env.SECUREPASS_DATA_KEYS || JSON.stringify(saved?.data));
  const keys = new Map(
    Object.entries(ring).map(([id, key]) => {
      if (!/^[\w-]{1,40}$/.test(id)) throw Error('Invalid key ID');
      return [id, decode(key)];
    }),
  );
  const active = env.SECUREPASS_ACTIVE_KEY_ID || [...keys.keys()][0];
  if (!keys.has(active)) throw Error('Active key unavailable');
  const index = decode(env.SECUREPASS_INDEX_KEY || saved?.index),
    audit = decode(env.SECUREPASS_AUDIT_KEY || saved?.audit),
    backup = decode(env.SECUREPASS_BACKUP_KEY || saved?.backup);
  const mac = (key, text) => createHmac('sha256', key).update(text).digest('hex');
  const encrypt = (value, aad, key, kid) => {
    const iv = randomBytes(12),
      cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(Buffer.from(aad));
    const data = Buffer.concat([cipher.update(JSON.stringify(value), 'utf8'), cipher.final()]);
    return JSON.stringify({
      v: 1,
      kid,
      iv: iv.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
      data: data.toString('base64'),
    });
  };
  const decrypt = (text, aad, keyFor) => {
    const p = JSON.parse(text);
    if (p.v !== 1) throw Error('Unknown encrypted record version');
    const decipher = createDecipheriv('aes-256-gcm', keyFor(p.kid), Buffer.from(p.iv, 'base64'));
    decipher.setAAD(Buffer.from(aad));
    decipher.setAuthTag(Buffer.from(p.tag, 'base64'));
    return JSON.parse(
      Buffer.concat([decipher.update(Buffer.from(p.data, 'base64')), decipher.final()]).toString(
        'utf8',
      ),
    );
  };
  return {
    active,
    seal: (value, aad) => encrypt(value, aad, keys.get(active), active),
    open: (text, aad) =>
      decrypt(text, aad, (id) => {
        if (!keys.has(id)) throw Error(`Missing data key ${id}`);
        return keys.get(id);
      }),
    blind: (scope, value) => mac(index, `${scope}\0${String(value)}`),
    sign: (text) => mac(audit, text),
    packBackup: (value) => encrypt(value, 'securepass-backup-v1', backup, 'backup'),
    unpackBackup: (text) => decrypt(text, 'securepass-backup-v1', () => backup),
  };
}
export function newFactor(label) {
  const secret = new OTPAuth.Secret({ size: 20 });
  const totp = new OTPAuth.TOTP({
    issuer: 'SecurePass',
    label,
    secret,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
  });
  return { secret: secret.base32, uri: totp.toString() };
}
export function verifyFactor(secret, token, lastCounter = -1, timestamp = Date.now()) {
  if (typeof token !== 'string' || !/^\d{6}$/.test(token)) return null;
  const totp = new OTPAuth.TOTP({ secret, algorithm: 'SHA1', digits: 6, period: 30 });
  const delta = totp.validate({ token, window: 1, timestamp });
  const counter = Math.floor(timestamp / 30000) + (delta ?? 0);
  return delta !== null && counter > lastCounter ? counter : null;
}
export function openPrivacyRecord(keys, row) {
  const body = keys.open(row.cipher, `privacy:${row.tenant_id}:${row.site_id}:${row.id}`);
  if (
    body.visitorId !== row.visitor_id ||
    body.type !== row.type ||
    body.requestedBy !== row.requested_by ||
    body.status !== row.status ||
    body.verifiedBy !== row.verified_by
  )
    throw Error('Privacy request/index integrity failure');
  return body;
}
