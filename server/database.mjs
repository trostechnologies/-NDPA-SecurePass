import { DatabaseSync } from 'node:sqlite';
import {
  mkdirSync,
  chmodSync,
  readFileSync,
  writeFileSync,
  renameSync,
  existsSync,
  openSync,
  closeSync,
  unlinkSync,
} from 'node:fs';
import { randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { loadKeys, equal, openPrivacyRecord } from './crypto.mjs';

export const auditEventBody = (r) =>
  JSON.stringify({
    seq: r.seq,
    at: r.at,
    tenantId: r.tenant_id,
    siteId: r.site_id,
    actor: r.actor,
    action: r.action,
    target: r.target,
    detail: r.detail,
    previousHash: r.previous_hash,
  });

export function openDatabase(config) {
  const dir = path.resolve(config.env.SECUREPASS_DATA_DIR || './securepass-data');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keys = loadKeys(config.env, dir, config.production);
  const lock = path.join(dir, 'server.lock'),
    nonce = randomBytes(16).toString('hex');
  const fd = openSync(lock, 'wx', 0o600);
  writeFileSync(fd, JSON.stringify({ pid: process.pid, nonce }));
  closeSync(fd);
  let db;
  try {
    db = new DatabaseSync(path.join(dir, 'securepass.sqlite'));
    try {
      chmodSync(path.join(dir, 'securepass.sqlite'), 0o600);
    } catch {}
    const anchorFile = path.join(dir, 'audit-head.json');
    let depth = 0,
      closed = false,
      exportedSequence = -1;
    const scoped = (s) => [s.tenantId, s.siteId];
    db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; PRAGMA busy_timeout=5000;
  CREATE TABLE IF NOT EXISTS schema_migrations(version INTEGER PRIMARY KEY,at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS installation(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notice_versions(tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,version TEXT NOT NULL,hash TEXT NOT NULL,cipher TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id,version));
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,department TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active',password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS memberships(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','staff')),status TEXT NOT NULL DEFAULT 'active',name TEXT NOT NULL,department TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',PRIMARY KEY(user_id,tenant_id,site_id));
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at INTEGER NOT NULL,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,created_at INTEGER NOT NULL,mfa_verified_at INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS secure_records(tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,cipher TEXT NOT NULL,email_hash TEXT,code_hash TEXT,owner_id TEXT,visitor_id TEXT,badge_hash TEXT,host_id TEXT,status TEXT,expires INTEGER,created_at TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id,kind,id));
  CREATE INDEX IF NOT EXISTS idx_records_expiry ON secure_records(expires);
  CREATE INDEX IF NOT EXISTS idx_records_email ON secure_records(tenant_id,site_id,kind,email_hash,status);
  CREATE INDEX IF NOT EXISTS idx_records_code ON secure_records(tenant_id,site_id,kind,code_hash);
  CREATE INDEX IF NOT EXISTS idx_records_owner ON secure_records(tenant_id,site_id,kind,owner_id);
  CREATE INDEX IF NOT EXISTS idx_records_badge ON secure_records(tenant_id,site_id,kind,badge_hash);
  CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count INTEGER NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS factors(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,secret_cipher TEXT NOT NULL,last_counter INTEGER NOT NULL DEFAULT -1,recovery_cipher TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS auth_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,kind TEXT NOT NULL,secret_cipher TEXT,expires INTEGER NOT NULL,attempts INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS reset_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS public_challenges(token_hash TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,source_hash TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS idempotency(key_hash TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,fingerprint TEXT NOT NULL,visitor_id TEXT NOT NULL,expires INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS legal_holds(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,subject_hash TEXT NOT NULL,case_ref TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,released_at TEXT);
  CREATE INDEX IF NOT EXISTS idx_holds_subject ON legal_holds(tenant_id,site_id,subject_hash,released_at);
  CREATE TABLE IF NOT EXISTS privacy_requests(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,visitor_id TEXT NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,requested_by TEXT NOT NULL,verified_by TEXT,cipher TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS erasures(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,subject_hash TEXT NOT NULL,record_ids TEXT NOT NULL,at TEXT NOT NULL,receipt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_chain(seq INTEGER PRIMARY KEY,at TEXT NOT NULL,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL,previous_hash TEXT NOT NULL,mac TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_checkpoint(id INTEGER PRIMARY KEY CHECK(id=1),seq INTEGER NOT NULL,mac TEXT NOT NULL,receipt TEXT NOT NULL);
  CREATE TRIGGER IF NOT EXISTS audit_no_update BEFORE UPDATE ON audit_chain BEGIN SELECT RAISE(ABORT,'Audit rows are append-only'); END;
  CREATE TRIGGER IF NOT EXISTS audit_no_delete BEFORE DELETE ON audit_chain BEGIN SELECT RAISE(ABORT,'Audit rows are append-only'); END;
  CREATE TABLE IF NOT EXISTS security_metrics(scope TEXT NOT NULL,event TEXT NOT NULL,count INTEGER NOT NULL,last_at TEXT NOT NULL,PRIMARY KEY(scope,event));`);
    const previous = db.prepare("SELECT value FROM installation WHERE key='binding'").get();
    const binding = config.mode === 'isolated' ? `isolated:${config.sites[0].scopeId}` : 'shared';
    if (previous && previous.value !== binding)
      throw Error(
        'Database deployment binding differs; use an explicit migration into a different database',
      );
    db.prepare("INSERT OR IGNORE INTO installation VALUES ('binding',?)").run(binding);
    const priorScopes = db.prepare("SELECT value FROM installation WHERE key='scopes'").get();
    const scopeIds = config.sites.map((s) => s.scopeId).sort();
    if (priorScopes && JSON.parse(priorScopes.value).some((id) => !scopeIds.includes(id)))
      throw Error('Removing a customer/site requires an explicit reviewed data migration');
    db.prepare("INSERT OR REPLACE INTO installation VALUES ('scopes',?)").run(
      JSON.stringify(scopeIds),
    );
    // Old sessions were not site-bound. Revoke them during this schema migration.
    if (
      !db
        .prepare('PRAGMA table_info(sessions)')
        .all()
        .some((c) => c.name === 'tenant_id')
    ) {
      db.exec(
        "DELETE FROM sessions; ALTER TABLE sessions ADD COLUMN tenant_id TEXT NOT NULL DEFAULT ''; ALTER TABLE sessions ADD COLUMN site_id TEXT NOT NULL DEFAULT ''; ALTER TABLE sessions ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0; ALTER TABLE sessions ADD COLUMN mfa_verified_at INTEGER NOT NULL DEFAULT 0;",
      );
    }
    const now = () => new Date().toISOString();
    const baseHead = () => {
      const r = db.prepare('SELECT * FROM audit_checkpoint WHERE id=1').get();
      if (!r) return { seq: 0, mac: '0'.repeat(64) };
      const { signature, ...body } = JSON.parse(r.receipt);
      if (
        !equal(signature, keys.sign('audit-checkpoint:' + JSON.stringify(body))) ||
        body.seq !== r.seq ||
        body.mac !== r.mac
      )
        throw Error('Audit archive checkpoint integrity failure');
      return { seq: r.seq, mac: r.mac };
    };
    const head = () =>
      db.prepare('SELECT seq,mac FROM audit_chain ORDER BY seq DESC LIMIT 1').get() || baseHead();
    const checkpoint = () => {
      const h = head(),
        body = JSON.stringify(h),
        record = { ...h, signature: keys.sign(body) };
      const temp = anchorFile + '.' + nonce + '.tmp';
      writeFileSync(temp, JSON.stringify(record), { mode: 0o600 });
      renameSync(temp, anchorFile);
      if (
        (config.production || config.env.SECUREPASS_TELEMETRY === 'true') &&
        h.seq !== exportedSequence
      ) {
        console.log(
          JSON.stringify({
            event: 'audit_anchor',
            sequence: h.seq,
            hash: h.mac,
            at: new Date().toISOString(),
          }),
        );
        exportedSequence = h.seq;
      }
    };
    const tx = (fn) => {
      if (depth) return fn();
      db.exec('BEGIN IMMEDIATE');
      depth++;
      let result;
      try {
        result = fn();
        db.exec('COMMIT');
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      } finally {
        depth--;
      }
      checkpoint();
      return result;
    };
    const auditBody = auditEventBody;
    function verifyAudit() {
      const base = baseHead();
      let prior = base.mac,
        seq = base.seq;
      for (const r of db.prepare('SELECT * FROM audit_chain ORDER BY seq').iterate()) {
        if (
          r.seq !== seq + 1 ||
          r.previous_hash !== prior ||
          !equal(r.mac, keys.sign(auditBody(r)))
        )
          throw Error('Audit chain integrity failure');
        prior = r.mac;
        seq = r.seq;
      }
      if (existsSync(anchorFile)) {
        const a = JSON.parse(readFileSync(anchorFile, 'utf8'));
        if (!equal(a.signature, keys.sign(JSON.stringify({ seq: a.seq, mac: a.mac }))))
          throw Error('Audit checkpoint integrity failure');
        const row =
          a.seq === base.seq
            ? base
            : a.seq
              ? db.prepare('SELECT mac FROM audit_chain WHERE seq=?').get(a.seq)
              : { mac: '0'.repeat(64) };
        if (!row || !equal(row.mac, a.mac) || a.seq > seq)
          throw Error('Audit tail rollback detected');
      } else if (seq) throw Error('Audit checkpoint missing; independent recovery required');
      return { ok: true, seq, head: prior };
    }
    verifyAudit();
    for (const s of config.sites) {
      const body = {
        controller: s.companyName,
        facility: s.facilityName,
        contact: s.dpoEmail,
        notice: s.privacyNoticeText,
        retentionDays: s.dataRetentionDays,
      };
      const hash = keys.blind(s.scopeId, JSON.stringify(body)),
        old = db
          .prepare('SELECT hash FROM notice_versions WHERE tenant_id=? AND site_id=? AND version=?')
          .get(...scoped(s), s.noticeVersion);
      if (old && old.hash !== hash) throw Error('Privacy notice changed without a new version');
      db.prepare('INSERT OR IGNORE INTO notice_versions VALUES (?,?,?,?,?,?)').run(
        ...scoped(s),
        s.noticeVersion,
        hash,
        keys.seal(body, `notice:${s.scopeId}:${s.noticeVersion}`),
        now(),
      );
      s.noticeHash = hash;
    }
    const audit = (scope, actor, action, target = '', detail = '') =>
      tx(() => {
        const h = head();
        if (db.prepare('SELECT COUNT(*) AS n FROM audit_chain').get().n >= config.maxAudits)
          throw Object.assign(
            Error('Audit capacity reached; use the reviewed offline archive workflow'),
            { status: 503 },
          );
        const r = {
          seq: h.seq + 1,
          at: now(),
          tenant_id: scope.tenantId,
          site_id: scope.siteId,
          actor,
          action,
          target,
          detail: String(detail).slice(0, 300),
          previous_hash: h.mac,
        };
        const mac = keys.sign(auditBody(r));
        db.prepare('INSERT INTO audit_chain VALUES (?,?,?,?,?,?,?,?,?,?)').run(
          r.seq,
          r.at,
          r.tenant_id,
          r.site_id,
          actor,
          action,
          target,
          r.detail,
          h.mac,
          mac,
        );
      });
    const aad = (s, kind, id) => `record:${s.scopeId}:${kind}:${id}`;
    const indexValue = (s, value) => keys.blind(s.scopeId, String(value).trim().toLowerCase());
    const decode = (s, row) => {
      if (!row) return null;
      const obj = keys.open(row.cipher, aad(s, row.kind, row.id)),
        email = obj.email || obj.guestEmail;
      const expected = {
        email_hash: email ? indexValue(s, email) : null,
        code_hash: obj.inviteCode ? indexValue(s, obj.inviteCode) : null,
        owner_id: obj.createdByUserId || obj.userId || null,
        visitor_id: obj.visitorId || null,
        badge_hash: obj.badgeId ? indexValue(s, obj.badgeId) : null,
        host_id: obj.hostEmployeeId || null,
        status: obj.status || null,
        expires:
          obj.retentionExpiryDate || obj.expiresAt
            ? Date.parse(obj.retentionExpiryDate || obj.expiresAt)
            : null,
      };
      if (obj.id !== row.id || Object.entries(expected).some(([key, value]) => row[key] !== value))
        throw Error('Encrypted record/index integrity failure');
      return obj;
    };
    const put = (s, kind, obj, expires) => {
      const old = db
        .prepare(
          'SELECT expires,created_at FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=? AND id=?',
        )
        .get(...scoped(s), kind, obj.id);
      const effectiveExpiry = expires ?? old?.expires ?? null;
      if (effectiveExpiry !== null) {
        obj = {
          ...obj,
          [kind === 'invitations' ? 'expiresAt' : 'retentionExpiryDate']: new Date(
            effectiveExpiry,
          ).toISOString(),
        };
      }
      const email = obj.email || obj.guestEmail;
      db.prepare('INSERT OR REPLACE INTO secure_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)').run(
        ...scoped(s),
        kind,
        obj.id,
        keys.seal(obj, aad(s, kind, obj.id)),
        email ? indexValue(s, email) : null,
        obj.inviteCode ? indexValue(s, obj.inviteCode) : null,
        obj.createdByUserId || obj.userId || null,
        obj.visitorId || null,
        obj.badgeId ? indexValue(s, obj.badgeId) : null,
        obj.hostEmployeeId || null,
        obj.status || null,
        effectiveExpiry,
        old?.created_at || obj.createdAt || now(),
      );
    };
    const get = (s, kind, id) =>
      decode(
        s,
        db
          .prepare(
            'SELECT * FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=? AND id=?',
          )
          .get(...scoped(s), kind, id),
      );
    const verifyRecords = () => {
      const scopes = new Map(config.sites.map((s) => [s.scopeId, s]));
      for (const row of db.prepare('SELECT * FROM secure_records').iterate()) {
        const scope = scopes.get(`${row.tenant_id}:${row.site_id}`);
        if (!scope) throw Error('Record belongs to an unregistered scope');
        decode(scope, row);
      }
      for (const n of db.prepare('SELECT * FROM notice_versions').iterate()) {
        const scope = `${n.tenant_id}:${n.site_id}`,
          body = keys.open(n.cipher, `notice:${scope}:${n.version}`);
        if (keys.blind(scope, JSON.stringify(body)) !== n.hash)
          throw Error('Privacy notice integrity failure');
      }
      for (const f of db.prepare('SELECT * FROM factors').iterate()) {
        keys.open(f.secret_cipher, `mfa:${f.user_id}`);
        keys.open(f.recovery_cipher, `recovery:${f.user_id}`);
      }
      for (const r of db.prepare('SELECT * FROM privacy_requests').iterate())
        openPrivacyRecord(keys, r);
      for (const c of db
        .prepare('SELECT * FROM auth_challenges WHERE secret_cipher IS NOT NULL')
        .iterate())
        keys.open(c.secret_cipher, `challenge:${c.token_hash}`);
      return true;
    };
    const list = (s, kind, filter = {}) => {
      let sql = 'SELECT * FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=?';
      const values = [...scoped(s), kind];
      for (const [name, column] of Object.entries({
        owner: 'owner_id',
        email: 'email_hash',
        code: 'code_hash',
        badge: 'badge_hash',
        host: 'host_id',
        status: 'status',
        visitor: 'visitor_id',
      }))
        if (filter[name] !== undefined) {
          sql += ` AND ${column}=?`;
          values.push(
            ['email', 'code', 'badge'].includes(name) ? indexValue(s, filter[name]) : filter[name],
          );
        }
      sql += ' ORDER BY created_at DESC,id LIMIT ? OFFSET ?';
      values.push(Math.min(filter.limit ?? 500, config.maxRecords), filter.offset ?? 0);
      return db
        .prepare(sql)
        .all(...values)
        .map((r) => decode(s, r));
    };
    const held = (s, emailHash) =>
      !!db
        .prepare(
          'SELECT 1 FROM legal_holds WHERE tenant_id=? AND site_id=? AND subject_hash=? AND released_at IS NULL LIMIT 1',
        )
        .get(...scoped(s), emailHash);
    const remove = (s, kind, id) => {
      const row = db
        .prepare(
          'SELECT email_hash FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=? AND id=?',
        )
        .get(...scoped(s), kind, id);
      if (row && held(s, row.email_hash))
        throw Object.assign(Error('Record is subject to a legal hold'), { status: 409 });
      db.prepare(
        'DELETE FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=? AND id=?',
      ).run(...scoped(s), kind, id);
    };
    const member = (s, id) =>
      db
        .prepare(
          'SELECT u.*,m.role AS role,m.status AS membership_status,m.name AS display_name,m.department AS display_department,m.title AS display_title FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.tenant_id=? AND m.site_id=?',
        )
        .get(id, ...scoped(s));
    const grant = (s, u, role = u.role) =>
      db
        .prepare('INSERT OR IGNORE INTO memberships VALUES (?,?,?,?,?,?,?,?)')
        .run(
          u.id,
          ...scoped(s),
          role,
          u.status || 'active',
          u.name,
          u.department || '',
          u.title || '',
        );
    // Migration ownership is explicit when converting a legacy single-site database to shared mode.
    if (!db.prepare('SELECT 1 FROM schema_migrations WHERE version=2').get()) {
      const legacy = db
        .prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='records'")
        .get();
      const scope =
        config.sites.find((s) => s.key === config.env.SECUREPASS_MIGRATION_SITE) ||
        (config.sites.length === 1 ? config.sites[0] : null);
      if ((legacy || db.prepare('SELECT COUNT(*) AS n FROM users').get().n) && !scope)
        throw Error('SECUREPASS_MIGRATION_SITE required for legacy shared-mode migration');
      tx(() => {
        if (scope) {
          for (const u of db.prepare('SELECT * FROM users').all()) grant(scope, u);
          db.prepare("UPDATE users SET status='active'").run();
          if (legacy)
            for (const r of db.prepare('SELECT * FROM records').all()) {
              const obj = JSON.parse(r.payload);
              if (
                !['visitors', 'invitations', 'hosts'].includes(r.kind) ||
                (r.kind === 'hosts' && !obj.userId) ||
                (r.kind === 'invitations' &&
                  (!obj.createdByUserId || !/^[A-F0-9]{32}$/i.test(obj.inviteCode || '')))
              )
                continue;
              for (const field of [
                'photoUrl',
                'governmentIdNumber',
                'governmentIdNumberMasked',
                'governmentIdType',
                'emergencyContactName',
                'emergencyContactPhone',
              ])
                delete obj[field];
              if (typeof obj.email === 'string') obj.email = obj.email.trim().toLowerCase();
              if (typeof obj.guestEmail === 'string')
                obj.guestEmail = obj.guestEmail.trim().toLowerCase();
              obj.hasBiometricPhoto = false;
              obj.biometricConsentGranted = false;
              const expiry = Date.parse(obj.expiresAt || obj.retentionExpiryDate || '');
              put(scope, r.kind, obj, Number.isFinite(expiry) ? expiry : undefined);
            }
        }
        for (const name of ['records', 'record_expiry', 'audits'])
          if (db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name))
            db.exec(`DROP TABLE ${name}`);
        db.prepare('INSERT INTO schema_migrations VALUES (2,?)').run(now());
        if (scope)
          audit(
            scope,
            'system',
            'SCHEMA_MIGRATION',
            '',
            'Legacy sessions revoked; visitor payloads encrypted; historical copies require separate lifecycle',
          );
      });
      db.exec('PRAGMA wal_checkpoint(TRUNCATE); VACUUM;');
    }
    const metric = (s, event) => {
      db.prepare(
        'INSERT INTO security_metrics VALUES (?,?,1,?) ON CONFLICT(scope,event) DO UPDATE SET count=count+1,last_at=excluded.last_at',
      ).run(s?.scopeId || 'installation', event, now());
    };
    const consume = (key, limit, ms) => {
      db.prepare('DELETE FROM rate_limits WHERE expires<=?').run(Date.now());
      if (
        !db.prepare('SELECT 1 FROM rate_limits WHERE key=?').get(key) &&
        db.prepare('SELECT COUNT(*) AS n FROM rate_limits').get().n >= 20000
      )
        return false;
      return !!db
        .prepare(
          'INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count',
        )
        .get(key, Date.now() + ms, limit);
    };
    function purge() {
      tx(() => {
        for (const s of config.sites) {
          const expired = db
            .prepare(
              'SELECT kind,id,email_hash FROM secure_records WHERE tenant_id=? AND site_id=? AND expires<=?',
            )
            .all(...scoped(s), Date.now());
          let count = 0;
          for (const r of expired) {
            get(s, r.kind, r.id);
            if (!held(s, r.email_hash)) {
              remove(s, r.kind, r.id);
              count++;
            }
          }
          if (count)
            audit(
              s,
              'system',
              'RETENTION_PURGE',
              '',
              `${count} primary records removed; backup erasure journal applies on restore`,
            );
        }
        db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
        for (const table of [
          'auth_challenges',
          'reset_tokens',
          'public_challenges',
          'idempotency',
          'rate_limits',
        ])
          db.prepare(`DELETE FROM ${table} WHERE expires<=?`).run(Date.now());
      });
    }
    const close = () => {
      if (closed) return;
      closed = true;
      db.close();
      if (existsSync(lock) && JSON.parse(readFileSync(lock, 'utf8')).nonce === nonce)
        unlinkSync(lock);
    };
    verifyRecords();
    return {
      db,
      keys,
      dir,
      scoped,
      tx,
      audit,
      verifyAudit,
      verifyRecords,
      checkpoint,
      get,
      put,
      list,
      remove,
      held,
      member,
      grant,
      metric,
      consume,
      purge,
      close,
    };
  } catch (error) {
    try {
      db?.close();
    } catch {}
    if (existsSync(lock) && JSON.parse(readFileSync(lock, 'utf8')).nonce === nonce)
      unlinkSync(lock);
    throw error;
  }
}
