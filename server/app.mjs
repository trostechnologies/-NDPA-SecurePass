import { asyncApp } from './async-app.mjs';
import express from 'express';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { openDatabase } from './database.mjs';
import { digest, equal } from './crypto.mjs';
import {
  registerAuth,
  normalize,
  text,
  emailOK,
  hashPassword,
  safeUser,
  asyncRoute,
} from './auth.mjs';
import { registerPrivacy } from './privacy.mjs';
import { openJournal, replayGovernance, verifyGovernance } from './journal.mjs';
export async function createApplication(
  environment = process.env,
  { maintenance = false, databaseDriver } = {},
) {
  const config = loadConfig(environment),
    store = await openDatabase(config, { driver: databaseDriver });
  try {
    const { db, keys, scoped, tx, audit, get, put, list, remove, member, grant, metric, consume } =
      store;
    if (config.production && !maintenance) {
      const role = await db
        .prepare(
          'SELECT rolsuper,rolcreatedb,rolcreaterole,rolbypassrls FROM pg_roles WHERE rolname=current_user',
        )
        .get();
      if (!role || role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolbypassrls)
        throw Error('Use the restricted SecurePass runtime role, not the Supabase administrator');
    }

    if (
      (await db.prepare("SELECT value FROM installation WHERE key='recovery_required'").get())
        ?.value === 'true' &&
      config.env.SECUREPASS_OPERATOR_RECOVERY !== 'true'
    )
      throw Error(
        'Restored database is quarantined; complete operator credential recovery before serving',
      );
    const journalInitialized = !!(await db
      .prepare("SELECT 1 FROM installation WHERE key='journal_initialized'")
      .get());
    store.journal = await openJournal(
      keys,
      config.env.SECUREPASS_JOURNAL_DIR || path.join(store.dir, 'privacy-journal'),
      { expectExisting: journalInitialized },
    );
    await db
      .prepare("INSERT OR IGNORE INTO installation VALUES ('journal_initialized','true')")
      .run();
    const journal = store.journal.read();
    await store.tx(async () => await replayGovernance(db, journal.entries, keys));
    await verifyGovernance(db, journal.entries);
    for (const row of await db.prepare('SELECT id,receipt FROM erasures').all())
      if (
        !journal.entries.some(
          (e) => e.id === row.id && e.signature === JSON.parse(row.receipt).signature,
        )
      )
        throw Error('Erasure journal is behind the database');
    let integrityHealthy = true;
    const assertIntegrity = async () => {
      try {
        const result = await store.verifyAudit();
        await store.verifyRecords();
        await verifyGovernance(db, store.journal.read().entries);
        integrityHealthy = true;
        return result;
      } catch (error) {
        integrityHealthy = false;
        throw error;
      }
    };
    const app = asyncApp(express());
    app.disable('x-powered-by');
    app.set('trust proxy', config.env.TRUST_PROXY === '1' ? 1 : false);
    const devices = config.env.SECUREPASS_GATE_DEVICES_FILE
      ? JSON.parse(readFileSync(config.env.SECUREPASS_GATE_DEVICES_FILE, 'utf8'))
      : [];
    if (
      config.gateEnabled &&
      (!Array.isArray(devices) ||
        !devices.length ||
        devices.some(
          (d) =>
            !config.sites.some((s) => s.key === d.siteKey) ||
            !text(d.deviceId, 80, true) ||
            !Array.isArray(d.tokenHashes) ||
            !d.tokenHashes.length ||
            d.tokenHashes.some((h) => !/^[a-f0-9]{64}$/.test(h)),
        ))
    )
      throw Error('Gate devices must be explicitly bound to sites and hashed credentials');
    const rate =
      (name, limit, ms, key = (req) => req.ip) =>
      async (req, res, next) => {
        const scope = [
          'global',
          'source',
          'login-account',
          'login-source',
          'login-global',
        ].includes(name)
          ? 'installation'
          : req.scope?.scopeId || 'installation';
        if (!(await consume(`${scope}:${name}:${digest(key(req))}`, limit, ms))) {
          await metric(req.scope, 'rate_limited');
          res.setHeader('Retry-After', String(Math.ceil(ms / 1000)));
          return res.status(429).json({ error: 'Request limit reached; retry later' });
        }
        next();
      };
    app.use((req, res, next) => {
      req.requestId = randomUUID();
      res.setHeader('X-Request-ID', req.requestId);
      res.setHeader('X-Content-Type-Options', 'nosniff');
      res.setHeader('Referrer-Policy', 'no-referrer');
      res.setHeader('X-Frame-Options', 'DENY');
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
      if (config.production) {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
        res.setHeader(
          'Content-Security-Policy',
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
        );
      }
      next();
    });
    app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
    app.get('/api/ready', async (_req, res) => {
      try {
        const auditCapacityAvailable =
          (await db.prepare('SELECT COUNT(*) AS n FROM audit_chain').get()).n < config.maxAudits;
        const ready = integrityHealthy && auditCapacityAvailable;
        res.status(ready ? 200 : 503).json({ ready });
      } catch {
        res.status(503).json({ ready: false });
      }
    });
    app.use(
      '/api',
      rate('global', 1000, 60000, () => 'installation'),
      rate('source', 180, 60000),
    );
    app.use('/api', (req, res, next) => {
      if (!integrityHealthy && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method))
        return res
          .status(503)
          .json({ error: 'Integrity verification failed; operator intervention required' });
      next();
    });
    app.use('/api', (req, res, next) => {
      const key = req.get('X-SecurePass-Site');
      const scope = key
        ? config.sites.find((s) => s.key === key)
        : config.mode === 'isolated'
          ? config.sites[0]
          : null;
      if (!scope) return res.status(404).json({ error: 'Site unavailable; use its reception URL' });
      req.scope = scope;
      next();
    });
    app.use('/api', async (req, res, next) => {
      // The scanner route has independent device authentication and never uses session cookies.
      const deviceRequest = req.method === 'POST' && req.path === '/gate/verify';
      if (
        !deviceRequest &&
        ['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method) &&
        req.get('origin') !== config.origin
      ) {
        await metric(req.scope, 'origin_rejected');
        return res.status(403).json({ error: 'Origin check failed' });
      }
      next();
    });
    app.use('/api', express.json({ limit: '16kb' }));
    const { auth, admin, recent, required } = await registerAuth(app, config, store, rate);
    const publicHost = (h) => ({
      id: h.id,
      name: h.id === 'reception' ? 'Reception' : h.name,
      department: h.department || 'Reception',
      title: h.title || 'Host',
      floor: h.floor || '',
      email: '',
      phone: '',
      avatar: '',
    });
    const privateHosts = async (s) => await list(s, 'hosts', { limit: 1000 });
    async function syncHost(scope, u) {
      if (u.membership_status !== 'active') {
        await remove(scope, 'hosts', u.id);
        return;
      }
      const old = await get(scope, 'hosts', u.id);
      await put(scope, 'hosts', {
        id: u.id,
        userId: u.id,
        name: u.display_name,
        department: u.display_department,
        title: u.display_title,
        floor: old?.floor || 'Reception',
        publicLabel: old?.publicLabel || '',
        publicVisible: old?.publicVisible === true,
      });
    }
    for (const scope of config.sites) {
      await put(scope, 'hosts', {
        id: 'reception',
        name: 'Reception',
        department: 'Reception',
        title: 'Reception',
        floor: 'Reception',
      });
      for (const u of await db
        .prepare('SELECT user_id FROM memberships WHERE tenant_id=? AND site_id=?')
        .all(...scoped(scope)))
        await syncHost(scope, await member(scope, u.user_id));
    }
    const optionalUser = async (req) => {
      const token = (req.headers.cookie || '')
        .split(';')
        .map((x) => x.trim())
        .find((x) => x.startsWith('sp_session='))
        ?.slice(11);
      const r =
        token &&
        (await db
          .prepare(
            'SELECT * FROM sessions WHERE token_hash=? AND tenant_id=? AND site_id=? AND expires_at>?',
          )
          .get(digest(token), ...scoped(req.scope), Date.now()));
      const u = r && (await member(req.scope, r.user_id));
      return u &&
        u.status === 'active' &&
        u.membership_status === 'active' &&
        (!required(u) ||
          (r.mfa_verified_at &&
            (await db.prepare('SELECT 1 FROM factors WHERE user_id=?').get(u.id))))
        ? u
        : null;
    };
    app.get('/api/config', (req, res) =>
      res.json({
        companyName: req.scope.companyName,
        facilityName: req.scope.facilityName,
        address: req.scope.address || '',
        ndpcRegistrationNumber: req.scope.registration || 'Not configured',
        dpoName: req.scope.dpoName || 'Privacy contact',
        dpoEmail: req.scope.dpoEmail,
        dpoPhone: '',
        dataRetentionDays: req.scope.dataRetentionDays,
        noticeVersion: req.scope.noticeVersion,
        privacyNoticeText: req.scope.privacyNoticeText,
        lawfulBasisNotice: 'Refer to the controller-approved privacy notice',
        siteKey: req.scope.key,
        tenantId: req.scope.tenantId,
        siteId: req.scope.siteId,
        gateEnabled: config.gateEnabled,
        photoEnabled: false,
      }),
    );
    app.get('/api/hosts', async (req, res) => {
      const user = await optionalUser(req),
        hosts = await privateHosts(req.scope);
      res.json(
        user
          ? hosts.map((h) => ({
              ...publicHost(h),
              userId: h.userId,
              publicLabel: h.publicLabel || '',
              publicVisible: h.publicVisible === true,
            }))
          : hosts
              .filter((h) => h.id === 'reception' || (req.scope.publicDirectory && h.publicVisible))
              .map((h) => publicHost({ ...h, name: h.publicLabel || h.name })),
      );
    });
    app.patch('/api/hosts/:id', auth, admin, recent, async (req, res) => {
      const host = await get(req.scope, 'hosts', req.params.id),
        x = req.body || {};
      if (!host) return res.status(404).json({ error: 'Not found' });
      if (
        !text(x.floor, 80, true) ||
        !text(x.publicLabel || '', 120) ||
        typeof x.publicVisible !== 'boolean'
      )
        return res
          .status(400)
          .json({ error: 'Floor, public display label and explicit visibility choice required' });
      const saved = {
        ...host,
        floor: x.floor,
        publicLabel: x.publicLabel || '',
        publicVisible: x.publicVisible,
      };
      await tx(async () => {
        await put(req.scope, 'hosts', saved);
        await audit(
          req.scope,
          req.user.id,
          'HOST_DIRECTORY_UPDATED',
          host.id,
          'Controller opt-in is also required before public listing',
        );
      });
      res.json(saved);
    });
    app.get('/api/users', auth, admin, async (req, res) =>
      res.json(
        await Promise.all(
          (
            await db
              .prepare(
                'SELECT user_id FROM memberships WHERE tenant_id=? AND site_id=? ORDER BY name LIMIT 1000',
              )
              .all(...scoped(req.scope))
          ).map(async (r) => safeUser(await member(req.scope, r.user_id))),
        ),
      ),
    );
    app.post(
      '/api/users',
      auth,
      admin,
      recent,
      asyncRoute(async (req, res) => {
        const x = req.body || {};
        if (
          !emailOK(x.email) ||
          !text(x.password, 1024, true) ||
          x.password.length < 16 ||
          !['admin', 'staff'].includes(x.role) ||
          !text(x.name, 120, true) ||
          !text(x.department ?? '', 120) ||
          !text(x.title ?? '', 120)
        )
          return res
            .status(400)
            .json({ error: 'Valid name, email, role and password of 16–1024 characters required' });
        if (
          (
            await db
              .prepare('SELECT COUNT(*) AS n FROM memberships WHERE tenant_id=? AND site_id=?')
              .get(...scoped(req.scope))
          ).n >= 1000
        )
          return res.status(409).json({ error: 'Site user capacity reached' });
        const passwordHash = await hashPassword(x.password);
        const actor = await member(req.scope, req.user.id);
        if (!actor || actor.role !== 'admin' || actor.membership_status !== 'active')
          return res.status(403).json({ error: 'Forbidden' });
        try {
          const id = randomUUID();
          await tx(async () => {
            await db
              .prepare(
                'INSERT INTO users(id,email,name,role,department,title,status,password_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
              )
              .run(
                id,
                normalize(x.email),
                x.name.trim(),
                x.role,
                x.department || '',
                x.title || '',
                'active',
                passwordHash,
                new Date().toISOString(),
              );
            await grant(req.scope, {
              id,
              name: x.name.trim(),
              role: x.role,
              department: x.department || '',
              title: x.title || '',
            });
            await syncHost(req.scope, await member(req.scope, id));
            await audit(req.scope, req.user.id, 'USER_CREATED', id);
          });
          res.status(201).json(safeUser(await member(req.scope, id)));
        } catch (error) {
          if (String(error).includes('UNIQUE'))
            return res.status(409).json({
              error:
                'Account cannot be created; ask the operator about existing-identity membership',
            });
          throw error;
        }
      }),
    );
    app.patch('/api/users/:id', auth, admin, recent, async (req, res) => {
      const old = await member(req.scope, req.params.id),
        x = req.body || {};
      if (!old) return res.status(404).json({ error: 'Not found' });
      if (
        (x.role !== undefined && !['admin', 'staff'].includes(x.role)) ||
        (x.status !== undefined && !['active', 'suspended'].includes(x.status)) ||
        ['name', 'department', 'title'].some(
          (k) => x[k] !== undefined && !text(x[k], 120, k === 'name'),
        )
      )
        return res.status(400).json({ error: 'Invalid update' });
      if (old.id === req.user.id && (x.role === 'staff' || x.status === 'suspended'))
        return res.status(409).json({ error: 'Cannot demote or suspend yourself' });
      await tx(async () => {
        await db
          .prepare(
            'UPDATE memberships SET name=?,role=?,department=?,title=?,status=? WHERE user_id=? AND tenant_id=? AND site_id=?',
          )
          .run(
            x.name ?? old.display_name,
            x.role ?? old.role,
            x.department ?? old.display_department,
            x.title ?? old.display_title,
            x.status ?? old.membership_status,
            old.id,
            ...scoped(req.scope),
          );
        if (x.status === 'suspended' || (x.role && x.role !== old.role)) {
          await db
            .prepare('DELETE FROM sessions WHERE user_id=? AND tenant_id=? AND site_id=?')
            .run(old.id, ...scoped(req.scope));
          await db
            .prepare('DELETE FROM auth_challenges WHERE user_id=? AND tenant_id=? AND site_id=?')
            .run(old.id, ...scoped(req.scope));
        }
        await syncHost(req.scope, await member(req.scope, old.id));
        await audit(req.scope, req.user.id, 'USER_UPDATED', old.id);
      });
      res.json(safeUser(await member(req.scope, old.id)));
    });
    app.delete('/api/users/:id', auth, admin, recent, async (req, res) => {
      if (req.params.id === req.user.id)
        return res.status(409).json({ error: 'Cannot delete yourself' });
      if (!(await member(req.scope, req.params.id)))
        return res.status(404).json({ error: 'Not found' });
      await tx(async () => {
        await db
          .prepare('DELETE FROM sessions WHERE user_id=? AND tenant_id=? AND site_id=?')
          .run(req.params.id, ...scoped(req.scope));
        await db
          .prepare('DELETE FROM auth_challenges WHERE user_id=? AND tenant_id=? AND site_id=?')
          .run(req.params.id, ...scoped(req.scope));
        await db
          .prepare('DELETE FROM memberships WHERE user_id=? AND tenant_id=? AND site_id=?')
          .run(req.params.id, ...scoped(req.scope));
        await remove(req.scope, 'hosts', req.params.id);
        if (!(await db.prepare('SELECT 1 FROM memberships WHERE user_id=?').get(req.params.id)))
          await db.prepare('DELETE FROM users WHERE id=?').run(req.params.id);
        await audit(req.scope, req.user.id, 'SITE_MEMBERSHIP_DELETED', req.params.id);
      });
      res.json({ ok: true });
    });
    app.get('/api/data', auth, async (req, res) => {
      const offset = Number(req.query.offset || 0);
      if (!Number.isSafeInteger(offset) || offset < 0)
        return res.status(400).json({ error: 'Invalid offset' });
      const logs =
        req.user.role === 'admin'
          ? await db
              .prepare(
                'SELECT * FROM audit_chain WHERE tenant_id=? AND site_id=? ORDER BY seq DESC LIMIT 500 OFFSET ?',
              )
              .all(...scoped(req.scope), offset)
          : [];
      res.json({
        visitors: req.user.role === 'admin' ? await list(req.scope, 'visitors', { offset }) : [],
        invitations: await list(req.scope, 'invitations', {
          offset,
          ...(req.user.role === 'staff' ? { owner: req.user.id } : {}),
        }),
        auditLogs: logs.map((a) => ({
          id: String(a.seq),
          timestamp: a.at,
          actor: a.actor,
          action: a.action,
          details: a.detail,
          lawfulBasis: '',
          complianceArticle: 'Tamper-evident operational log',
          hash: a.mac,
        })),
        users:
          req.user.role === 'admin' && offset === 0
            ? await Promise.all(
                (
                  await db
                    .prepare('SELECT user_id FROM memberships WHERE tenant_id=? AND site_id=?')
                    .all(...scoped(req.scope))
                ).map(async (r) => safeUser(await member(req.scope, r.user_id))),
              )
            : [],
        pageSize: 500,
      });
    });
    const capacity = async (req, res, next) =>
      (
        await db
          .prepare(
            "SELECT COUNT(*) AS n FROM secure_records WHERE tenant_id=? AND site_id=? AND kind IN ('visitors','invitations')",
          )
          .get(...scoped(req.scope))
      ).n >= config.maxRecords
        ? res.status(503).json({ error: 'Site record capacity reached; contact reception' })
        : next();
    app.post(
      '/api/invitations',
      auth,
      capacity,
      rate('invite-user', 50, 3600000, (req) => req.user.id),
      async (req, res) => {
        const x = req.body || {},
          allowed = [
            'id',
            'inviteCode',
            'guestName',
            'guestEmail',
            'guestPhone',
            'guestOrganization',
            'hostEmployeeId',
            'hostEmployeeName',
            'hostDepartment',
            'expectedDate',
            'expectedTime',
            'purpose',
            'status',
            'createdAt',
            'specialInstructions',
            'parkingReserved',
          ];
        if (
          Object.keys(x).some((k) => !allowed.includes(k)) ||
          !emailOK(x.guestEmail) ||
          !text(x.guestName, 180, true) ||
          !text(x.hostEmployeeId, 120, true) ||
          !text(x.guestPhone ?? '', 40) ||
          !text(x.guestOrganization ?? '', 160) ||
          !text(x.purpose ?? '', 300) ||
          !text(x.specialInstructions ?? '', 500) ||
          !/^\d{4}-\d{2}-\d{2}$/.test(x.expectedDate || '') ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(x.expectedTime || '')
        )
          return res.status(400).json({ error: 'Invalid invitation fields' });
        const host = await get(req.scope, 'hosts', x.hostEmployeeId);
        if (!host) return res.status(400).json({ error: 'Unknown host' });
        if (req.user.role !== 'admin' && host.userId !== req.user.id)
          return res.status(403).json({ error: 'Cannot invite for another host' });
        const end = Date.parse(`${x.expectedDate}T23:59:59+01:00`),
          date = new Intl.DateTimeFormat('en-CA', {
            timeZone: 'Africa/Lagos',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
          });
        if (
          !Number.isFinite(end) ||
          date.format(new Date(end)) !== x.expectedDate ||
          end <= Date.now() ||
          end > Date.now() + req.scope.dataRetentionDays * 86400000
        )
          return res.status(400).json({ error: 'Visit date must be within the retention window' });
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
          createdAt: new Date().toISOString(),
          createdByUserId: req.user.id,
          expiresAt: new Date(end).toISOString(),
        };
        await tx(async () => {
          await put(req.scope, 'invitations', entry, end);
          await audit(req.scope, req.user.id, 'INVITE_CREATED', entry.id);
        });
        res.status(201).json(entry);
      },
    );
    const usable = async (scope, code) => {
      if (typeof code !== 'string' || !/^[A-F0-9]{32}$/i.test(code)) return null;
      const i = (await list(scope, 'invitations', { code, limit: 1 }))[0];
      return i &&
        i.status === 'pending' &&
        Date.parse(i.expiresAt) > Date.now() &&
        (await get(scope, 'hosts', i.hostEmployeeId))
        ? i
        : null;
    };
    app.post('/api/invitations/lookup', rate('lookup', 10, 60000), async (req, res) => {
      const i = await usable(req.scope, req.body?.inviteCode);
      if (!i) return res.status(404).json({ error: 'Invitation unavailable' });
      const host = await get(req.scope, 'hosts', i.hostEmployeeId),
        label =
          req.scope.publicDirectory && host.publicVisible
            ? publicHost({ ...host, name: host.publicLabel || host.name })
            : {
                ...publicHost({ id: host.id, name: 'Invited host', department: 'Reception' }),
                floor: '',
              };
      res.json({
        id: i.id,
        hostEmployeeId: i.hostEmployeeId,
        publicHost: label,
        expectedDate: i.expectedDate,
        expectedTime: i.expectedTime,
      });
    });
    app.post('/api/checkin/challenge', rate('proof-issue', 20, 60000), async (req, res) => {
      await db.prepare('DELETE FROM public_challenges WHERE expires<=?').run(Date.now());
      if ((await db.prepare('SELECT COUNT(*) AS n FROM public_challenges').get()).n >= 5000)
        return res.status(503).json({ error: 'Reception busy; retry later' });
      const token = randomBytes(32).toString('base64url');
      await db
        .prepare('INSERT INTO public_challenges VALUES (?,?,?,?,?)')
        .run(digest(token), ...scoped(req.scope), digest(req.ip), Date.now() + 120000);
      res.json({ token, difficulty: config.proofDifficulty, expiresInSeconds: 120 });
    });
    app.post(
      '/api/checkin',
      rate('checkin', 10, 60000),
      rate('checkin-global', 100, 3600000, () => 'installation'),
      async (req, res) => {
        const x = req.body || {};
        const allowed = [
          'fullName',
          'email',
          'phone',
          'organization',
          'purpose',
          'hostEmployeeId',
          'generalConsentGranted',
          'noticeVersion',
          'inviteCode',
          'idempotencyKey',
          'proof',
          'website',
        ];
        if (Object.keys(x).some((key) => !allowed.includes(key)))
          return res
            .status(400)
            .json({ error: 'Unsupported check-in fields; photo and ID collection are disabled' });
        if (
          !text(x.fullName, 180, true) ||
          !emailOK(x.email) ||
          !text(x.phone, 40, true) ||
          !text(x.organization ?? '', 160) ||
          !text(x.purpose ?? '', 300) ||
          x.generalConsentGranted !== true ||
          x.noticeVersion !== req.scope.noticeVersion ||
          !text(x.hostEmployeeId, 120, true) ||
          !text(x.idempotencyKey, 100, true) ||
          x.idempotencyKey.length < 32 ||
          x.website
        )
          return res
            .status(400)
            .json({ error: 'Invalid check-in or outdated privacy acknowledgement' });
        const host = await get(req.scope, 'hosts', x.hostEmployeeId);
        if (!host) return res.status(400).json({ error: 'Unknown host' });
        const fingerprint = keys.blind(
          req.scope.scopeId,
          JSON.stringify([
            x.fullName.trim(),
            normalize(x.email),
            x.phone.trim(),
            host.id,
            x.organization || '',
            x.purpose || '',
            x.inviteCode || '',
            x.noticeVersion,
          ]),
        );
        const requestHash = keys.blind(req.scope.scopeId, x.idempotencyKey),
          existing = await db
            .prepare(
              'SELECT * FROM idempotency WHERE key_hash=? AND tenant_id=? AND site_id=? AND expires>?',
            )
            .get(requestHash, ...scoped(req.scope), Date.now());
        if (existing) {
          if (existing.fingerprint !== fingerprint)
            return res
              .status(409)
              .json({ error: 'Submission key already used for different details' });
          const saved = await get(req.scope, 'visitors', existing.visitor_id);
          return saved
            ? res.status(201).json(saved)
            : res.status(410).json({ error: 'Registration no longer available' });
        }
        if (
          (
            await db
              .prepare(
                "SELECT COUNT(*) AS n FROM secure_records WHERE tenant_id=? AND site_id=? AND kind IN ('visitors','invitations')",
              )
              .get(...scoped(req.scope))
          ).n >= config.maxRecords
        )
          return res.status(503).json({ error: 'Site record capacity reached; contact reception' });
        const result = await tx(async () => {
          const retry = await db
            .prepare(
              'SELECT * FROM idempotency WHERE key_hash=? AND tenant_id=? AND site_id=? AND expires>?',
            )
            .get(requestHash, ...scoped(req.scope), Date.now());
          if (retry) {
            if (retry.fingerprint !== fingerprint)
              return { error: 'Submission key already used for different details' };
            const visitor = await get(req.scope, 'visitors', retry.visitor_id);
            return visitor
              ? { visitor, replayed: true }
              : { error: 'Registration no longer available' };
          }
          if (
            (
              await db
                .prepare(
                  "SELECT COUNT(*) AS n FROM secure_records WHERE tenant_id=? AND site_id=? AND kind IN ('visitors','invitations')",
                )
                .get(...scoped(req.scope))
            ).n >= config.maxRecords
          )
            return { error: 'Site record capacity reached; contact reception' };
          const proof = x.proof,
            challenge =
              proof &&
              text(proof.token, 100, true) &&
              text(proof.answer, 20, true) &&
              (await db
                .prepare(
                  'SELECT * FROM public_challenges WHERE token_hash=? AND tenant_id=? AND site_id=? AND source_hash=? AND expires>?',
                )
                .get(digest(proof.token), ...scoped(req.scope), digest(req.ip), Date.now()));
          if (
            !challenge ||
            !digest(`${proof.token}:${proof.answer}`).startsWith('0'.repeat(config.proofDifficulty))
          )
            return { status: 400, error: 'Reception verification expired; retry the submission' };
          const invite = x.inviteCode ? await usable(req.scope, x.inviteCode) : null,
            today = new Intl.DateTimeFormat('en-CA', {
              timeZone: 'Africa/Lagos',
              year: 'numeric',
              month: '2-digit',
              day: '2-digit',
            }).format(new Date());
          if (
            x.inviteCode &&
            (!invite ||
              invite.hostEmployeeId !== host.id ||
              normalize(invite.guestEmail) !== normalize(x.email) ||
              invite.expectedDate !== today)
          )
            return { error: 'Invitation unavailable, wrong date, or guest details do not match' };
          if (!invite && !req.scope.publicDirectory && host.id !== 'reception')
            return { error: 'Use an invitation or contact reception for this host' };
          if (
            (
              await list(req.scope, 'visitors', {
                email: x.email,
                host: host.id,
                status: 'checked_in',
                limit: 1,
              })
            ).length
          )
            return { error: 'An active visit already exists; contact reception' };
          const consumed = await db
            .prepare('DELETE FROM public_challenges WHERE token_hash=?')
            .run(digest(proof.token));
          if (!consumed.changes) return { error: 'Reception verification already used' };
          const expires = Date.now() + req.scope.dataRetentionDays * 86400000;
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
            hostFloor: host.floor || '',
            visitType: invite ? 'pre_registered' : 'walk_in',
            generalConsentGranted: true,
            noticeVersion: req.scope.noticeVersion,
            noticeHash: req.scope.noticeHash,
            consentTimestamp: new Date().toISOString(),
            hasBiometricPhoto: false,
            biometricConsentGranted: false,
            status: 'checked_in',
            checkInTime: new Date().toISOString(),
            retentionExpiryDate: new Date(expires).toISOString(),
            passCode: randomBytes(12).toString('hex').toUpperCase(),
            badgeId: randomBytes(24).toString('hex').toUpperCase(),
            badgePrinted: false,
            securityClearance: 'Standard',
            wifiAccessGranted: false,
            accessStatus: config.gateEnabled ? 'pending' : 'reception_only',
            tenantId: req.scope.tenantId,
            siteId: req.scope.siteId,
          };
          await put(req.scope, 'visitors', v, expires);
          if (invite) {
            invite.status = 'checked_in';
            invite.visitorId = v.id;
            await put(req.scope, 'invitations', invite, Date.parse(invite.expiresAt));
          }
          await db
            .prepare('INSERT INTO idempotency VALUES (?,?,?,?,?,?)')
            .run(requestHash, ...scoped(req.scope), fingerprint, v.id, Date.now() + 86400000);
          await audit(req.scope, 'public', 'CHECK_IN', v.id);
          return { visitor: v };
        });
        if (result.error) return res.status(result.status || 409).json({ error: result.error });
        res.status(result.replayed ? 200 : 201).json(result.visitor);
      },
    );
    app.patch('/api/visitors/:id/checkout', auth, admin, async (req, res) => {
      const v = await tx(async () => {
        const v = await get(req.scope, 'visitors', req.params.id);
        if (!v) return null;
        v.status = 'checked_out';
        v.checkOutTime = new Date().toISOString();
        v.accessStatus = 'revoked';
        await put(req.scope, 'visitors', v);
        await audit(req.scope, req.user.id, 'CHECK_OUT', v.id, 'Online gate permission revoked');
        return v;
      });
      if (!v) return res.status(404).json({ error: 'Not found' });
      res.json(v);
    });
    app.post('/api/visitors/:id/authorize', auth, admin, recent, async (req, res) => {
      if (!config.gateEnabled)
        return res.status(409).json({ error: 'Gate integration is disabled' });
      const v = await tx(async () => {
        const v = await get(req.scope, 'visitors', req.params.id);
        if (!v || v.status !== 'checked_in') return null;
        v.accessStatus = 'authorized';
        v.accessExpiresAt = new Date(Date.now() + config.gateHours * 3600000).toISOString();
        await put(req.scope, 'visitors', v);
        await audit(req.scope, req.user.id, 'GATE_PASS_AUTHORIZED', v.id);
        return v;
      });
      if (!v) return res.status(404).json({ error: 'Active visitor not found' });
      res.json(v);
    });
    app.post('/api/gate/verify', rate('gate-source', 120, 60000), async (req, res) => {
      const token = req.get('authorization')?.replace(/^Bearer /, '');
      const device =
        config.gateEnabled &&
        token &&
        devices.find(
          (d) =>
            d.enabled !== false &&
            d.siteKey === req.scope.key &&
            d.tokenHashes.some((h) => equal(h, digest(token))),
        );
      if (!device) return res.status(401).json({ error: 'Device authentication failed' });
      const reference = req.body?.reference,
        badge =
          typeof reference === 'string' && reference.startsWith('SECUREPASS-REFERENCE:')
            ? reference.slice(21)
            : req.body?.badgeId;
      const v = text(badge, 100, true)
        ? (await list(req.scope, 'visitors', { badge, limit: 1 }))[0]
        : null;
      const allowed = !!(
        v &&
        v.status === 'checked_in' &&
        v.accessStatus === 'authorized' &&
        Date.parse(v.accessExpiresAt) > Date.now() &&
        Date.parse(v.retentionExpiryDate) > Date.now()
      );
      if (allowed) await audit(req.scope, `device:${device.deviceId}`, 'GATE_ALLOW', v.id);
      else await metric(req.scope, 'gate_denied');
      res.json({
        allowed,
        decisionId: randomUUID(),
        ...(allowed
          ? { expiresAt: v.accessExpiresAt }
          : { reason: 'Credential inactive or unavailable' }),
      });
    });
    registerPrivacy(app, config, store, { auth, admin, recent });
    const auditStatus = async (scope) => {
      await assertIntegrity();
      return {
        ok: true,
        siteEntries: (
          await db
            .prepare('SELECT COUNT(*) AS n FROM audit_chain WHERE tenant_id=? AND site_id=?')
            .get(...scoped(scope))
        ).n,
      };
    };
    app.get('/api/audit/verify', auth, admin, async (req, res) =>
      res.json(await auditStatus(req.scope)),
    );
    app.get('/api/security/metrics', auth, admin, async (req, res) =>
      res.json({
        counters: await db
          .prepare('SELECT event,count,last_at FROM security_metrics WHERE scope=?')
          .all(req.scope.scopeId),
        audit: await auditStatus(req.scope),
        storage: {
          records: (
            await db
              .prepare('SELECT COUNT(*) AS n FROM secure_records WHERE tenant_id=? AND site_id=?')
              .get(...scoped(req.scope))
          ).n,
          capacity: config.maxRecords,
        },
      }),
    );
    app.post('/api/purge', auth, admin, async (req, res) => {
      await store.purge();
      res.json({ ok: true });
    });
    app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found' }));
    if (config.production || config.env.SECUREPASS_SERVE_DIST === 'true') {
      app.use(
        express.static(path.resolve(config.env.SECUREPASS_DIST_DIR || 'dist'), { index: false }),
      );
      app.get('*', (_req, res) =>
        res.sendFile(path.resolve(config.env.SECUREPASS_DIST_DIR || 'dist', 'index.html')),
      );
    }
    app.use(async (error, req, res, next) => {
      await metric(req.scope, 'request_error').catch(() => {});
      const status = [400, 409, 413, 503].includes(error.status) ? error.status : 500;
      console.error(
        JSON.stringify({
          event: 'request_error',
          requestId: req.requestId,
          status,
          code: error.code || error.type || 'internal',
        }),
      );
      res.status(status).json({
        error:
          status === 500
            ? 'Server error'
            : status === 413
              ? 'Request too large'
              : status === 400
                ? 'Invalid request'
                : error.message,
        requestId: req.requestId,
      });
    });
    let timer;
    if (!maintenance) {
      await store.purge();
      timer = setInterval(async () => {
        try {
          await assertIntegrity();
          await store.purge();
        } catch (error) {
          await metric(null, 'integrity_or_purge_failed').catch(() => {});
          console.error(
            JSON.stringify({ event: 'integrity_or_purge_failed', code: error.code || 'internal' }),
          );
        }
      }, 60000);
      timer.unref();
    }
    return {
      app,
      config,
      store,
      async close() {
        clearInterval(timer);
        await store.close();
      },
    };
  } catch (error) {
    await store.close();
    throw error;
  }
}
