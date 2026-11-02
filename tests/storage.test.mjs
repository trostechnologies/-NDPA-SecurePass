import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { stripTypeScriptTypes } from 'node:module';
import * as OTPAuth from 'otpauth';
import { fixture, site, adminPassword } from './helpers.mjs';
import { hashPassword } from '../server/auth.mjs';
import { writeManagedBackup, pruneManagedBackups } from '../server/backups.mjs';
import {
  prepareAuditArchive,
  commitAuditArchive,
  verifyAuditArchive,
} from '../server/audit-archive.mjs';
const exec = promisify(execFile),
  repo = fileURLToPath(new URL('../', import.meta.url));
const cleanup = (root) => {
  assert.equal(path.dirname(path.resolve(root)), path.resolve(os.tmpdir()));
  assert.ok(path.basename(root).startsWith('securepass-test-'));
  fs.rmSync(root, { recursive: true, force: true });
};

test('legacy schema migration encrypts records, removes unfinished sensitive fields and revokes old sessions', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'securepass-test-')),
    data = path.join(root, 'data');
  fs.mkdirSync(data);
  const db = new DatabaseSync(path.join(data, 'securepass.sqlite'));
  db.exec(
    'CREATE TABLE users(id TEXT PRIMARY KEY,email TEXT UNIQUE,name TEXT,role TEXT,department TEXT,title TEXT,status TEXT,password_hash TEXT,created_at TEXT); CREATE TABLE sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,expires_at INTEGER); CREATE TABLE records(kind TEXT,id TEXT,payload TEXT,PRIMARY KEY(kind,id));',
  );
  db.prepare('INSERT INTO users VALUES (?,?,?,?,?,?,?,?,?)').run(
    'legacy-admin',
    'legacy@example.test',
    'Legacy Admin',
    'admin',
    '',
    '',
    'active',
    await hashPassword(adminPassword),
    new Date().toISOString(),
  );
  db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(
    'old-session',
    'legacy-admin',
    Date.now() + 100000,
  );
  db.prepare('INSERT INTO records VALUES (?,?,?)').run(
    'visitors',
    'legacy-visitor',
    JSON.stringify({
      id: 'legacy-visitor',
      fullName: 'Legacy Private Name',
      email: 'Legacy-Guest@Example.Test',
      phone: '12345678',
      hostEmployeeId: 'reception',
      status: 'checked_in',
      photoUrl: 'sensitive-image',
      governmentIdNumber: '1234567890',
      retentionExpiryDate: new Date(Date.now() + 86400000).toISOString(),
    }),
  );
  db.close();
  const f = await fixture({ root, env: { SECUREPASS_ALLOW_LEGACY_MIGRATION: 'true' } });
  try {
    assert.equal(
      f.runtime.store.db
        .prepare("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name='records'")
        .get().n,
      0,
    );
    assert.equal(f.runtime.store.db.prepare('SELECT COUNT(*) AS n FROM sessions').get().n, 0);
    const v = f.runtime.store.get(f.runtime.config.sites[0], 'visitors', 'legacy-visitor');
    assert.equal(v.email, 'legacy-guest@example.test');
    assert.equal(v.photoUrl, undefined);
    assert.equal(v.governmentIdNumber, undefined);
    assert.ok(
      !fs
        .readFileSync(path.join(data, 'securepass.sqlite'))
        .includes(Buffer.from('Legacy Private Name')),
    );
  } finally {
    await f.close();
  }
});

test('password-reset tokens revoke sessions, are one-use, and cannot reset a shared identity from one site', async () => {
  const f = await fixture({ sites: [site('one'), site('two')] });
  try {
    const admin = await f.login(),
      created = await f.request('POST', '/api/users', {
        cookie: admin.cookie,
        body: {
          email: 'reset@example.test',
          name: 'Reset User',
          role: 'staff',
          password: 'original-test-password-12345',
        },
      }),
      user = await f.login('reset@example.test', 'original-test-password-12345');
    const issued = await f.request('POST', `/api/users/${created.body.id}/password-reset`, {
      cookie: admin.cookie,
      body: { verificationReference: 'CASE-RESET-1' },
    });
    assert.equal(issued.status, 200);
    assert.equal((await f.request('GET', '/api/session', { cookie: user.cookie })).status, 401);
    assert.equal((await f.login('reset@example.test', 'original-test-password-12345')).status, 401);
    const body = { token: issued.body.token, newPassword: 'replacement-test-password-12345' };
    assert.equal((await f.request('POST', '/api/password-reset', { body })).status, 200);
    assert.equal((await f.request('POST', '/api/password-reset', { body })).status, 400);
    assert.equal((await f.login('reset@example.test', body.newPassword)).status, 200);
    const raw = f.runtime.store.db.prepare('SELECT * FROM users WHERE id=?').get(created.body.id);
    f.runtime.store.grant(f.runtime.config.sites[1], raw, 'staff');
    assert.equal(
      (
        await f.request('POST', `/api/users/${raw.id}/password-reset`, {
          cookie: admin.cookie,
          body: { verificationReference: 'CASE-RESET-2' },
        })
      ).status,
      409,
    );
    await f.request('PATCH', `/api/users/${raw.id}`, {
      cookie: admin.cookie,
      body: { status: 'suspended' },
    });
    assert.equal((await f.login(raw.email, body.newPassword, 'two')).status, 200);
  } finally {
    await f.close();
  }
});

