import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { digest, equal } from './crypto.mjs';
import { auditEventBody } from './database.mjs';
export function verifyAuditArchive(encrypted, keys) {
  const archive = keys.unpackBackup(encrypted);
  if (
    archive.type !== 'securepass-audit-segment' ||
    archive.version !== 1 ||
    !archive.events?.length
  )
    throw Error('Invalid audit archive');
  if (archive.previousCheckpoint) {
    const { signature, ...body } = JSON.parse(archive.previousCheckpoint.receipt);
    if (
      !equal(signature, keys.sign('audit-checkpoint:' + JSON.stringify(body))) ||
      body.seq !== archive.previousCheckpoint.seq ||
      body.mac !== archive.previousCheckpoint.mac
    )
      throw Error('Audit archive predecessor checkpoint is invalid');
  }
  let previous = archive.previousCheckpoint?.mac || '0'.repeat(64),
    seq = archive.previousCheckpoint?.seq || 0;
  for (const event of archive.events) {
    if (
      event.seq !== seq + 1 ||
      event.previous_hash !== previous ||
      !equal(event.mac, keys.sign(auditEventBody(event)))
    )
      throw Error('Audit archive chain integrity failed');
    seq = event.seq;
    previous = event.mac;
  }
  return { archive, seq, mac: previous };
}
export async function prepareAuditArchive(store, config, { directory, keep = 1000 } = {}) {
  await store.verifyAudit();
  const count = (await store.db.prepare('SELECT COUNT(*) AS n FROM audit_chain').get()).n;
  if (!Number.isSafeInteger(keep) || keep < 0)
    throw Error('Invalid number of recent events to retain');
  const take = count - keep;
  if (take <= 0) throw Error('No audit events available to archive');
  const events = await store.db.prepare('SELECT * FROM audit_chain ORDER BY seq LIMIT ?').all(take),
    checkpoint = await store.db.prepare('SELECT * FROM audit_checkpoint WHERE id=1').get();
  const encrypted = store.keys.packBackup({
    type: 'securepass-audit-segment',
    version: 1,
    createdAt: new Date().toISOString(),
    previousCheckpoint: checkpoint
      ? { seq: checkpoint.seq, mac: checkpoint.mac, receipt: checkpoint.receipt }
      : null,
    events,
  });
  const folder = path.resolve(
    directory || config.env.SECUREPASS_AUDIT_ARCHIVE_DIR || path.join(store.dir, 'audit-archives'),
  );
  fs.mkdirSync(folder, { recursive: true, mode: 0o700 });
  const file = path.join(
    folder,
    `audit-${events[0].seq}-${events.at(-1).seq}-${randomBytes(8).toString('hex')}.spaudit`,
  );
  fs.writeFileSync(file, encrypted, { mode: 0o600, flag: 'wx', flush: true });
  return {
    file,
    sha256: digest(encrypted),
    from: events[0].seq,
    to: events.at(-1).seq,
    next: 'Upload to independently protected storage, verify SHA-256, then commit with the immutable object/version reference',
  };
}
export async function commitAuditArchive(store, config, { file, externalReference }) {
  if (!file || !textReference(externalReference))
    throw Error('An independently verified archive reference is required');
  await store.verifyAudit();
  const encrypted = fs.readFileSync(file, 'utf8'),
    { archive, seq, mac } = verifyAuditArchive(encrypted, store.keys);
  const previous = await store.db.prepare('SELECT * FROM audit_checkpoint WHERE id=1').get();
  if (
    (previous?.seq || 0) !== (archive.previousCheckpoint?.seq || 0) ||
    (previous?.mac || '0'.repeat(64)) !== (archive.previousCheckpoint?.mac || '0'.repeat(64))
  )
    throw Error('Audit archive no longer matches the current prefix');
  const current = await store.db
    .prepare('SELECT * FROM audit_chain WHERE seq<=? ORDER BY seq')
    .all(seq);
  if (JSON.stringify(current) !== JSON.stringify(archive.events))
    throw Error('Audit archive contents do not match the database');
  const body = {
      version: 1,
      seq,
      mac,
      from: archive.events[0].seq,
      archiveSha256: digest(encrypted),
      externalReference,
      committedAt: new Date().toISOString(),
    },
    receipt = { ...body, signature: store.keys.sign('audit-checkpoint:' + JSON.stringify(body)) };
  await store.tx(async () => {
    await store.db.exec('ALTER TABLE audit_chain DISABLE TRIGGER audit_no_delete;');
    await store.db.prepare('DELETE FROM audit_chain WHERE seq<=?').run(seq);
    await store.db
      .prepare('INSERT OR REPLACE INTO audit_checkpoint VALUES (1,?,?,?)')
      .run(seq, mac, JSON.stringify(receipt));
    await store.db.exec('ALTER TABLE audit_chain ENABLE TRIGGER audit_no_delete;');
    await store.audit(
      config.sites[0],
      'operator',
      'AUDIT_ARCHIVE_COMMITTED',
      '',
      'Externally referenced encrypted segment checkpointed',
    );
  });
  return receipt;
}
const textReference = (value) =>
  typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._:/-]{2,299}$/.test(value);
