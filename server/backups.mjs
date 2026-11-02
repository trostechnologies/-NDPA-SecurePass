import { DatabaseSync } from 'node:sqlite';
import {
  existsSync,
  readFileSync,
  writeFileSync,
  mkdirSync,
  statSync,
  unlinkSync,
  readdirSync,
  openSync,
  closeSync,
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
const identifier = (name) => {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) throw Error('Invalid snapshot identifier');
  return '"' + name + '"';
};
export function snapshotDatabase(db, keys, journal, config) {
  const journalState = journal.read();
  let snapshot;
  db.exec('BEGIN');
  try {
    const schemas = db
      .prepare(
        "SELECT type,name,sql FROM sqlite_master WHERE sql IS NOT NULL AND name NOT LIKE 'sqlite_%' ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END,rowid",
      )
      .all();
    const tables = schemas
      .filter((s) => s.type === 'table')
      .map((s) => ({
        name: s.name,
        columns: db
          .prepare(`PRAGMA table_info(${identifier(s.name)})`)
          .all()
          .map((c) => c.name),
        rows: ephemeral.includes(s.name)
          ? []
          : db.prepare(`SELECT * FROM ${identifier(s.name)}`).all(),
      }));
    const auditHead = db
      .prepare('SELECT seq,mac FROM audit_chain ORDER BY seq DESC LIMIT 1')
      .get() ||
      db.prepare('SELECT seq,mac FROM audit_checkpoint WHERE id=1').get() || {
        seq: 0,
        mac: '0'.repeat(64),
      };
    snapshot = {
      version: 2,
      createdAt: new Date().toISOString(),
      expiresAt: expiryFor(config, Date.now()),
      scopes: config.sites.map((s) => s.scopeId).sort(),
      binding: config.mode === 'isolated' ? `isolated:${config.sites[0].scopeId}` : 'shared',
      journalHead: journalState.head,
      auditHead,
      schemas,
      tables,
    };
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return keys.packBackup(snapshot);
}
export function restoreSnapshot(encrypted, { keys, journal, config, targetDirectory }) {
  const snapshot = keys.unpackBackup(encrypted),
    state = journal.read();
  if (
    snapshot.version !== 2 ||
    JSON.stringify(snapshot.scopes) !== JSON.stringify(config.sites.map((s) => s.scopeId).sort())
  )
    throw Error(
      'Snapshot version or customer/site registry does not match; legacy snapshots require reviewed recovery',
    );
  const createdAt = Date.parse(snapshot.createdAt);
  if (
    !Number.isFinite(createdAt) ||
    createdAt > Date.now() + 300000 ||
    !Number.isSafeInteger(snapshot.expiresAt) ||
    snapshot.expiresAt <= createdAt ||
    snapshot.expiresAt > expiryFor(config, createdAt) + 1000 ||
    snapshot.expiresAt <= Date.now()
  )
    throw Error('Snapshot expired or retention metadata is invalid');
  const expected = config.mode === 'isolated' ? `isolated:${config.sites[0].scopeId}` : 'shared';
  if (snapshot.binding !== expected) throw Error('Snapshot deployment binding mismatch');
  if (
    state.head.sequence < snapshot.journalHead.sequence ||
    (snapshot.journalHead.sequence &&
      state.entries[snapshot.journalHead.sequence - 1]?.signature !==
        snapshot.journalHead.lastSignature)
  )
    throw Error('A current authoritative erasure journal is required');
  const dir = path.resolve(targetDirectory),
    file = path.join(dir, 'securepass.sqlite');
  if (existsSync(dir) && readdirSync(dir).length)
    throw Error('Restore target must be an unused data directory');
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  // Reserve exclusively before SQLite opens the file; never race into another database.
  const reservation = openSync(file, 'wx', 0o600);
  closeSync(reservation);
  let db,
    completed = false;
  try {
    db = new DatabaseSync(file);
    db.exec('PRAGMA foreign_keys=OFF; BEGIN IMMEDIATE;');
    for (const s of snapshot.schemas.filter((s) => s.type === 'table')) {
      identifier(s.name);
      if (!/^CREATE TABLE /i.test(s.sql)) throw Error('Unexpected snapshot schema');
      db.exec(s.sql);
    }
    for (const t of snapshot.tables) {
      const names = t.columns.map(identifier).join(','),
        insert = db.prepare(
          `INSERT INTO ${identifier(t.name)} (${names}) VALUES (${t.columns.map(() => '?').join(',')})`,
        );
      for (const row of t.rows) insert.run(...t.columns.map((name) => row[name]));
    }
    for (const s of snapshot.schemas.filter((s) => s.type !== 'table')) {
      identifier(s.name);
      if (!/^CREATE (?:UNIQUE )?(?:INDEX|TRIGGER) /i.test(s.sql))
        throw Error('Unexpected snapshot schema');
      db.exec(s.sql);
    }
    replayGovernance(db, state.entries, keys);
    db.prepare(
      'DELETE FROM secure_records WHERE expires<=? AND NOT EXISTS (SELECT 1 FROM legal_holds h WHERE h.tenant_id=secure_records.tenant_id AND h.site_id=secure_records.site_id AND h.subject_hash=secure_records.email_hash AND h.released_at IS NULL)',
    ).run(Date.now());
    for (const name of ephemeral) db.exec(`DELETE FROM ${identifier(name)}`);
    // Old passwords/factors from a historical snapshot must not silently reactivate.
    db.exec(
      "UPDATE memberships SET status='suspended'; INSERT OR REPLACE INTO installation VALUES ('recovery_required','true');",
    );
    if (db.prepare('PRAGMA foreign_key_check').all().length)
      throw Error('Snapshot foreign-key integrity failed');
    db.exec('COMMIT; PRAGMA foreign_keys=ON; PRAGMA secure_delete=ON; VACUUM;');
    if (db.prepare('PRAGMA integrity_check').get().integrity_check !== 'ok')
      throw Error('Restored database failed integrity check');
    const head = snapshot.auditHead;
    writeFileSync(
      path.join(dir, 'audit-head.json'),
      JSON.stringify({ ...head, signature: keys.sign(JSON.stringify(head)) }),
      { mode: 0o600, flag: 'wx' },
    );
    completed = true;
    return { quarantined: true, recordsReplayed: state.entries.length, sessionCount: 0 };
  } finally {
    db?.close();
    if (!completed)
      for (const suffix of ['', '-wal', '-shm'])
        if (existsSync(file + suffix)) unlinkSync(file + suffix);
  }
}
export function writeManagedBackup(environment) {
  const config = loadConfig(environment),
    dir = path.resolve(config.env.SECUREPASS_DATA_DIR || './securepass-data'),
    keys = loadKeys(config.env, dir, config.production);
  const journal = openJournal(
    keys,
    config.env.SECUREPASS_JOURNAL_DIR || path.join(dir, 'privacy-journal'),
    { create: false },
  );
  const db = new DatabaseSync(path.join(dir, 'securepass.sqlite'), { readOnly: true });
  try {
    const encrypted = snapshotDatabase(db, keys, journal, config),
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
      version: 2,
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
    db.close();
  }
}
export function restoreManagedBackup(environment, file, targetDirectory) {
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
  if (body.version !== 2 || body.sha256 !== digest(encrypted))
    throw Error('Backup content does not match its authenticated manifest');
  const snapshot = keys.unpackBackup(encrypted);
  if (body.expiresAt !== snapshot.expiresAt || body.createdAt !== snapshot.createdAt)
    throw Error('Backup retention metadata mismatch');
  return restoreSnapshot(encrypted, { keys, journal, config, targetDirectory });
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
        if (snapshot.version !== 2 || !Number.isSafeInteger(snapshot.expiresAt))
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