test('managed encrypted backups have authenticated expiry manifests and reject destructive path tricks', async () => {
  const f = await fixture();
  try {
    const backed = writeManagedBackup(f.env);
    assert.ok(fs.existsSync(backed.file));
    const outside = path.join(f.root, 'outside.txt');
    fs.writeFileSync(outside, 'preserve');
    const manifest = JSON.parse(fs.readFileSync(backed.file + '.manifest', 'utf8'));
    manifest.file = '../outside.txt';
    fs.writeFileSync(backed.file + '.manifest', JSON.stringify(manifest));
    assert.throws(() => pruneManagedBackups(f.env), /integrity/);
    assert.equal(fs.readFileSync(outside, 'utf8'), 'preserve');
    const { signature, ...body } = JSON.parse(fs.readFileSync(backed.file + '.manifest', 'utf8'));
    body.file = path.basename(backed.file);
    body.expiresAt = Date.now() - 1;
    fs.writeFileSync(
      backed.file + '.manifest',
      JSON.stringify({
        ...body,
        signature: f.runtime.store.keys.sign('backup-manifest:' + JSON.stringify(body)),
      }),
    );
    assert.equal(pruneManagedBackups(f.env).removed, 1);
    assert.ok(!fs.existsSync(backed.file));
  } finally {
    await f.close();
  }
});

test('audit storage fails closed at capacity and only compacts a verified, externally referenced archive', async () => {
  let f = await fixture({ env: { SECUREPASS_MAX_AUDITS: '6' } });
  try {
    const admin = await f.login(),
      { store, config } = f.runtime;
    while (store.db.prepare('SELECT COUNT(*) AS n FROM audit_chain').get().n < 6)
      store.audit(config.sites[0], 'test', 'TEST_EVENT');
    assert.equal(
      (
        await f.request('POST', '/api/users', {
          cookie: admin.cookie,
          body: {
            email: 'blocked@example.test',
            name: 'Blocked',
            role: 'staff',
            password: 'blocked-test-password-12345',
          },
        })
      ).status,
      503,
    );
    assert.equal(
      store.db.prepare("SELECT COUNT(*) AS n FROM users WHERE email='blocked@example.test'").get()
        .n,
      0,
    );
    const prepared = prepareAuditArchive(store, config, { keep: 1 });
    assert.equal(
      verifyAuditArchive(fs.readFileSync(prepared.file, 'utf8'), store.keys).seq,
      prepared.to,
    );
    assert.throws(() => commitAuditArchive(store, config, { file: prepared.file }), /reference/);
    assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM audit_chain').get().n, 6);
    const receipt = commitAuditArchive(store, config, {
      file: prepared.file,
      externalReference: 'worm://test/archive/version-1',
    });
    assert.ok(receipt.signature);
    assert.ok(store.verifyAudit().ok);
    const root = f.root;
    await f.close({ preserve: true });
    f = await fixture({ root, env: { SECUREPASS_MAX_AUDITS: '6' } });
    assert.ok(f.runtime.store.verifyAudit().ok);
  } finally {
    await f.close();
  }
});

test('audit tail rollback and a missing authoritative journal prevent startup', async () => {
  let f = await fixture();
  const root = f.root;
  await f.checkin();
  await f.close({ preserve: true });
  try {
    const db = new DatabaseSync(path.join(root, 'data', 'securepass.sqlite'));
    db.exec(
      'DROP TRIGGER audit_no_delete; DELETE FROM audit_chain WHERE seq=(SELECT MAX(seq) FROM audit_chain);',
    );
    db.close();
    await assert.rejects(() => fixture({ root }), /rollback/);
  } finally {
    cleanup(root);
  }
  f = await fixture();
  const second = f.root;
  await f.close({ preserve: true });
  try {
    fs.unlinkSync(path.join(second, 'journal', 'erasure-journal.jsonl'));
    await assert.rejects(() => fixture({ root: second }), /journal/);
  } finally {
    cleanup(second);
  }
});

