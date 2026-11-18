import { openPostgres, tables } from './postgres.mjs';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  unlinkSync,
  readdirSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { loadConfig } from './config.mjs';
import { loadKeys, equal, digest } from './crypto.mjs';
import { openJournal, replayGovernance } from './journal.mjs';

const MAX_BACKUP_BYTES = 256 * 1024 * 1024;
const expiryFor = (config, createdAt) =>
  createdAt + Math.min(...config.sites.map((s) => s.backupRetentionDays)) * 86400000;
const ephemeral = [
  'sessions',
  'auth_challenges',
  'reset_tokens',
  'public_challenges',
  'idempotency',
  'rate_limits',
];
export async function snapshotDatabase(db, keys, journal, config) {
  const state = journal.read();
  const snapshot = await db.transaction(
    async () => {
      const contents = [];
      for (const [name, columns] of Object.entries(tables))
        contents.push({
          name,
          columns,
          rows: ephemeral.includes(name) ? [] : await db.prepare(`SELECT * FROM ${name}`).all(),
        });
      const auditHead = (await db
        .prepare('SELECT seq,mac FROM audit_chain ORDER BY seq DESC LIMIT 1')
        .get()) ||
        (await db.prepare('SELECT seq,mac FROM audit_checkpoint WHERE id=1').get()) || {
          seq: 0,
          mac: '0'.repeat(64),
        };
      const createdAt = new Date().toISOString();
      return {
        version: 3,
        engine: 'postgres',
        createdAt,
        expiresAt: expiryFor(config, Date.parse(createdAt)),
        scopes: config.sites.map((s) => s.scopeId).sort(),
        binding: config.mode === 'isolated' ? `isolated:${config.sites[0].scopeId}` : 'shared',
        journalHead: state.head,
        auditHead,
        tables: contents,
      };
    },
    { readOnly: true },
  );
  return keys.packBackup(snapshot);
}
export async function restoreSnapshot(encrypted, { keys, journal, config, db, targetDirectory }) {
  const snapshot = keys.unpackBackup(encrypted),
    state = journal.read();
  if (
    snapshot.version !== 3 ||
    snapshot.engine !== 'postgres' ||
    JSON.stringify(snapshot.scopes) !== JSON.stringify(config.sites.map((s) => s.scopeId).sort())
  )
    throw Error('Snapshot engine/version or customer/site registry does not match');
  const createdAt = Date.parse(snapshot.createdAt);
  if (
    !Number.isFinite(createdAt) ||
    createdAt > Date.now() + 300000 ||
    !Number.isSafeInteger(snapshot.expiresAt) ||
    snapshot.expiresAt <= createdAt ||
    snapshot.expiresAt > expiryFor(config, createdAt) ||
    snapshot.expiresAt <= Date.now()
  )
    throw Error('Snapshot expired or retention metadata invalid');
  if (
    snapshot.binding !==
    (config.mode === 'isolated' ? `isolated:${config.sites[0].scopeId}` : 'shared')
  )
    throw Error('Snapshot deployment binding mismatch');
  if (
    state.head.sequence < snapshot.journalHead.sequence ||
    (snapshot.journalHead.sequence &&
      state.entries[snapshot.journalHead.sequence - 1]?.signature !==
        snapshot.journalHead.lastSignature)
  )
    throw Error('Current authoritative privacy journal required');
  const dir = path.resolve(targetDirectory),
    anchor = path.join(dir, 'audit-head.json');
  if (existsSync(anchor)) throw Error('Restore needs a new local metadata directory');
  if (!db) throw Error('Restore requires an explicitly selected empty PostgreSQL target');
  const names = snapshot.tables.map((t) => t.name);
  if (new Set(names).size !== Object.keys(tables).length || names.some((name) => !tables[name]))
    throw Error('Invalid snapshot table set');
  await db.transaction(async () => {
    for (const name of Object.keys(tables))
      if (
        name !== 'schema_migrations' &&
        (await db.prepare(`SELECT COUNT(*) AS n FROM ${name}`).get()).n
      )
        throw Error('Restore target must be an empty migrated PostgreSQL database');
    // Fixed order respects identity foreign keys. No SQL supplied by the snapshot is executed.
    for (const name of Object.keys(tables)) {
      const t = snapshot.tables.find((t) => t.name === name),
        columns = tables[name];
      if (JSON.stringify(t.columns) !== JSON.stringify(columns))
        throw Error('Snapshot columns do not match reviewed schema');
      if (name === 'schema_migrations' || ephemeral.includes(name)) continue;
      for (const row of t.rows)
        await db
          .prepare(
            `INSERT INTO ${name} (${columns.join(',')}) VALUES (${columns.map(() => '?').join(',')})`,
          )
          .run(...columns.map((c) => row[c] ?? null));
    }
    await replayGovernance(db, state.entries, keys);
    await db
      .prepare(
        'DELETE FROM secure_records WHERE expires<=? AND NOT EXISTS (SELECT 1 FROM legal_holds h WHERE h.tenant_id=secure_records.tenant_id AND h.site_id=secure_records.site_id AND h.subject_hash=secure_records.email_hash AND h.released_at IS NULL)',
      )
      .run(Date.now());
    await db.exec(
      "UPDATE memberships SET status='suspended'; INSERT INTO installation(key,value) VALUES ('recovery_required','true') ON CONFLICT(key) DO UPDATE SET value=excluded.value;",
    );
  });
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const head = snapshot.auditHead;
  writeFileSync(anchor, JSON.stringify({ ...head, signature: keys.sign(JSON.stringify(head)) }), {
    mode: 0o600,
    flag: 'wx',
    flush: true,
  });
  return { quarantined: true, recordsReplayed: state.entries.length, sessionCount: 0 };
}
export async function writeManagedBackup(environment, { driver } = {}) {
  const config = loadConfig(environment),
    dir = path.resolve(config.env.SECUREPASS_DATA_DIR || './securepass-data'),
    keys = loadKeys(config.env, dir, config.production);
  const journal = openJournal(
    keys,
    config.env.SECUREPASS_JOURNAL_DIR || path.join(dir, 'privacy-journal'),
    { create: false },
  );
  const db = driver || (await openPostgres(config.env, { writerLock: false }));
  try {
    const encrypted = await snapshotDatabase(db, keys, journal, config),
      folder = path.resolve(config.env.SECUREPASS_BACKUP_DIR || path.join(dir, 'managed-backups'));
    mkdirSync(folder, { recursive: true, mode: 0o700 });
    const stamp = new Date().toISOString().replace(/[:.]/g, '-'),
      file = path.join(folder, `securepass-${stamp}-${randomBytes(4).toString('hex')}.spbackup`);
    if (Buffer.byteLength(encrypted) > MAX_BACKUP_BYTES)
      throw Error('Snapshot exceeds restore size limit');
    writeFileSync(file, encrypted, { mode: 0o600, flag: 'wx', flush: true });
    const snapshot = keys.unpackBackup(encrypted),
      expiresAt = snapshot.expiresAt;
    const body = {
      version: 3,
      file: path.basename(file),
      sha256: digest(encrypted),
      createdAt: snapshot.createdAt,
      expiresAt,
    };
    writeFileSync(
      file + '.manifest',
      JSON.stringify({ ...body, signature: keys.sign('backup-manifest:' + JSON.stringify(body)) }),
      { mode: 0o600, flag: 'wx', flush: true },
    );
    return { file, expiresAt: new Date(expiresAt).toISOString() };
  } finally {
    if (!driver) await db.close();
  }
}
export async function restoreManagedBackup(environment, file, targetDirectory, { driver } = {}) {
  if (statSync(file).size > MAX_BACKUP_BYTES) throw Error('Snapshot exceeds restore size limit');
  const config = loadConfig(environment),
    source = path.resolve(config.env.SECUREPASS_DATA_DIR || './securepass-data'),
    keys = loadKeys(config.env, source, config.production),
    journal = openJournal(
      keys,
      config.env.SECUREPASS_JOURNAL_DIR || path.join(source, 'privacy-journal'),
      { create: false },
    );
  const encrypted = readFileSync(file, 'utf8');
  const manifest = JSON.parse(readFileSync(file + '.manifest', 'utf8'));
  const body = verifyManifest(manifest, keys, path.basename(file));
  if (body.version !== 3 || body.sha256 !== digest(encrypted))
    throw Error('Backup content does not match its authenticated manifest');
  const snapshot = keys.unpackBackup(encrypted);
  if (body.expiresAt !== snapshot.expiresAt || body.createdAt !== snapshot.createdAt)
    throw Error('Backup retention metadata mismatch');
  const db = driver || (await openPostgres(config.env));
  try {
    if (!driver) await db.acquireWriter();
    return await restoreSnapshot(encrypted, { keys, journal, config, db, targetDirectory });
  } finally {
    if (!driver) await db.close();
  }
}
function verifyManifest(manifest, keys, file) {
  const { signature, ...body } = manifest;
  if (
    !equal(signature, keys.sign('backup-manifest:' + JSON.stringify(body))) ||
    body.file !== file ||
    !/^securepass-[\w-]+\.spbackup$/.test(body.file) ||
    !Number.isSafeInteger(body.expiresAt)
  )
    throw Error('Managed backup manifest integrity failed');
  return body;
}
export function pruneManagedBackups(environment, timestamp = Date.now()) {
  const config = loadConfig(environment),
    dir = path.resolve(config.env.SECUREPASS_DATA_DIR || './securepass-data'),
    keys = loadKeys(config.env, dir, config.production),
    folder = path.resolve(config.env.SECUREPASS_BACKUP_DIR || path.join(dir, 'managed-backups'));
  if (!existsSync(folder)) return { removed: 0 };
  let removed = 0;
  const failures = [];
  const names = readdirSync(folder);
  const candidates = new Set(
    names
      .filter((n) => /^securepass-[\w-]+\.spbackup(?:\.manifest)?$/.test(n))
      .map((n) => n.replace(/\.manifest$/, '')),
  );
  for (const name of candidates) {
    try {
      const target = path.resolve(folder, name),
        manifestFile = target + '.manifest';
      if (path.dirname(target) !== folder) throw Error('Backup target escapes managed directory');
      let expiresAt;
      if (existsSync(manifestFile)) {
        expiresAt = verifyManifest(
          JSON.parse(readFileSync(manifestFile, 'utf8')),
          keys,
          name,
        ).expiresAt;
      } else {
        // A crash between durable snapshot and manifest publication must not bypass expiry.
        if (statSync(target).size > MAX_BACKUP_BYTES)
          throw Error('Orphan snapshot exceeds restore size limit');
        const snapshot = keys.unpackBackup(readFileSync(target, 'utf8'));
        if (snapshot.version !== 3 || !Number.isSafeInteger(snapshot.expiresAt))
          throw Error('Orphan snapshot retention metadata invalid');
        expiresAt = snapshot.expiresAt;
      }
      if (expiresAt <= timestamp) {
        if (existsSync(target)) unlinkSync(target);
        if (existsSync(manifestFile)) unlinkSync(manifestFile);
        removed++;
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      'Managed backup integrity/cleanup failed; unaffected expired files were processed',
    );
  return { removed };
}
