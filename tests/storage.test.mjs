import { requestContext } from '../server/request-context.mjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fixture, site } from './helpers.mjs';
import { connectionOptions, createPostgresAdapter, statementSql } from '../server/postgres.mjs';
import {
  writeManagedBackup,
  restoreManagedBackup,
  pruneManagedBackups,
} from '../server/backups.mjs';
import {
  prepareAuditArchive,
  commitAuditArchive,
  verifyAuditArchive,
} from '../server/audit-archive.mjs';
import { digest } from '../server/crypto.mjs';
import { runBackupCycle } from '../ops/backup-cycle.mjs';

test('PostgreSQL uses verified TLS, separate password fields and parameterized statements', () => {
  const env = {
    PGHOST: 'aws-0-eu-west-1.pooler.supabase.com',
    PGPORT: '5432',
    PGDATABASE: 'postgres',
    PGUSER: 'securepass_runtime.project',
    PGPASSWORD: 'test-only-never-connect',
  };
  const config = connectionOptions(env);
  assert.equal(config.ssl.rejectUnauthorized, true);
  assert.equal(config.port, 5432);
  assert.equal(config.connectionString, undefined);
  assert.throws(() => connectionOptions({ ...env, PGPASSWORD: '' }), /required/);
  assert.equal(
    statementSql("SELECT '?' AS literal, id FROM users WHERE email=?"),
    "SELECT '?' AS literal, id FROM users WHERE email=$1",
  );
  assert.match(
    statementSql('INSERT OR REPLACE INTO factors VALUES (?,?,?,?)'),
    /ON CONFLICT \(user_id\) DO UPDATE/,
  );
  assert.throws(() => statementSql('INSERT OR REPLACE INTO arbitrary VALUES (?)'), /Unsupported/);
});

test('transaction statements use one client, roll back and nest without a second checkout', async () => {
  const calls = [];
  const client = {
    async query(sql) {
      calls.push(sql);
      return { rows: [], rowCount: 0 };
    },
    release() {
      calls.push('release');
    },
  };
  const db = createPostgresAdapter(
    {
      async connect() {
        calls.push('connect');
        return client;
      },
      async query() {
        throw Error('Pool query used in transaction');
      },
      async end() {},
    },
    { writerLock: false },
  );
  await assert.rejects(
    () =>
      db.transaction(async () => {
        await db.exec('SELECT 1');
        await db.transaction(async () => {
          await db.exec('SELECT 2');
        });
        throw Error('deliberate rollback');
      }),
    /deliberate/,
  );
  assert.deepEqual(calls, [
    'connect',
    'BEGIN',
    'SELECT pg_advisory_xact_lock(843061, 2)',
    'SELECT 1',
    'SELECT 2',
    'ROLLBACK',
    'release',
  ]);
  await db.close();
});

test('writer lease denial and connection loss fail closed', async () => {
  let listener,
    acquired = false;
  const client = {
    async query() {
      return { rows: [{ acquired }] };
    },
    release() {},
    on(name, fn) {
      listener = fn;
    },
  };
  const db = createPostgresAdapter({
    async connect() {
      return client;
    },
    async end() {},
    async query() {
      return { rows: [] };
    },
  });
  await assert.rejects(() => db.acquireWriter(), /Another/);
  acquired = true;
  await db.acquireWriter();
  listener();
  await assert.rejects(() => db.prepare('SELECT 1').get(), /lease lost/);
  await assert.rejects(() => db.transaction(async () => {}), /lease lost/);
  await db.close();
});

test('PostgreSQL rollback, private schema, capacity and signed audit archive remain enforced', async () => {
  const f = await fixture({ env: { SECUREPASS_MAX_AUDITS: '6' } });
  try {
    const { store, config } = f.runtime,
      { db } = store;
    assert.equal(
      (await db.query("SELECT has_schema_privilege('anon','securepass','USAGE') AS allowed"))
        .rows[0].allowed,
      false,
    );
    assert.equal(
      (
        await db.query(
          "SELECT has_schema_privilege('authenticated','securepass','USAGE') AS allowed",
        )
      ).rows[0].allowed,
      false,
    );
    await assert.rejects(
      () =>
        store.tx(async () => {
          await db.prepare("INSERT INTO installation VALUES ('rollback-test','value')").run();
          await store.tx(async () => {
            throw Error('rollback');
          });
        }),
      /rollback/,
    );
    assert.equal(
      await db.prepare("SELECT * FROM installation WHERE key='rollback-test'").get(),
      undefined,
    );
    while ((await db.prepare('SELECT COUNT(*) AS n FROM audit_chain').get()).n < 6)
      await store.audit(config.sites[0], 'test', 'CAPACITY');
    assert.equal((await f.request('GET', '/api/ready')).status, 503);
    const archive = await prepareAuditArchive(store, config, { keep: 1 });
    assert.ok(verifyAuditArchive(fs.readFileSync(archive.file, 'utf8'), store.keys).seq);
    await assert.rejects(
      () => commitAuditArchive(store, config, { file: archive.file, externalReference: '' }),
      /reference/,
    );
    await commitAuditArchive(store, config, {
      file: archive.file,
      externalReference: 'immutable:object-version-123',
    });
    assert.equal((await f.request('GET', '/api/ready')).status, 200);
    assert.equal((await store.verifyAudit()).ok, true);
  } finally {
    await f.close();
  }
});