test('notice changes require a new version and normalized index tampering is rejected', async () => {
  const f = await fixture();
  const root = f.root;
  try {
    const visit = await f.checkin();
    f.runtime.store.db
      .prepare('UPDATE secure_records SET owner_id=? WHERE id=?')
      .run('forged-owner', visit.body.id);
    assert.throws(
      () => f.runtime.store.get(f.runtime.config.sites[0], 'visitors', visit.body.id),
      /integrity/,
    );
    f.runtime.store.db
      .prepare('UPDATE secure_records SET owner_id=NULL WHERE id=?')
      .run(visit.body.id);
    await f.close({ preserve: true });
    await assert.rejects(
      () => fixture({ root, env: { SECUREPASS_NOTICE_TEXT: 'Changed text without new version' } }),
      /new version/,
    );
  } finally {
    cleanup(root);
  }
});

test('data-key rewrap preserves readable records and factors, then permits retirement of the old active key', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'securepass-test-')),
    key = () => randomBytes(32).toString('base64'),
    v1 = key(),
    v2 = key();
  const env = {
    SECUREPASS_DATA_KEYS: JSON.stringify({ v1 }),
    SECUREPASS_ACTIVE_KEY_ID: 'v1',
    SECUREPASS_INDEX_KEY: key(),
    SECUREPASS_AUDIT_KEY: key(),
    SECUREPASS_BACKUP_KEY: key(),
  };
  let f = await fixture({ root, env });
  const visit = await f.checkin(),
    admin = await f.login();
  const challenge = await f.request('POST', '/api/account/mfa/start', {
    cookie: admin.cookie,
    body: { password: adminPassword },
  });
  assert.equal(
    (
      await f.request('POST', '/api/mfa/complete', {
        body: {
          challengeToken: challenge.body.challengeToken,
          code: new OTPAuth.TOTP({ secret: challenge.body.secret }).generate(),
        },
      })
    ).status,
    200,
  );
  await f.close({ preserve: true });
  try {
    const rotate = {
      ...env,
      SECUREPASS_DATA_KEYS: JSON.stringify({ v1, v2 }),
      SECUREPASS_ACTIVE_KEY_ID: 'v2',
    };
    f = await fixture({ root, env: rotate });
    assert.equal(
      f.runtime.store.get(f.runtime.config.sites[0], 'visitors', visit.body.id).id,
      visit.body.id,
    );
    const cliEnv = { ...process.env, ...f.env };
    await f.close({ preserve: true });
    const result = await exec(process.execPath, ['ops/manage.mjs', 'rewrap'], {
      cwd: repo,
      env: cliEnv,
      windowsHide: true,
    });
    assert.ok(JSON.parse(result.stdout).rewrapped);
    f = await fixture({ root, env: { ...rotate, SECUREPASS_DATA_KEYS: JSON.stringify({ v2 }) } });
    assert.equal(
      f.runtime.store.get(f.runtime.config.sites[0], 'visitors', visit.body.id).id,
      visit.body.id,
    );
    const factor = f.runtime.store.db.prepare('SELECT * FROM factors').get();
    assert.equal(
      f.runtime.store.keys.open(factor.secret_cipher, `mfa:${factor.user_id}`),
      challenge.body.secret,
    );
    await f.close();
  } catch (error) {
    await f.close().catch(() => cleanup(root));
    throw error;
  }
});

test('CSV formula and quote escaping remains effective and all visitor QR content is opaque', async () => {
  const source = fs.readFileSync(new URL('../src/utils/security.ts', import.meta.url), 'utf8'),
    mod = await import(
      'data:text/javascript;base64,' + Buffer.from(stripTypeScriptTypes(source)).toString('base64')
    );
  for (const input of ['=1+1', ' +SUM(A1:A2)', '\t@SUM(1)', '-1', '\r=1'])
    assert.ok(mod.csvCell(input).startsWith('"\''));
  assert.equal(mod.csvCell('a"b\nc'), '"a""b\nc"');
  assert.equal(
    mod.badgeReference({ badgeId: 'opaque', fullName: 'Private Name' }),
    'SECUREPASS-REFERENCE:opaque',
  );
});
