import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import * as OTPAuth from 'otpauth';
import { fixture, site, adminEmail, adminPassword } from './helpers.mjs';
import { digest, verifyFactor } from '../server/crypto.mjs';
import { snapshotDatabase, restoreSnapshot } from '../server/backups.mjs';
import { createApplication } from '../server/app.mjs';
import { loadConfig } from '../server/config.mjs';

test('real HTTP: authentication, Origin, JSON limits, role guards, suspension and logout', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('GET', '/api/users')).status, 401);
    assert.equal(
      (await f.request('POST', '/api/login', { body: {}, origin: 'https://other.test' })).status,
      403,
    );
    assert.equal((await f.request('POST', '/api/checkin', { body: '{' })).status, 400);
    assert.equal(
      (await f.request('POST', '/api/checkin', { body: { fullName: 'x'.repeat(17000) } })).status,
      413,
    );
    const logged = await f.login();
    assert.equal(logged.status, 200);
    assert.match(logged.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
    const created = await f.request('POST', '/api/users', {
      cookie: logged.cookie,
      body: {
        email: 'staff@example.test',
        name: 'Staff',
        role: 'staff',
        password: 'unique-staff-test-password-12345',
      },
    });
    assert.equal(created.status, 201);
    const staff = await f.login('staff@example.test', 'unique-staff-test-password-12345');
    assert.equal(staff.status, 200);
    for (const route of ['/api/users', '/api/privacy', '/api/audit/verify'])
      assert.equal((await f.request('GET', route, { cookie: staff.cookie })).status, 403);
    assert.deepEqual(
      (await f.request('GET', '/api/hosts')).body.map((h) => h.id),
      ['reception'],
    );
    assert.equal(
      (
        await f.request('PATCH', `/api/users/${created.body.id}`, {
          cookie: logged.cookie,
          body: { status: 'suspended' },
        })
      ).status,
      200,
    );
    assert.equal((await f.request('GET', '/api/session', { cookie: staff.cookie })).status, 401);
    assert.equal(
      (await f.request('POST', '/api/logout', { cookie: logged.cookie, body: {} })).status,
      200,
    );
    assert.equal((await f.request('GET', '/api/session', { cookie: logged.cookie })).status, 401);
    assert.equal((await f.request('POST', '/api/unknown', { body: {} })).status, 404);
  } finally {
    await f.close();
  }
});

