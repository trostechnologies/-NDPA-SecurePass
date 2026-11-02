import {
  mkdirSync,
  existsSync,
  readFileSync,
  writeFileSync,
  renameSync,
  openSync,
  writeSync,
  fsyncSync,
  closeSync,
} from 'node:fs';
import { randomBytes } from 'node:crypto';
import path from 'node:path';
import { equal } from './crypto.mjs';

export function openJournal(keys, directory, { create = true, expectExisting = false } = {}) {
  const dir = path.resolve(directory),
    file = path.join(dir, 'erasure-journal.jsonl'),
    headFile = path.join(dir, 'erasure-head.json');
  if (!existsSync(file) || !existsSync(headFile)) {
    if (!create || expectExisting) throw Error('Authoritative erasure journal/checkpoint missing');
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    if (existsSync(file) || existsSync(headFile))
      throw Error('Incomplete erasure journal; independent recovery required');
    writeFileSync(file, '', { mode: 0o600, flag: 'wx' });
    const h = { sequence: 0, lastSignature: '0'.repeat(64) };
    writeFileSync(
      headFile,
      JSON.stringify({ ...h, signature: keys.sign('journal-head:' + JSON.stringify(h)) }),
      { mode: 0o600, flag: 'wx' },
    );
  }
  function read() {
    let sequence = 0,
      lastSignature = '0'.repeat(64);
    const entries = [];
    for (const line of readFileSync(file, 'utf8').split('\n').filter(Boolean)) {
      const r = JSON.parse(line),
        { signature, ...body } = r;
      if (
        r.sequence !== sequence + 1 ||
        r.previousSignature !== lastSignature ||
        !equal(signature, keys.sign('journal-entry:' + JSON.stringify(body)))
      )
        throw Error('Erasure journal integrity failure');
      sequence = r.sequence;
      lastSignature = signature;
      entries.push(r);
    }
    const saved = JSON.parse(readFileSync(headFile, 'utf8')),
      { signature, ...head } = saved;
    if (
      !equal(signature, keys.sign('journal-head:' + JSON.stringify(head))) ||
      head.sequence > sequence
    )
      throw Error('Erasure journal rollback detected');
    if (head.sequence && entries[head.sequence - 1]?.signature !== head.lastSignature)
      throw Error('Erasure checkpoint mismatch');
    // An interrupted fsync-to-checkpoint interval can only advance from a valid prefix.
    return { entries, head: { sequence, lastSignature } };
  }
  function checkpoint(head) {
    const data = { ...head, signature: keys.sign('journal-head:' + JSON.stringify(head)) },
      temp = headFile + '.' + randomBytes(8).toString('hex') + '.tmp';
    writeFileSync(temp, JSON.stringify(data), { mode: 0o600 });
    renameSync(temp, headFile);
  }
  const initial = read();
  if (create) checkpoint(initial.head);
  return {
    dir,
    read,
    append(body) {
      const prior = read().head,
        event = { ...body, sequence: prior.sequence + 1, previousSignature: prior.lastSignature },
        entry = { ...event, signature: keys.sign('journal-entry:' + JSON.stringify(event)) };
      const fd = openSync(file, 'a', 0o600);
      try {
        writeSync(fd, JSON.stringify(entry) + '\n');
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      checkpoint({ sequence: entry.sequence, lastSignature: entry.signature });
      return entry;
    },
  };
}

/** Reconcile only signed, independently retained governance intents. */
export function replayGovernance(db, entries, keys) {
  let changes = 0;
  for (const entry of entries) {
    if (entry.action === 'hold')
      changes += Number(
        db
          .prepare('INSERT INTO legal_holds VALUES (?,?,?,?,?,?,?,NULL) ON CONFLICT(id) DO NOTHING')
          .run(
            entry.holdId,
            entry.tenantId,
            entry.siteId,
            entry.subjectHash,
            entry.caseReference,
            entry.actor,
            entry.at,
          ).changes,
      );
    else if (entry.action === 'release_hold')
      changes += Number(
        db
          .prepare(
            'UPDATE legal_holds SET released_at=? WHERE id=? AND tenant_id=? AND site_id=? AND (released_at IS NULL OR released_at<>?)',
          )
          .run(entry.at, entry.holdId, entry.tenantId, entry.siteId, entry.at).changes,
      );
    else if (entry.action === 'erase') {
      for (const record of entry.records)
        changes += Number(
          db
            .prepare(
              'DELETE FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=? AND id=?',
            )
            .run(entry.tenantId, entry.siteId, record.kind, record.id).changes,
        );
      changes += Number(
        db
          .prepare('INSERT OR IGNORE INTO erasures VALUES (?,?,?,?,?,?,?)')
          .run(
            entry.id,
            entry.tenantId,
            entry.siteId,
            entry.subjectHash,
            JSON.stringify(entry.records),
            entry.at,
            JSON.stringify(entry),
          ).changes,
      );
      const request = db
        .prepare("SELECT * FROM privacy_requests WHERE id=? AND status<>'fulfilled'")
        .get(entry.requestId);
      if (request) {
        const aad = `privacy:${entry.tenantId}:${entry.siteId}:${request.id}`,
          body = keys.open(request.cipher, aad);
        changes += Number(
          db
            .prepare(
              "UPDATE privacy_requests SET status='fulfilled',verified_by=?,cipher=? WHERE id=?",
            )
            .run(
              entry.approvedBy,
              keys.seal(
                {
                  ...body,
                  status: 'fulfilled',
                  verifiedBy: entry.approvedBy,
                  verificationReference:
                    body.verificationReference ||
                    `HASH-${entry.identityVerification.caseReferenceHash}`,
                  verificationMethod: entry.identityVerification.method,
                  verifiedAt: entry.identityVerification.verifiedAt,
                },
                aad,
              ),
              request.id,
            ).changes,
        );
      }
    }
  }
  return changes;
}
export function verifyGovernance(db, entries) {
  const holds = new Map();
  for (const e of entries) {
    if (e.action === 'hold') holds.set(e.holdId, { ...e, releasedAt: null });
    else if (e.action === 'release_hold') {
      const h = holds.get(e.holdId);
      if (!h) throw Error('Unmatched legal-hold release in journal');
      h.releasedAt = e.at;
    } else if (e.action === 'erase')
      for (const r of e.records)
        if (
          db
            .prepare(
              'SELECT 1 FROM secure_records WHERE tenant_id=? AND site_id=? AND kind=? AND id=?',
            )
            .get(e.tenantId, e.siteId, r.kind, r.id)
        )
          throw Error('Erased record resurrection detected');
  }
  const rows = db.prepare('SELECT * FROM legal_holds').all();
  if (rows.length !== holds.size) throw Error('Legal-hold journal/database mismatch');
  for (const r of rows) {
    const h = holds.get(r.id);
    if (
      !h ||
      h.tenantId !== r.tenant_id ||
      h.siteId !== r.site_id ||
      h.subjectHash !== r.subject_hash ||
      h.caseReference !== r.case_ref ||
      h.actor !== r.created_by ||
      h.releasedAt !== r.released_at
    )
      throw Error('Legal-hold integrity failure');
  }
  return true;
}