test('PostgreSQL encrypted snapshots bind manifest content and expiry; cleanup survives failed creation', async () => {
  const f = await fixture();
  try {
    const driver = f.runtime.store.db,
      keys = f.runtime.store.keys;
    const first = await writeManagedBackup(f.env, { driver }),
      second = await writeManagedBackup(f.env, { driver });
    const original = fs.readFileSync(first.file, 'utf8'),
      manifest = JSON.parse(fs.readFileSync(first.file + '.manifest', 'utf8'));
    fs.writeFileSync(first.file, fs.readFileSync(second.file));
    await assert.rejects(
      () => restoreManagedBackup(f.env, first.file, path.join(f.root, 'swap'), { driver }),
      /manifest/,
    );
    const snapshot = keys.unpackBackup(original);
    assert.equal(snapshot.engine, 'postgres');
    assert.equal(snapshot.version, 3);
    snapshot.createdAt = new Date(Date.now() - 86400000).toISOString();
    snapshot.expiresAt = Date.now() - 1;
    const expired = keys.packBackup(snapshot);
    fs.writeFileSync(first.file, expired);
    const { signature, ...body } = manifest;
    Object.assign(body, {
      sha256: digest(expired),
      createdAt: snapshot.createdAt,
      expiresAt: snapshot.expiresAt,
    });
    fs.writeFileSync(
      first.file + '.manifest',
      JSON.stringify({ ...body, signature: keys.sign('backup-manifest:' + JSON.stringify(body)) }),
    );
    await assert.rejects(
      () => restoreManagedBackup(f.env, first.file, path.join(f.root, 'expired'), { driver }),
      /expired/,
    );
    fs.unlinkSync(first.file + '.manifest'); // interrupted publication still expires using authenticated content
    const events = [];
    await runBackupCycle(f.env, {
      prune: (env) => pruneManagedBackups(env, Date.now() + 8 * 86400000),
      write: async () => {
        throw Object.assign(Error('full'), { code: 'ENOSPC' });
      },
      log: (line) => events.push(JSON.parse(line)),
      error: (line) => events.push(JSON.parse(line)),
    });
    assert.ok(!fs.existsSync(first.file));
    assert.ok(!fs.existsSync(second.file));
    assert.equal(events.find((e) => e.event === 'backup_failed').code, 'ENOSPC');
  } finally {
    await f.close();
  }
});

test('password-reset tokens stay one-use and a site cannot reset a multi-site identity', async () => {
  const f = await fixture({ sites: [site('one'), site('two')] });
  try {
    const admin = await f.login();
    const created = await f.request('POST', '/api/users', {
      cookie: admin.cookie,
      body: {
        name: 'Reset Owner',
        email: 'reset@example.test',
        role: 'staff',
        password: 'initial-reset-password-12345',
      },
    });
    assert.equal(created.status, 201);
    const issued = await f.request('POST', `/api/users/${created.body.id}/password-reset`, {
      cookie: admin.cookie,
      body: { verificationReference: 'CASE-123' },
    });
    assert.equal(issued.status, 200);
    const body = { token: issued.body.token, newPassword: 'new-reset-owner-password-12345' };
    assert.equal((await f.request('POST', '/api/password-reset', { body })).status, 200);
    assert.equal((await f.request('POST', '/api/password-reset', { body })).status, 400);
    const raw = await f.runtime.store.db
      .prepare('SELECT * FROM users WHERE id=?')
      .get(created.body.id);
    await f.runtime.store.grant(f.runtime.config.sites[1], raw, 'staff');
    assert.equal(
      (
        await f.request('POST', `/api/users/${raw.id}/password-reset`, {
          cookie: admin.cookie,
          body: { verificationReference: 'CASE-124' },
        })
      ).status,
      409,
    );
  } finally {
    await f.close();
  }
});

test('restricted runtime role can serve the app but cannot change schema or rewrite audit events', async () => {
  const f = await fixture({ runtimeRole: true });
  try {
    const admin = await f.login();
    assert.equal(admin.status, 200);
    assert.equal((await f.checkin()).status, 201);
    const db = f.runtime.store.db;
    await assert.rejects(() => db.exec('CREATE TABLE securepass.unapproved(id int)'), /permission/);
    await assert.rejects(() => db.exec("UPDATE audit_chain SET detail='tampered'"), /permission/);
    await assert.rejects(() => db.exec('DELETE FROM audit_chain'), /permission/);
    const tokenHash = digest(admin.cookie.split('=')[1]);
    await db.prepare('DELETE FROM sessions WHERE token_hash=?').run(tokenHash);
    await assert.rejects(
      () =>
        requestContext.run(
          {
            scope: f.runtime.config.sites[0],
            userId: admin.body.user.id,
            role: 'admin',
            tokenHash,
          },
          () => f.runtime.store.tx(async () => {}),
        ),
      /Authentication changed/,
    );
  } finally {
    await f.close();
  }
});
