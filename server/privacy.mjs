import { randomUUID } from 'node:crypto';
import { text } from './auth.mjs';
import { openPrivacyRecord } from './crypto.mjs';
const reference = (x) => typeof x === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._/-]{2,79}$/.test(x);
export function registerPrivacy(app, config, store, { auth, admin, recent }) {
  const { db, keys, dir, scoped, tx, audit, get, list, remove, held } = store;
  const find = async (s, id) => {
    const r = await db
      .prepare('SELECT * FROM privacy_requests WHERE id=? AND tenant_id=? AND site_id=?')
      .get(id, ...scoped(s));
    if (!r) return null;
    openPrivacyRecord(keys, r);
    return r;
  };
  const setStatus = async (s, r, status) => {
    const body = keys.open(r.cipher, `privacy:${s.scopeId}:${r.id}`);
    await db
      .prepare('UPDATE privacy_requests SET status=?,cipher=? WHERE id=?')
      .run(status, keys.seal({ ...body, status }, `privacy:${s.scopeId}:${r.id}`), r.id);
  };
  const requestBody = (s, r) => ({
    ...keys.open(r.cipher, `privacy:${s.scopeId}:${r.id}`),
    id: r.id,
    visitorId: r.visitor_id,
    type: r.type,
    status: r.status,
    requestedBy: r.requested_by,
    verifiedBy: r.verified_by,
    createdAt: r.created_at,
  });
  async function erase(scope, actor, r) {
    const visitor = await get(scope, 'visitors', r.visitor_id);
    if (!visitor) throw Object.assign(Error('Visitor no longer available'), { status: 409 });
    const subjectHash = keys.blind(scope.scopeId, visitor.email);
    if (await held(scope, subjectHash))
      throw Object.assign(Error('Subject has an active legal hold'), { status: 409 });
    const records = (
      await Promise.all(
        ['visitors', 'invitations'].map(async (kind) =>
          (await list(scope, kind, { email: visitor.email, limit: config.maxRecords })).map(
            (v) => ({
              kind,
              id: v.id,
            }),
          ),
        ),
      )
    ).flat();
    const verified = keys.open(r.cipher, `privacy:${scope.scopeId}:${r.id}`);
    const body = {
      version: 1,
      action: 'erase',
      id: randomUUID(),
      tenantId: scope.tenantId,
      siteId: scope.siteId,
      requestId: r.id,
      subjectHash,
      records,
      at: new Date().toISOString(),
      actor,
      approvedBy: r.verified_by,
      identityVerification: {
        caseReferenceHash: keys.blind(scope.scopeId, verified.verificationReference),
        method: verified.verificationMethod,
        verifiedAt: verified.verifiedAt,
      },
      extent:
        'Primary records erased; managed backups enforce signed erasure replay before restore and authenticated copy expiry',
      backupMaximumAgeDays: Math.min(...config.sites.map((s) => s.backupRetentionDays)),
    };
    // The independent signed journal is written and fsynced BEFORE deletion. If the
    // DB transaction fails, approved erasure intent remains authoritative on restore.
    const receipt = store.journal.append(body);
    for (const entry of records) await remove(scope, entry.kind, entry.id);
    await db
      .prepare('INSERT INTO erasures VALUES (?,?,?,?,?,?,?)')
      .run(
        body.id,
        ...scoped(scope),
        subjectHash,
        JSON.stringify(records),
        body.at,
        JSON.stringify(receipt),
      );
    await setStatus(scope, r, 'fulfilled');
    await audit(
      scope,
      actor,
      'VERIFIED_ERASURE',
      r.id,
      `${records.length} primary records deleted; signed restore journal recorded`,
    );
    return receipt;
  }
  app.get('/api/privacy', auth, admin, async (req, res) => {
    res.json({
      requests: await Promise.all(
        (
          await db
            .prepare(
              'SELECT * FROM privacy_requests WHERE tenant_id=? AND site_id=? ORDER BY created_at DESC LIMIT 200',
            )
            .all(...scoped(req.scope))
        ).map(async (r) => requestBody(req.scope, await find(req.scope, r.id))),
      ),
      holds: await db
        .prepare(
          'SELECT id,case_ref,created_by,created_at,released_at FROM legal_holds WHERE tenant_id=? AND site_id=? ORDER BY created_at DESC LIMIT 200',
        )
        .all(...scoped(req.scope)),
    });
  });
  app.post('/api/privacy/requests', auth, admin, recent, async (req, res) => {
    const x = req.body || {};
    if (
      !['access', 'erase'].includes(x.type) ||
      !text(x.visitorId, 100, true) ||
      !(await get(req.scope, 'visitors', x.visitorId))
    )
      return res.status(400).json({ error: 'Valid visitor and request type required' });
    const id = randomUUID(),
      body = {
        verificationReference: null,
        verificationMethod: null,
        visitorId: x.visitorId,
        type: x.type,
        requestedBy: req.user.id,
        verifiedBy: null,
        status: 'pending',
      };
    await tx(async () => {
      await db
        .prepare('INSERT INTO privacy_requests VALUES (?,?,?,?,?,?,?,?,?,?)')
        .run(
          id,
          ...scoped(req.scope),
          x.visitorId,
          x.type,
          'pending',
          req.user.id,
          null,
          keys.seal(body, `privacy:${req.scope.scopeId}:${id}`),
          new Date().toISOString(),
        );
      await audit(req.scope, req.user.id, 'PRIVACY_REQUEST_CREATED', id, x.type);
    });
    res.status(201).json(requestBody(req.scope, await find(req.scope, id)));
  });
  app.post('/api/privacy/requests/:id/verify', auth, admin, recent, async (req, res) => {
    const r = await find(req.scope, req.params.id),
      x = req.body || {};
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.status !== 'pending' || r.requested_by === req.user.id)
      return res
        .status(409)
        .json({ error: 'A different administrator must verify the pending request' });
    if (
      !reference(x.verificationReference) ||
      !['in_person', 'verified_contact'].includes(x.verificationMethod)
    )
      return res
        .status(400)
        .json({ error: 'Identity-verification method and non-sensitive case reference required' });
    await tx(async () => {
      const body = {
        ...keys.open(r.cipher, `privacy:${req.scope.scopeId}:${r.id}`),
        verificationReference: x.verificationReference,
        verificationMethod: x.verificationMethod,
        verifiedAt: new Date().toISOString(),
        verifiedBy: req.user.id,
        status: 'verified',
      };
      await db
        .prepare("UPDATE privacy_requests SET status='verified',verified_by=?,cipher=? WHERE id=?")
        .run(req.user.id, keys.seal(body, `privacy:${req.scope.scopeId}:${r.id}`), r.id);
      await audit(
        req.scope,
        req.user.id,
        'PRIVACY_IDENTITY_VERIFIED',
        r.id,
        'Independent approval recorded; external evidence retained in controller case system',
      );
    });
    res.json(requestBody(req.scope, await find(req.scope, r.id)));
  });
  app.get('/api/privacy/requests/:id/export', auth, admin, recent, async (req, res) => {
    const r = await find(req.scope, req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.type !== 'access' || !['verified', 'fulfilled'].includes(r.status))
      return res.status(409).json({ error: 'Verified access request required' });
    const v = await get(req.scope, 'visitors', r.visitor_id);
    if (!v) return res.status(410).json({ error: 'Data no longer available' });
    const output = {
      request: requestBody(req.scope, r),
      controller: req.scope.companyName,
      site: req.scope.facilityName,
      generatedAt: new Date().toISOString(),
      visitors: await list(req.scope, 'visitors', { email: v.email, limit: config.maxRecords }),
      invitations: await list(req.scope, 'invitations', {
        email: v.email,
        limit: config.maxRecords,
      }),
      notices: (
        await db
          .prepare('SELECT version,cipher FROM notice_versions WHERE tenant_id=? AND site_id=?')
          .all(...scoped(req.scope))
      ).map((n) => ({
        version: n.version,
        ...keys.open(n.cipher, `notice:${req.scope.scopeId}:${n.version}`),
      })),
      notice: 'Controller-approved disclosure; this application does not certify legal compliance',
    };
    await tx(async () => {
      await setStatus(req.scope, r, 'fulfilled');
      await audit(req.scope, req.user.id, 'VERIFIED_ACCESS_EXPORT', r.id);
    });
    res.setHeader('Content-Disposition', `attachment; filename="privacy-request-${r.id}.json"`);
    res.json(output);
  });
  app.post('/api/privacy/requests/:id/fulfill', auth, admin, recent, async (req, res) => {
    const r = await find(req.scope, req.params.id);
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.type !== 'erase' || r.status !== 'verified')
      return res.status(409).json({ error: 'Independently verified erasure request required' });
    const receipt = await tx(async () => await erase(req.scope, req.user.id, r));
    res.json({ ok: true, receipt });
  });
  // Legacy endpoint now refuses unverified one-click deletion.
  app.post('/api/visitors/:id/erase', auth, admin, recent, async (req, res) => {
    const r = text(req.body?.requestId, 100, true) && (await find(req.scope, req.body.requestId));
    if (!r || r.visitor_id !== req.params.id || r.type !== 'erase' || r.status !== 'verified')
      return res
        .status(409)
        .json({ error: 'Create and independently verify an erasure request before deletion' });
    res.json({ ok: true, receipt: await tx(async () => await erase(req.scope, req.user.id, r)) });
  });
  app.post('/api/privacy/holds', auth, admin, recent, async (req, res) => {
    const x = req.body || {},
      v = await get(req.scope, 'visitors', x.visitorId || '');
    if (!v || !reference(x.caseReference))
      return res
        .status(400)
        .json({ error: 'Visitor and non-sensitive legal case reference required' });
    const id = randomUUID();
    await tx(async () => {
      const at = new Date().toISOString(),
        subjectHash = keys.blind(req.scope.scopeId, v.email);
      store.journal.append({
        version: 1,
        action: 'hold',
        id: randomUUID(),
        holdId: id,
        tenantId: req.scope.tenantId,
        siteId: req.scope.siteId,
        subjectHash,
        caseReference: x.caseReference,
        actor: req.user.id,
        at,
        records: [],
      });
      await db
        .prepare('INSERT INTO legal_holds VALUES (?,?,?,?,?,?,?,NULL)')
        .run(id, ...scoped(req.scope), subjectHash, x.caseReference, req.user.id, at);
      await audit(req.scope, req.user.id, 'LEGAL_HOLD_CREATED', id);
    });
    res.status(201).json({ id });
  });
  app.post('/api/privacy/holds/:id/release', auth, admin, recent, async (req, res) => {
    const h = await db
      .prepare(
        'SELECT * FROM legal_holds WHERE id=? AND tenant_id=? AND site_id=? AND released_at IS NULL',
      )
      .get(req.params.id, ...scoped(req.scope));
    if (!h) return res.status(404).json({ error: 'Not found' });
    if (h.created_by === req.user.id || !reference(req.body?.caseReference))
      return res.status(409).json({
        error:
          'A different administrator and a reviewed case reference are required to release the hold',
      });
    await tx(async () => {
      const at = new Date().toISOString();
      store.journal.append({
        version: 1,
        action: 'release_hold',
        id: randomUUID(),
        holdId: h.id,
        tenantId: req.scope.tenantId,
        siteId: req.scope.siteId,
        actor: req.user.id,
        at,
        records: [],
      });
      await db.prepare('UPDATE legal_holds SET released_at=? WHERE id=?').run(at, h.id);
      await audit(req.scope, req.user.id, 'LEGAL_HOLD_RELEASED', h.id);
    });
    res.json({ ok: true });
  });
  app.post('/api/invitations/:id/erase', auth, async (req, res) => {
    const invite = await get(req.scope, 'invitations', req.params.id);
    if (!invite) return res.status(404).json({ error: 'Not found' });
    if (req.user.role !== 'admin' && invite.createdByUserId !== req.user.id)
      return res.status(403).json({ error: 'Forbidden' });
    await tx(async () => {
      await remove(req.scope, 'invitations', invite.id);
      await audit(req.scope, req.user.id, 'INVITE_ERASURE', invite.id);
    });
    res.json({ ok: true });
  });
}