test('shared mode isolates customer AND site records, sessions, ownership, invitations and directory', async () => {
  const sites = [
    site('a-one', 'tenant-a', 'one'),
    site('a-two', 'tenant-a', 'two'),
    site('b-one', 'tenant-b', 'one'),
  ];
  const f = await fixture({ sites });
  try {
    assert.equal((await f.request('GET', '/api/config', { site: null })).status, 404);
    const a = await f.login(),
      b = await f.login(adminEmail, adminPassword, 'b-one');
    assert.equal(
      (await f.request('GET', '/api/data', { cookie: a.cookie, site: 'a-two' })).status,
      401,
    );
    assert.equal(
      (await f.request('GET', '/api/data', { cookie: a.cookie, site: 'b-one' })).status,
      401,
    );
    const staff = await f.request('POST', '/api/users', {
      cookie: a.cookie,
      body: {
        email: 'a-staff@example.test',
        name: 'Same Display Name',
        role: 'staff',
        password: 'unique-staff-password-12345',
      },
    });
    assert.equal(staff.status, 201);
    assert.equal(
      (await f.login('a-staff@example.test', 'unique-staff-password-12345', 'b-one')).status,
      401,
    );
    const staffSession = await f.login('a-staff@example.test', 'unique-staff-password-12345');
    const visitA = await f.checkin({ fullName: 'Tenant A Secret' }),
      visitB = await f.checkin({ fullName: 'Tenant B Secret' }, 'b-one');
    assert.equal(visitA.status, 201);
    assert.equal(visitB.status, 201);
    const dataA = (await f.request('GET', '/api/data', { cookie: a.cookie })).body;
    assert.deepEqual(
      dataA.visitors.map((v) => v.id),
      [visitA.body.id],
    );
    assert.ok(!JSON.stringify(dataA).includes('Tenant B Secret'));
    assert.equal(
      (
        await f.request('PATCH', `/api/visitors/${visitB.body.id}/checkout`, {
          cookie: a.cookie,
          body: {},
        })
      ).status,
      404,
    );
    const today = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Africa/Lagos',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
    const invite = {
      guestName: 'Guest',
      guestEmail: 'invited@example.test',
      hostEmployeeId: staff.body.id,
      expectedDate: today,
      expectedTime: '12:00',
    };
    assert.equal(
      (
        await f.request('POST', '/api/invitations', {
          cookie: staffSession.cookie,
          body: { ...invite, hostEmployeeId: a.body.user.id },
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request('POST', '/api/invitations', {
          cookie: staffSession.cookie,
          body: { ...invite, photoUrl: 'sensitive' },
        })
      ).status,
      400,
    );
    const created = await f.request('POST', '/api/invitations', {
      cookie: staffSession.cookie,
      body: invite,
    });
    assert.equal(created.status, 201);
    assert.equal(
      (await f.request('GET', '/api/data', { cookie: staffSession.cookie })).body.invitations[0].id,
      created.body.id,
    );
    assert.equal(
      (
        await f.request('POST', '/api/invitations/lookup', {
          site: 'b-one',
          body: { inviteCode: created.body.inviteCode },
        })
      ).status,
      404,
    );
    const lookup = await f.request('POST', '/api/invitations/lookup', {
      body: { inviteCode: created.body.inviteCode },
    });
    assert.equal(lookup.body.guestEmail, undefined);
    assert.equal(lookup.body.publicHost.name, 'Invited host');
    const redeemed = await f.checkin({
      email: 'invited@example.test',
      hostEmployeeId: staff.body.id,
      inviteCode: created.body.inviteCode,
    });
    assert.equal(redeemed.status, 201);
    assert.equal(redeemed.body.visitType, 'pre_registered');
    assert.equal(
      (
        await f.checkin({
          email: 'invited@example.test',
          hostEmployeeId: staff.body.id,
          inviteCode: created.body.inviteCode,
        })
      ).status,
      409,
    );
    assert.equal(
      (await f.request('GET', '/api/data', { cookie: b.cookie, site: 'b-one' })).body.invitations
        .length,
      0,
    );
  } finally {
    await f.close();
  }
});

test('privileged MFA enrolls before access, rejects replay, consumes recovery codes and rotates passwords', async () => {
  const f = await fixture({ env: { SECUREPASS_MFA_REQUIRED: 'admin' } });
  try {
    const login = await f.login();
    assert.equal(login.body.user, undefined);
    assert.equal(login.cookie, undefined);
    assert.equal(login.body.enrollment, true);
    assert.equal((await f.request('GET', '/api/users')).status, 401);
    const otp = new OTPAuth.TOTP({ secret: login.body.secret }).generate();
    const complete = await f.request('POST', '/api/mfa/complete', {
      body: { challengeToken: login.body.challengeToken, code: otp },
    });
    assert.equal(complete.status, 200);
    assert.equal(complete.body.recoveryCodes.length, 10);
    assert.equal((await f.request('GET', '/api/users', { cookie: complete.cookie })).status, 200);
    const factor = f.runtime.store.db.prepare('SELECT * FROM factors').get();
    assert.ok(!factor.secret_cipher.includes(login.body.secret));
    assert.ok(!factor.recovery_cipher.includes(complete.body.recoveryCodes[0]));
    await f.request('POST', '/api/logout', { cookie: complete.cookie, body: {} });
    const second = await f.login();
    assert.equal(second.body.enrollment, false);
    assert.equal(
      (
        await f.request('POST', '/api/mfa/complete', {
          body: { challengeToken: second.body.challengeToken, code: otp },
        })
      ).status,
      401,
    );
    const recovery = await f.request('POST', '/api/mfa/complete', {
      body: { challengeToken: second.body.challengeToken, code: complete.body.recoveryCodes[0] },
    });
    assert.equal(recovery.status, 200);
    const next = await f.login();
    assert.equal(
      (
        await f.request('POST', '/api/mfa/complete', {
          body: { challengeToken: next.body.challengeToken, code: complete.body.recoveryCodes[0] },
        })
      ).status,
      401,
    );
    const rotated = await f.request('POST', '/api/account/password', {
      cookie: recovery.cookie,
      body: {
        password: adminPassword,
        newPassword: 'a-new-unique-admin-password-12345',
        code: complete.body.recoveryCodes[1],
      },
    });
    assert.equal(rotated.status, 200);
    assert.equal((await f.request('GET', '/api/session', { cookie: recovery.cookie })).status, 401);
    assert.equal((await f.login()).status, 401);
    assert.equal(
      (await f.login(adminEmail, 'a-new-unique-admin-password-12345')).body.mfaRequired,
      true,
    );
  } finally {
    await f.close();
  }
});

test('durable login throttle normalizes whitespace/case across restart and rejects expired sessions', async () => {
  let f = await fixture();
  const root = f.root;
  try {
    const login = await f.login();
    f.runtime.store.db.prepare('UPDATE sessions SET expires_at=?').run(Date.now() - 1);
    assert.equal((await f.request('GET', '/api/session', { cookie: login.cookie })).status, 401);
    for (let n = 0; n < 9; n++)
      assert.equal(
        (await f.login(n % 2 ? ' ADMIN@EXAMPLE.TEST ' : adminEmail, 'wrong')).status,
        401,
      );
    assert.equal((await f.login('\tadmin@example.test', adminPassword)).status, 429);
    await f.close({ preserve: true });
    f = await fixture({ root });
    assert.equal((await f.login()).status, 429);
  } finally {
    await f.close();
  }
});

test('public check-in uses one-use scoped proof, idempotency, duplicate detection and notice-version checks', async () => {
  const f = await fixture();
  try {
    const body = f.visitorBody({ email: 'duplicate@example.test' });
    assert.equal((await f.request('POST', '/api/checkin', { body })).status, 400);
    const proof = await f.proof(),
      valid = { ...body, proof };
    assert.equal(
      (await f.request('POST', '/api/checkin', { body: { ...valid, noticeVersion: 'old' } }))
        .status,
      400,
    );
    const saved = await f.request('POST', '/api/checkin', { body: valid });
    assert.equal(saved.status, 201);
    assert.equal((await f.request('POST', '/api/checkin', { body: valid })).body.id, saved.body.id);
    assert.equal(
      (await f.request('POST', '/api/checkin', { body: { ...valid, fullName: 'Changed' } })).status,
      409,
    );
    assert.equal((await f.checkin({ email: body.email })).status, 409);
    assert.equal(saved.body.hasBiometricPhoto, false);
    assert.equal(saved.body.wifiAccessGranted, false);
    assert.equal(saved.body.accessStatus, 'reception_only');
    assert.ok(saved.body.noticeHash);
    assert.ok(
      !fs.readFileSync(path.join(f.data, 'securepass.sqlite')).includes(Buffer.from(body.email)),
    );
  } finally {
    await f.close();
  }
});

test('gate devices are site-bound; registration needs explicit approval; expiry and checkout revoke online access', async () => {
  const token = 'test-only-device-token-12345678901234567890',
    sites = [site('one'), site('two')];
  const f = await fixture({
    sites,
    devices: [
      { deviceId: 'gate-one', siteKey: 'one', tokenHashes: [digest(token)], enabled: true },
    ],
  });
  try {
    const admin = await f.login(),
      visit = await f.checkin();
    assert.equal(visit.status, 201);
    assert.equal(visit.body.accessStatus, 'pending');
    const gate = (siteKey = 'one') =>
      f.request('POST', '/api/gate/verify', {
        site: siteKey,
        origin: null,
        headers: { Authorization: `Bearer ${token}` },
        body: { reference: `SECUREPASS-REFERENCE:${visit.body.badgeId}` },
      });
    assert.equal((await gate()).body.allowed, false);
    assert.equal((await gate('two')).status, 401);
    assert.equal(
      (
        await f.request('POST', `/api/visitors/${visit.body.id}/authorize`, {
          cookie: admin.cookie,
          body: {},
        })
      ).status,
      200,
    );
    assert.equal((await gate()).body.allowed, true);
    const scope = f.runtime.config.sites[0],
      v = f.runtime.store.get(scope, 'visitors', visit.body.id);
    v.accessExpiresAt = new Date(Date.now() - 1).toISOString();
    f.runtime.store.put(scope, 'visitors', v);
    assert.equal((await gate()).body.allowed, false);
    await f.request('POST', `/api/visitors/${v.id}/authorize`, { cookie: admin.cookie, body: {} });
    await f.request('PATCH', `/api/visitors/${v.id}/checkout`, { cookie: admin.cookie, body: {} });
    assert.equal((await gate()).body.allowed, false);
  } finally {
    await f.close();
  }
});

test('independent privacy approval, legal holds, signed erasure journal and backup restore prevent resurrection', async () => {
  const f = await fixture();
  try {
    const admin = await f.login();
    await f.request('POST', '/api/users', {
      cookie: admin.cookie,
      body: {
        name: 'Independent Reviewer',
        email: 'reviewer@example.test',
        role: 'admin',
        password: 'independent-reviewer-password-12345',
      },
    });
    const reviewer = await f.login('reviewer@example.test', 'independent-reviewer-password-12345');
    const visit = await f.checkin({ email: 'held@example.test', fullName: 'Private Subject' });
    assert.equal(visit.status, 201);
    const { store, config } = f.runtime;
    const encrypted = snapshotDatabase(store.db, store.keys, store.journal, config);
    assert.ok(!encrypted.includes('Private Subject'));
    const held = await f.request('POST', '/api/privacy/holds', {
      cookie: admin.cookie,
      body: { visitorId: visit.body.id, caseReference: 'LEGAL-2026-1' },
    });
    assert.equal(held.status, 201);
    const scope = config.sites[0],
      v = store.get(scope, 'visitors', visit.body.id);
    store.put(scope, 'visitors', v, Date.now() - 1);
    store.purge();
    assert.ok(store.get(scope, 'visitors', v.id));
    const access = await f.request('POST', '/api/privacy/requests', {
      cookie: admin.cookie,
      body: { visitorId: v.id, type: 'access' },
    });
    assert.equal(
      (
        await f.request('GET', `/api/privacy/requests/${access.body.id}/export`, {
          cookie: admin.cookie,
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.request('POST', `/api/privacy/requests/${access.body.id}/verify`, {
          cookie: admin.cookie,
          body: { verificationReference: 'CASE-1', verificationMethod: 'in_person' },
        })
      ).status,
      409,
    );
    await f.request('POST', `/api/privacy/requests/${access.body.id}/verify`, {
      cookie: reviewer.cookie,
      body: { verificationReference: 'CASE-1', verificationMethod: 'in_person' },
    });
    const disclosure = await f.request('GET', `/api/privacy/requests/${access.body.id}/export`, {
      cookie: admin.cookie,
    });
    assert.equal(disclosure.status, 200);
    assert.equal(disclosure.body.visitors[0].id, v.id);
    assert.ok(disclosure.body.notices.length);
    const erasure = await f.request('POST', '/api/privacy/requests', {
      cookie: admin.cookie,
      body: { visitorId: v.id, type: 'erase' },
    });
    await f.request('POST', `/api/privacy/requests/${erasure.body.id}/verify`, {
      cookie: reviewer.cookie,
      body: { verificationReference: 'CASE-2', verificationMethod: 'verified_contact' },
    });
    assert.equal(
      (
        await f.request('POST', `/api/privacy/requests/${erasure.body.id}/fulfill`, {
          cookie: admin.cookie,
          body: {},
        })
      ).status,
      409,
    );
    assert.equal(
      (
        await f.request('POST', `/api/privacy/holds/${held.body.id}/release`, {
          cookie: admin.cookie,
          body: { caseReference: 'LEGAL-RELEASE' },
        })
      ).status,
      409,
    );
    await f.request('POST', `/api/privacy/holds/${held.body.id}/release`, {
      cookie: reviewer.cookie,
      body: { caseReference: 'LEGAL-RELEASE' },
    });
    const erased = await f.request('POST', `/api/privacy/requests/${erasure.body.id}/fulfill`, {
      cookie: admin.cookie,
      body: {},
    });
    assert.equal(erased.status, 200);
    assert.ok(erased.body.receipt.signature);
    assert.equal(store.get(scope, 'visitors', v.id), null);
    const target = path.join(f.root, 'restored');
    const result = restoreSnapshot(encrypted, {
      keys: store.keys,
      journal: store.journal,
      config,
      targetDirectory: target,
    });
    assert.equal(result.quarantined, true);
    const restored = new DatabaseSync(path.join(target, 'securepass.sqlite'));
    assert.equal(
      restored.prepare("SELECT COUNT(*) AS n FROM secure_records WHERE kind='visitors'").get().n,
      0,
    );
    assert.equal(restored.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
    assert.equal(
      restored.prepare("SELECT COUNT(*) AS n FROM memberships WHERE status='active'").get().n,
      0,
    );
    restored.close();
    fs.copyFileSync(
      path.join(f.data, '.development-keys.json'),
      path.join(target, '.development-keys.json'),
    );
    await assert.rejects(
      () => createApplication({ ...f.env, SECUREPASS_DATA_DIR: target }),
      /quarantined/,
    );
    const tampered = JSON.parse(encrypted);
    tampered.data = tampered.data.slice(0, -4) + 'AAAA';
    assert.throws(() => store.keys.unpackBackup(JSON.stringify(tampered)));
  } finally {
    await f.close();
  }
});

test('encrypted record AAD blocks cross-site substitution; audit mutation and tail rollback are detected', async () => {
  const f = await fixture({ sites: [site('one'), site('two')] });
  try {
    const a = await f.checkin({}, 'one'),
      b = await f.checkin({}, 'two');
    const { db, get } = f.runtime.store;
    const cipher = db.prepare('SELECT cipher FROM secure_records WHERE id=?').get(a.body.id).cipher;
    db.prepare('UPDATE secure_records SET cipher=? WHERE id=?').run(cipher, b.body.id);
    assert.throws(() => get(f.runtime.config.sites[1], 'visitors', b.body.id));
    assert.throws(
      () => db.prepare("UPDATE audit_chain SET detail='tamper' WHERE seq=1").run(),
      /append-only/,
    );
    db.exec('DROP TRIGGER audit_no_update');
    db.prepare("UPDATE audit_chain SET detail='tamper' WHERE seq=1").run();
    assert.throws(() => f.runtime.store.verifyAudit(), /integrity/);
  } finally {
    await f.close();
  }
});

test('production rejects missing security controls and isolated databases refuse shared reuse', async () => {
  assert.throws(
    () =>
      loadConfig({
        NODE_ENV: 'production',
        SECUREPASS_ORIGIN: 'https://facility.example',
        SECUREPASS_MFA_REQUIRED: 'none',
      }),
    /privacy|MFA/,
  );
  let f = await fixture();
  const root = f.root;
  await f.close({ preserve: true });
  try {
    await assert.rejects(() => fixture({ root, sites: [site('one'), site('two')] }), /binding/);
  } finally {
    assert.ok(path.basename(root).startsWith('securepass-test-'));
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('RFC 6238 known value and token counter replay protection', () => {
  const secret = OTPAuth.Secret.fromUTF8('12345678901234567890'),
    totp = new OTPAuth.TOTP({ secret, digits: 8 });
  assert.equal(totp.generate({ timestamp: 59000 }), '94287082');
  const six = new OTPAuth.TOTP({ secret, digits: 6 }).generate({ timestamp: 59000 });
  assert.equal(verifyFactor(secret.base32, six, -1, 59000), 1);
  assert.equal(verifyFactor(secret.base32, six, 1, 59000), null);
});
