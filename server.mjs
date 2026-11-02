import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, chmodSync, readFileSync } from 'node:fs';
import path from 'node:path';
const app = express();
app.disable('x-powered-by');
app.set('trust proxy', process.env.TRUST_PROXY === '1' ? 1 : false);
const positive = (v, f, max) => {
  const n = Number(v ?? f);
  if (!Number.isInteger(n) || n < 1 || n > max) throw Error('Invalid numeric configuration');
  return n;
};
const days = positive(process.env.SECUREPASS_RETENTION_DAYS, 60, 3650);
const maxRecords = positive(process.env.SECUREPASS_MAX_RECORDS, 10000, 10000);
const maxAudits = positive(process.env.SECUREPASS_MAX_AUDITS, 50000, 50000);
const origin = process.env.SECUREPASS_ORIGIN;
const secure = process.env.SECUREPASS_COOKIE_SECURE !== 'false';
const noticeVersion = process.env.SECUREPASS_NOTICE_VERSION || 'development-1';
if (!origin) throw Error('SECUREPASS_ORIGIN required');
if (process.env.NODE_ENV === 'production' && (!secure || !origin.startsWith('https://') || !process.env.SECUREPASS_CONTROLLER_NAME || !process.env.SECUREPASS_FACILITY_NAME || !process.env.SECUREPASS_NOTICE_VERSION || !process.env.SECUREPASS_NOTICE_TEXT || !process.env.SECUREPASS_PRIVACY_EMAIL)) throw Error('Production requires HTTPS, Secure cookies and reviewed controller/privacy configuration');
const config = {
  companyName: process.env.SECUREPASS_CONTROLLER_NAME || 'Development controller',
  facilityName: process.env.SECUREPASS_FACILITY_NAME || 'Development facility',
  address: process.env.SECUREPASS_CONTROLLER_ADDRESS || 'Not configured',
  ndpcRegistrationNumber: process.env.SECUREPASS_REGISTRATION || 'Not configured',
  dpoName: process.env.SECUREPASS_DPO_NAME || 'Privacy contact',
  dpoEmail: process.env.SECUREPASS_PRIVACY_EMAIL || '',
  dpoPhone: '',
  dataRetentionDays: days,
  noticeVersion,
  privacyNoticeText: process.env.SECUREPASS_NOTICE_TEXT || 'Development only: visitor contact and visit details are recorded for reception. Obtain the facility privacy notice before providing real personal data.',
  lawfulBasisNotice: 'Refer to the controller-approved privacy notice'
};
const dir = path.resolve(process.env.SECUREPASS_DATA_DIR || './securepass-data');
mkdirSync(dir, {
  recursive: true,
  mode: 0o700
});
const db = new DatabaseSync(path.join(dir, 'securepass.sqlite'));
try {
  chmodSync(path.join(dir, 'securepass.sqlite'), 0o600);
} catch {}
db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','staff')),department TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active',password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS records(kind TEXT NOT NULL,id TEXT NOT NULL,payload TEXT NOT NULL,PRIMARY KEY(kind,id));
CREATE TABLE IF NOT EXISTS audits(id TEXT PRIMARY KEY,at TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT,detail TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS record_expiry(kind TEXT NOT NULL,id TEXT NOT NULL,expires INTEGER NOT NULL,PRIMARY KEY(kind,id));
CREATE INDEX IF NOT EXISTS idx_record_expiry ON record_expiry(expires);
CREATE INDEX IF NOT EXISTS idx_invite_code ON records(json_extract(payload,'$.inviteCode')) WHERE kind='invitations';
CREATE INDEX IF NOT EXISTS idx_invite_owner ON records(json_extract(payload,'$.createdByUserId')) WHERE kind='invitations';`);
const now = () => new Date().toISOString(),
  hash = t => createHash('sha256').update(t).digest('hex');
const derive = promisify(scrypt);
const hashPassword = async p => {
  const salt = randomBytes(16);
  return `${salt.toString('hex')}:${(await derive(p, salt, 64)).toString('hex')}`;
};
const verify = async (p, stored) => {
  try {
    const [s, h] = stored.split(':');
    return timingSafeEqual(await derive(p, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex'));
  } catch {
    return false;
  }
};
const safe = u => ({
  id: u.id,
  email: u.email,
  name: u.name,
  role: u.role,
  department: u.department,
  title: u.title,
  status: u.status,
  createdAt: u.created_at
});
const tx = fn => {
  db.exec('BEGIN IMMEDIATE');
  try {
    const v = fn();
    db.exec('COMMIT');
    return v;
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
};
const audit = (actor, action, target = '', detail = '') => {
  db.prepare('INSERT INTO audits VALUES (?,?,?,?,?,?)').run(randomUUID(), now(), actor, action, target, detail.slice(0, 300));
  db.prepare('DELETE FROM audits WHERE rowid IN (SELECT rowid FROM audits ORDER BY rowid DESC LIMIT -1 OFFSET ?)').run(maxAudits);
};
const get = (kind, id) => {
  const r = db.prepare('SELECT payload FROM records WHERE kind=? AND id=?').get(kind, id);
  return r ? JSON.parse(r.payload) : null;
};
const items = kind => db.prepare('SELECT payload FROM records WHERE kind=? LIMIT ?').all(kind, maxRecords).map(r => JSON.parse(r.payload));
const store = (kind, obj, expires) => {
  db.prepare('INSERT OR REPLACE INTO records VALUES (?,?,?)').run(kind, obj.id, JSON.stringify(obj));
  if (expires) db.prepare('INSERT OR REPLACE INTO record_expiry VALUES (?,?,?)').run(kind, obj.id, expires);
};
const remove = (kind, id) => {
  db.prepare('DELETE FROM records WHERE kind=? AND id=?').run(kind, id);
  db.prepare('DELETE FROM record_expiry WHERE kind=? AND id=?').run(kind, id);
};
const syncHost = u => {
  if (u.status !== 'active') {
    remove('hosts', u.id);
    return;
  }
  store('hosts', {
    id: u.id,
    userId: u.id,
    name: u.name,
    department: u.department,
    title: u.title,
    floor: 'Reception'
  });
};
if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n === 0) {
  const email = process.env.SECUREPASS_ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.SECUREPASS_ADMIN_PASSWORD;
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) || !password || password.length < 16 || password.length > 1024) throw Error('Initial admin requires email and password of 16–1024 characters');
  const id = randomUUID();
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)').run(id, email, 'Initial Administrator', 'admin', 'Operations', 'Administrator', 'active', await hashPassword(password), now());
  audit('system', 'BOOTSTRAP', id);
}
if (process.env.NODE_ENV !== 'production') {
  for (const h of JSON.parse(readFileSync(new URL('./server-hosts.json', import.meta.url), 'utf8'))) if (!get('hosts', h.id)) store('hosts', {
    id: h.id,
    name: h.name,
    department: h.department,
    title: h.title,
    floor: h.floor
  });
} else {
  for (const h of items('hosts')) if (!h.userId) remove('hosts', h.id);
}
for (const u of db.prepare('SELECT * FROM users').all()) syncHost(u);
// Backfill expiry and remove unsupported extra fields from legacy invitations.
for (const kind of ['visitors', 'invitations']) for (const obj of items(kind)) {
  let expires = Date.parse(obj.retentionExpiryDate || obj.expiresAt || '');
  if (!Number.isFinite(expires)) expires = (Date.parse(obj.checkInTime || obj.createdAt || '') || Date.now()) + days * 86400000;
  if (kind === 'invitations') {
    if (!obj.createdByUserId || !/^[A-F0-9]{32}$/.test(obj.inviteCode || '')) {
      remove(kind, obj.id);
      continue;
    }
    const allowed = ['id', 'inviteCode', 'guestName', 'guestEmail', 'guestPhone', 'guestOrganization', 'hostEmployeeId', 'hostEmployeeName', 'hostDepartment', 'expectedDate', 'expectedTime', 'purpose', 'status', 'createdAt', 'specialInstructions', 'parkingReserved', 'createdByUserId', 'visitorId'];
    const clean = Object.fromEntries(allowed.filter(k => obj[k] !== undefined).map(k => [k, obj[k]]));
    clean.expiresAt = new Date(expires).toISOString();
    store(kind, clean, expires);
  } else db.prepare('INSERT OR IGNORE INTO record_expiry VALUES (?,?,?)').run(kind, obj.id, expires);
}
function purge() {
  tx(() => {
    const expired = db.prepare('SELECT kind,id FROM record_expiry WHERE expires<=?').all(Date.now());
    for (const r of expired) remove(r.kind, r.id);
    db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
    db.prepare('DELETE FROM rate_limits WHERE expires<=?').run(Date.now());
    if (expired.length) audit('system', 'RETENTION_PURGE', '', `${expired.length} primary records removed; backups managed separately`);
  });
}
purge();
setInterval(purge, 60000).unref();
const asyncRoute = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Cache-Control', 'no-store');
  next();
});
const consume = (key, limit, ms) => {
  db.prepare('DELETE FROM rate_limits WHERE expires<=?').run(Date.now());
  const r = db.prepare('SELECT key FROM rate_limits WHERE key=?').get(key);
  if (!r && db.prepare('SELECT COUNT(*) AS n FROM rate_limits').get().n >= 20000) return false;
  return !!db.prepare('INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count').get(key, Date.now() + ms, limit);
};
const rate = (name, limit, ms, key = req => req.ip) => (req, res, next) => {
  if (!consume(`${name}:${hash(String(key(req)))}`, limit, ms)) {
    res.setHeader('Retry-After', String(Math.ceil(ms / 1000)));
    return res.status(429).json({
      error: 'Request limit reached; retry later'
    });
  }
  next();
};
app.use('/api', rate('global', 1000, 60000, () => 'installation'), rate('source', 180, 60000));
app.use('/api', (req, res, next) => {
  if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) && req.get('origin') !== origin) return res.status(403).json({
    error: 'Origin check failed'
  });
  next();
});
app.use('/api', express.json({
  limit: '16kb'
}));
const cookie = (v, age) => `sp_session=${v}; HttpOnly; SameSite=Strict; Path=/api; Max-Age=${age}; ${secure ? 'Secure;' : ''}`;
const auth = (req, res, next) => {
  const t = (req.headers.cookie || '').split(';').map(x => x.trim()).find(x => x.startsWith('sp_session='))?.slice(11);
  if (!t) return res.status(401).json({
    error: 'Not authenticated'
  });
  const u = db.prepare('SELECT users.* FROM sessions JOIN users ON users.id=sessions.user_id WHERE sessions.token_hash=? AND sessions.expires_at>? AND users.status=?').get(hash(t), Date.now(), 'active');
  if (!u) return res.status(401).json({
    error: 'Session expired'
  });
  req.user = u;
  req.token = t;
  next();
};
const admin = (req, res, next) => req.user.role === 'admin' ? next() : res.status(403).json({
  error: 'Forbidden'
});
const text = (x, max, required = false) => typeof x === 'string' && x.length <= max && (!required || !!x.trim());
const normalize = x => typeof x === 'string' ? x.trim().toLowerCase() : '';
const emailOK = x => text(x, 180, true) && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(x.trim());
const capacity = (req, res, next) => db.prepare("SELECT COUNT(*) AS n FROM records WHERE kind IN ('visitors','invitations')").get().n >= maxRecords ? res.status(503).json({
  error: 'Record capacity reached; contact reception'
}) : next();
const dummy = await hashPassword(randomBytes(32).toString('hex'));
app.post('/api/login', rate('login-source', 30, 900000), rate('login-global', 150, 900000, () => 'installation'), rate('login-account', 10, 900000, req => normalize(req.body?.email)), asyncRoute(async (req, res) => {
  const {
    email,
    password
  } = req.body || {};
  if (!emailOK(email) || !text(password, 1024, true)) return res.status(401).json({
    error: 'Invalid credentials'
  });
  const u = db.prepare('SELECT * FROM users WHERE email=?').get(normalize(email));
  const valid = await verify(password, u?.password_hash || dummy);
  const current = u && db.prepare('SELECT * FROM users WHERE id=?').get(u.id);
  if (!valid || !current || current.status !== 'active') return res.status(401).json({
    error: 'Invalid credentials'
  });
  const token = randomBytes(32).toString('base64url');
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(hash(token), u.id, Date.now() + 8 * 3600000);
  res.setHeader('Set-Cookie', cookie(token, 8 * 3600));
  audit(u.id, 'LOGIN', u.id);
  res.json({
    user: safe(current)
  });
}));
app.get('/api/session', auth, (req, res) => res.json({
  user: safe(req.user)
}));
app.post('/api/logout', auth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token_hash=?').run(hash(req.token));
  res.setHeader('Set-Cookie', cookie('', 0));
  res.json({
    ok: true
  });
});
app.get('/api/users', auth, admin, (req, res) => res.json(db.prepare('SELECT * FROM users ORDER BY created_at DESC LIMIT 1000').all().map(safe)));
app.post('/api/users', auth, admin, asyncRoute(async (req, res) => {
  const x = req.body || {};
  if (!emailOK(x.email) || !text(x.password, 1024, true) || x.password.length < 16 || !['admin', 'staff'].includes(x.role) || !text(x.name, 120, true) || !text(x.department ?? '', 120) || !text(x.title ?? '', 120)) return res.status(400).json({
    error: 'Valid name, email, role and password of 16–1024 characters required'
  });
  if (db.prepare('SELECT COUNT(*) AS n FROM users').get().n >= 1000) return res.status(409).json({
    error: 'User capacity reached'
  });
  const password = await hashPassword(x.password);
  const actor = db.prepare('SELECT * FROM users WHERE id=?').get(req.user.id);
  if (!actor || actor.role !== 'admin' || actor.status !== 'active') return res.status(403).json({
    error: 'Forbidden'
  });
  try {
    const id = randomUUID();
    tx(() => {
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)').run(id, normalize(x.email), x.name.trim(), x.role, x.department || '', x.title || '', 'active', password, now());
      syncHost(db.prepare('SELECT * FROM users WHERE id=?').get(id));
      audit(req.user.id, 'USER_CREATED', id);
    });
    res.status(201).json(safe(db.prepare('SELECT * FROM users WHERE id=?').get(id)));
  } catch (e) {
    if (String(e).includes('UNIQUE')) return res.status(409).json({
      error: 'Email already exists'
    });
    throw e;
  }
}));
app.patch('/api/users/:id', auth, admin, (req, res) => {
  const old = db.prepare('SELECT * FROM users WHERE id=?').get(req.params.id);
  if (!old) return res.status(404).json({
    error: 'Not found'
  });
  const x = req.body || {};
  if (x.role !== undefined && !['admin', 'staff'].includes(x.role) || x.status !== undefined && !['active', 'suspended'].includes(x.status) || ['name', 'department', 'title'].some(k => x[k] !== undefined && !text(x[k], 120, k === 'name'))) return res.status(400).json({
    error: 'Invalid update'
  });
  if (old.id === req.user.id && (x.role === 'staff' || x.status === 'suspended')) return res.status(409).json({
    error: 'Cannot demote or suspend yourself'
  });
  tx(() => {
    db.prepare('UPDATE users SET name=?,role=?,department=?,title=?,status=? WHERE id=?').run(x.name ?? old.name, x.role ?? old.role, x.department ?? old.department, x.title ?? old.title, x.status ?? old.status, old.id);
    if (x.status === 'suspended' || x.role && x.role !== old.role) db.prepare('DELETE FROM sessions WHERE user_id=?').run(old.id);
    syncHost(db.prepare('SELECT * FROM users WHERE id=?').get(old.id));
    audit(req.user.id, 'USER_UPDATED', old.id);
  });
  res.json(safe(db.prepare('SELECT * FROM users WHERE id=?').get(old.id)));
});
app.delete('/api/users/:id', auth, admin, (req, res) => {
  if (req.params.id === req.user.id) return res.status(409).json({
    error: 'Cannot delete yourself'
  });
  tx(() => {
    db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
    remove('hosts', req.params.id);
    audit(req.user.id, 'USER_DELETED', req.params.id);
  });
  res.json({
    ok: true
  });
});
app.get('/api/config', (_req, res) => res.json(config));
app.get('/api/hosts', (_req, res) => res.json(items('hosts').map(({
  id,
  name,
  department,
  floor,
  title,
  userId
}) => ({
  id,
  name,
  department,
  floor,
  title,
  userId
}))));
app.get('/api/data', auth, (req, res) => {
  const offset = Number(req.query.offset || 0);
  if (!Number.isSafeInteger(offset) || offset < 0) return res.status(400).json({
    error: 'Invalid offset'
  });
  const page = k => db.prepare('SELECT payload FROM records WHERE kind=? ORDER BY rowid DESC LIMIT 500 OFFSET ?').all(k, offset).map(r => JSON.parse(r.payload));
  const invitations = req.user.role === 'admin' ? page('invitations') : db.prepare("SELECT payload FROM records WHERE kind='invitations' AND json_extract(payload,'$.createdByUserId')=? ORDER BY rowid DESC LIMIT 500 OFFSET ?").all(req.user.id, offset).map(r => JSON.parse(r.payload));
  res.json({
    visitors: req.user.role === 'admin' ? page('visitors') : [],
    invitations,
    auditLogs: req.user.role === 'admin' ? db.prepare('SELECT * FROM audits ORDER BY rowid DESC LIMIT 500 OFFSET ?').all(offset).map(a => ({
      id: a.id,
      timestamp: a.at,
      actor: a.actor,
      action: a.action,
      details: a.detail,
      lawfulBasis: '',
      complianceArticle: 'Operational security log'
    })) : [],
    users: req.user.role === 'admin' ? db.prepare('SELECT * FROM users LIMIT 1000').all().map(safe) : [],
    pageSize: 500
  });
});
app.post('/api/invitations', auth, capacity, rate('invite-user', 50, 3600000, req => req.user.id), (req, res) => {
  const x = req.body || {};
  const allowed = ['id', 'inviteCode', 'guestName', 'guestEmail', 'guestPhone', 'guestOrganization', 'hostEmployeeId', 'hostEmployeeName', 'hostDepartment', 'expectedDate', 'expectedTime', 'purpose', 'status', 'createdAt', 'specialInstructions', 'parkingReserved'];
  if (Object.keys(x).some(k => !allowed.includes(k)) || !emailOK(x.guestEmail) || !text(x.guestName, 180, true) || !text(x.hostEmployeeId, 120, true) || !text(x.guestPhone ?? '', 40) || !text(x.guestOrganization ?? '', 160) || !text(x.purpose ?? '', 300) || !text(x.specialInstructions ?? '', 500) || !/^\d{4}-\d{2}-\d{2}$/.test(x.expectedDate || '') || !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.expectedTime || '')) return res.status(400).json({
    error: 'Invalid invitation fields'
  });
  const host = get('hosts', x.hostEmployeeId);
  if (!host) return res.status(400).json({
    error: 'Unknown host'
  });
  if (req.user.role !== 'admin' && host.userId !== req.user.id) return res.status(403).json({
    error: 'Cannot invite for another host'
  });
  const end = Date.parse(`${x.expectedDate}T23:59:59+01:00`);
  if (!Number.isFinite(end) || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Lagos',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(end)) !== x.expectedDate || end <= Date.now() || end > Date.now() + days * 86400000) return res.status(400).json({
    error: 'Visit date must be within the retention window'
  });
  const entry = {
    id: randomUUID(),
    inviteCode: randomBytes(16).toString('hex').toUpperCase(),
    guestName: x.guestName.trim(),
    guestEmail: normalize(x.guestEmail),
    guestPhone: x.guestPhone || '',
    guestOrganization: x.guestOrganization || '',
    hostEmployeeId: host.id,
    hostEmployeeName: host.name,
    hostDepartment: host.department,
    expectedDate: x.expectedDate,
    expectedTime: x.expectedTime,
    purpose: x.purpose || '',
    specialInstructions: x.specialInstructions || '',
    parkingReserved: x.parkingReserved === true,
    status: 'pending',
    createdAt: now(),
    createdByUserId: req.user.id,
    expiresAt: new Date(end).toISOString()
  };
  tx(() => {
    store('invitations', entry, end);
    audit(req.user.id, 'INVITE_CREATED', entry.id);
  });
  res.status(201).json(entry);
});
const usable = code => {
  if (typeof code !== 'string' || !/^[A-Z0-9-]{8,64}$/i.test(code)) return null;
  const r = db.prepare("SELECT payload FROM records WHERE kind='invitations' AND json_extract(payload,'$.inviteCode')=? LIMIT 1").get(code.toUpperCase());
  if (!r) return null;
  const i = JSON.parse(r.payload);
  return i.status === 'pending' && Date.parse(i.expiresAt) > Date.now() && get('hosts', i.hostEmployeeId) ? i : null;
};
app.post('/api/invitations/lookup', rate('lookup', 10, 60000), (req, res) => {
  const i = usable(req.body?.inviteCode);
  if (!i) return res.status(404).json({
    error: 'Invitation unavailable'
  });
  res.json({
    id: i.id,
    hostEmployeeId: i.hostEmployeeId,
    expectedDate: i.expectedDate,
    expectedTime: i.expectedTime
  });
});
app.post('/api/checkin', rate('checkin', 10, 60000), rate('checkin-global', 100, 3600000, () => 'installation'), capacity, (req, res) => {
  const x = req.body || {};
  if (!text(x.fullName, 180, true) || !emailOK(x.email) || !text(x.phone, 40, true) || !text(x.organization ?? '', 160) || !text(x.purpose ?? '', 300) || x.generalConsentGranted !== true || x.noticeVersion !== noticeVersion || !text(x.hostEmployeeId, 120, true)) return res.status(400).json({
    error: 'Invalid check-in or outdated privacy acknowledgement'
  });
  const host = get('hosts', x.hostEmployeeId);
  if (!host) return res.status(400).json({
    error: 'Unknown host'
  });
  const result = tx(() => {
    const invite = x.inviteCode ? usable(x.inviteCode) : null;
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date());
    if (x.inviteCode && (!invite || invite.hostEmployeeId !== host.id || normalize(invite.guestEmail) !== normalize(x.email) || invite.expectedDate !== today)) return null;
    const expiry = Date.now() + days * 86400000;
    const v = {
      id: randomUUID(),
      fullName: x.fullName.trim(),
      email: normalize(x.email),
      phone: x.phone.trim(),
      organization: x.organization || '',
      purpose: x.purpose || '',
      hostEmployeeId: host.id,
      hostEmployeeName: host.name,
      hostDepartment: host.department,
      visitType: invite ? 'pre_registered' : 'walk_in',
      generalConsentGranted: true,
      noticeVersion,
      consentTimestamp: now(),
      hasBiometricPhoto: false,
      biometricConsentGranted: false,
      status: 'checked_in',
      checkInTime: now(),
      retentionExpiryDate: new Date(expiry).toISOString(),
      passCode: randomBytes(12).toString('hex').toUpperCase(),
      badgeId: randomBytes(12).toString('hex').toUpperCase(),
      badgePrinted: false,
      securityClearance: 'Standard',
      wifiAccessGranted: false
    };
    store('visitors', v, expiry);
    if (invite) {
      invite.status = 'checked_in';
      invite.visitorId = v.id;
      store('invitations', invite, Date.parse(invite.expiresAt));
    }
    audit('public', 'CHECK_IN', v.id);
    return v;
  });
  if (!result) return res.status(409).json({
    error: 'Invitation unavailable, wrong visit date, or guest details do not match'
  });
  res.status(201).json(result);
});
app.patch('/api/visitors/:id/checkout', auth, admin, (req, res) => {
  const v = get('visitors', req.params.id);
  if (!v) return res.status(404).json({
    error: 'Not found'
  });
  v.status = 'checked_out';
  v.checkOutTime = now();
  tx(() => {
    store('visitors', v);
    audit(req.user.id, 'CHECK_OUT', v.id);
  });
  res.json(v);
});
app.post('/api/visitors/:id/erase', auth, admin, (req, res) => {
  const v = get('visitors', req.params.id);
  if (!v) return res.status(404).json({
    error: 'Not found'
  });
  tx(() => {
    const linked = db.prepare("SELECT id FROM records WHERE kind='invitations' AND (json_extract(payload,'$.visitorId')=? OR lower(json_extract(payload,'$.guestEmail'))=?)").all(v.id, v.email);
    for (const i of linked) remove('invitations', i.id);
    remove('visitors', v.id);
    audit(req.user.id, 'ERASURE', v.id, 'Primary visitor and related invitations removed; backups managed separately');
  });
  res.json({
    ok: true
  });
});
app.post('/api/invitations/:id/erase', auth, (req, res) => {
  const i = get('invitations', req.params.id);
  if (!i) return res.status(404).json({
    error: 'Not found'
  });
  if (req.user.role !== 'admin' && i.createdByUserId !== req.user.id) return res.status(403).json({
    error: 'Forbidden'
  });
  tx(() => {
    remove('invitations', i.id);
    audit(req.user.id, 'INVITE_ERASURE', i.id);
  });
  res.json({
    ok: true
  });
});
app.post('/api/purge', auth, admin, (req, res) => {
  purge();
  res.json({
    ok: true
  });
});
app.get('/api/health', (_req, res) => res.json({
  status: 'ok'
}));
app.use('/api', (_req, res) => res.status(404).json({
  error: 'Not found'
}));
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.resolve('dist'), {
    index: false
  }));
  app.get('*', (req, res) => res.sendFile(path.resolve('dist/index.html')));
}
app.use((err, req, res, next) => {
  console.error('Request failed:', err.type || err.code || err.name);
  res.status(err.status === 413 ? 413 : err.status === 400 ? 400 : 500).json({
    error: err.status === 413 ? 'Request too large' : err.status === 400 ? 'Invalid request' : 'Server error'
  });
});
app.listen(Number(process.env.PORT || 8080), process.env.HOST || '127.0.0.1', () => console.log('SecurePass listening'));
