import { requestContext } from './request-context.mjs';
import { openPostgres } from './postgres.mjs';
import { mkdirSync, readFileSync, writeFileSync, renameSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
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
export async function openDatabase(config, { driver } = {}) {
  const dir = path.resolve(config.env.SECUREPASS_DATA_DIR || './securepass-data');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keys = loadKeys(config.env, dir, config.production);
  let db;
  try {
    db = driver || (await openPostgres(config.env));
    await db.acquireWriter();
    const anchorFile = path.join(dir, 'audit-head.json');
    let closed = false,
      exportedSequence = -1;
    const scoped = (s) => [s.tenantId, s.siteId];
    const previous = await db.prepare("SELECT value FROM installation WHERE key='binding'").get();
    const binding = config.mode === 'isolated' ? `isolated:${config.sites[0].scopeId}` : 'shared';
    if (previous && previous.value !== binding)
      throw Error(
        'Database deployment binding differs; use an explicit migration into a different database',
      );
    await db.prepare("INSERT OR IGNORE INTO installation VALUES ('binding',?)").run(binding);
    const priorScopes = await db.prepare("SELECT value FROM installation WHERE key='scopes'").get();
    const scopeIds = config.sites.map((s) => s.scopeId).sort();
    if (priorScopes && JSON.parse(priorScopes.value).some((id) => !scopeIds.includes(id)))
      throw Error('Removing a customer/site requires an explicit reviewed data migration');
    await db
      .prepare("INSERT OR REPLACE INTO installation VALUES ('scopes',?)")
      .run(JSON.stringify(scopeIds));
    const now = () => new Date().toISOString();
    const baseHead = async () => {
      const r = await db.prepare('SELECT * FROM audit_checkpoint WHERE id=1').get();
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
    const head = async () =>
      (await db.prepare('SELECT seq,mac FROM audit_chain ORDER BY seq DESC LIMIT 1').get()) ||
      (await baseHead());
    const checkpoint = async () => {
      const h = await head(),
        body = JSON.stringify(h),
        record = { ...h, signature: keys.sign(body) };
      const temp = anchorFile + '.' + randomBytes(16).toString('hex') + '.tmp';
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
    const tx = async (fn) => {
      const nested = db.inTransaction();
      const result = await db.transaction(async () => {
        const principal = requestContext.getStore();
        if (!nested && principal) {
          const current = await member(principal.scope, principal.userId);
          const session = await db
            .prepare(
              'SELECT 1 FROM sessions WHERE token_hash=? AND user_id=? AND tenant_id=? AND site_id=? AND expires_at>?',
            )
            .get(principal.tokenHash, principal.userId, ...scoped(principal.scope), Date.now());
          if (
            !session ||
            !current ||
            current.status !== 'active' ||
            current.membership_status !== 'active' ||
            current.role !== principal.role
          )
            throw Object.assign(Error('Authentication changed; sign in again'), { status: 401 });
        }
        return fn();
      });
      if (!nested) await checkpoint();
      return result;
    };
    const auditBody = auditEventBody;
    async function verifyAudit() {
      const base = await baseHead();
      let prior = base.mac,
        seq = base.seq;
      for (const r of await db.prepare('SELECT * FROM audit_chain ORDER BY seq').all()) {
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
              ? await db.prepare('SELECT mac FROM audit_chain WHERE seq=?').get(a.seq)
              : { mac: '0'.repeat(64) };
        if (!row || !equal(row.mac, a.mac) || a.seq > seq)
          throw Error('Audit tail rollback detected');
      } else if (seq) throw Error('Audit checkpoint missing; independent recovery required');
      return { ok: true, seq, head: prior };
    }
    await verifyAudit();
    for (const s of config.sites) {
      const body = {
        controller: s.companyName,
        facility: s.facilityName,
        contact: s.dpoEmail,
        notice: s.privacyNoticeText,
        retentionDays: s.dataRetentionDays,
      };
      const hash = keys.blind(s.scopeId, JSON.stringify(body)),
        old = await db
          .prepare('SELECT hash FROM notice_versions WHERE tenant_id=? AND site_id=? AND version=?')
          .get(...scoped(s), s.noticeVersion);
      if (old && old.hash !== hash) throw Error('Privacy notice changed without a new version');
      await db
        .prepare('INSERT OR IGNORE INTO notice_versions VALUES (?,?,?,?,?,?)')
        .run(
          ...scoped(s),
          s.noticeVersion,
          hash,
          keys.seal(body, `notice:${s.scopeId}:${s.noticeVersion}`),
          now(),
        );
      s.noticeHash = hash;
    }
    const audit = async (scope, actor, action, target = '', detail = '') =>
      await tx(async () => {
        const h = await head();
        if ((await db.prepare('SELECT COUNT(*) AS n FROM audit_chain').get()).n >= config.maxAudits)
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
        await db
          .prepare('INSERT INTO audit_chain VALUES (?,?,?,?,?,?,?,?,?,?)')
          .run(r.seq, r.at, r.tenant_id, r.site_id, actor, action, target, r.detail, h.mac, mac);
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
    const put = async (s, kind, obj, expires) => {
      const old = await db
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
      await db
        .prepare('INSERT OR REPLACE INTO secure_records VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)')
        .run(
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
    const get = async (s, kind, id) =>
      decode(
        s,
        await db
          .prepare(
            'SELECT * FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=? AND id=?',
          )
          .get(...scoped(s), kind, id),
      );
    const verifyRecords = async () => {
      const scopes = new Map(config.sites.map((s) => [s.scopeId, s]));
      for (const row of await db.prepare('SELECT * FROM secure_records').all()) {
        const scope = scopes.get(`${row.tenant_id}:${row.site_id}`);
        if (!scope) throw Error('Record belongs to an unregistered scope');
        decode(scope, row);
      }
      for (const n of await db.prepare('SELECT * FROM notice_versions').all()) {
        const scope = `${n.tenant_id}:${n.site_id}`,
          body = keys.open(n.cipher, `notice:${scope}:${n.version}`);
        if (keys.blind(scope, JSON.stringify(body)) !== n.hash)
          throw Error('Privacy notice integrity failure');
      }
      for (const f of await db.prepare('SELECT * FROM factors').all()) {
        keys.open(f.secret_cipher, `mfa:${f.user_id}`);
        keys.open(f.recovery_cipher, `recovery:${f.user_id}`);
      }
      for (const r of await db.prepare('SELECT * FROM privacy_requests').all())
        openPrivacyRecord(keys, r);
      for (const c of await db
        .prepare('SELECT * FROM auth_challenges WHERE secret_cipher IS NOT NULL')
        .all())
        keys.open(c.secret_cipher, `challenge:${c.token_hash}`);
      return true;
    };
    const list = async (s, kind, filter = {}) => {
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
      return (await db.prepare(sql).all(...values)).map((r) => decode(s, r));
    };
    const held = async (s, emailHash) =>
      !!(await db
        .prepare(
          'SELECT 1 FROM legal_holds WHERE tenant_id=? AND site_id=? AND subject_hash=? AND released_at IS NULL LIMIT 1',
        )
        .get(...scoped(s), emailHash));
    const remove = async (s, kind, id) => {
      const row = await db
        .prepare(
          'SELECT email_hash FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=? AND id=?',
        )
        .get(...scoped(s), kind, id);
      if (row && (await held(s, row.email_hash)))
        throw Object.assign(Error('Record is subject to a legal hold'), { status: 409 });
      await db
        .prepare('DELETE FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=? AND id=?')
        .run(...scoped(s), kind, id);
    };
    const member = async (s, id) =>
      await db
        .prepare(
          'SELECT u.*,m.role AS role,m.status AS membership_status,m.name AS display_name,m.department AS display_department,m.title AS display_title FROM users u JOIN memberships m ON m.user_id=u.id WHERE u.id=? AND m.tenant_id=? AND m.site_id=?',
        )
        .get(id, ...scoped(s));
    const grant = async (s, u, role = u.role) =>
      await db
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
    const metric = async (s, event) => {
      await db
        .prepare(
          'INSERT INTO security_metrics VALUES (?,?,1,?) ON CONFLICT(scope,event) DO UPDATE SET count=count+1,last_at=excluded.last_at',
        )
        .run(s?.scopeId || 'installation', event, now());
    };
    const consume = async (key, limit, ms) => {
      await db.prepare('DELETE FROM rate_limits WHERE expires<=?').run(Date.now());
      if (
        !(await db.prepare('SELECT 1 FROM rate_limits WHERE key=?').get(key)) &&
        (await db.prepare('SELECT COUNT(*) AS n FROM rate_limits').get()).n >= 20000
      )
        return false;
      return !!(await db
        .prepare(
          'INSERT INTO rate_limits VALUES (?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 WHERE count<? RETURNING count',
        )
        .get(key, Date.now() + ms, limit));
    };
    async function purge() {
      await tx(async () => {
        for (const s of config.sites) {
          const expired = await db
            .prepare(
              'SELECT kind,id,email_hash FROM secure_records WHERE tenant_id=? AND site_id=? AND expires<=?',
            )
            .all(...scoped(s), Date.now());
          let count = 0;
          for (const r of expired) {
            await get(s, r.kind, r.id);
            if (!(await held(s, r.email_hash))) {
              await remove(s, r.kind, r.id);
              count++;
            }
          }
          if (count)
            await audit(
              s,
              'system',
              'RETENTION_PURGE',
              '',
              `${count} primary records removed; backup erasure journal applies on restore`,
            );
        }
        await db.prepare('DELETE FROM sessions WHERE expires_at<=?').run(Date.now());
        for (const table of [
          'auth_challenges',
          'reset_tokens',
          'public_challenges',
          'idempotency',
          'rate_limits',
        ])
          await db.prepare(`DELETE FROM ${table} WHERE expires<=?`).run(Date.now());
      });
    }
    const close = async () => {
      if (closed) return;
      closed = true;
      await db.close();
    };
    await verifyRecords();
    writeFileSync(path.join(dir, '.database-initialized'), 'postgres', { mode: 0o600 });
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
      await db?.close();
    } catch {}
    throw error;
  }
}
