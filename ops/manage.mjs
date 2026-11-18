import fs from 'node:fs';
import path from 'node:path';
import { createApplication } from '../server/app.mjs';
import { hashPassword, emailOK } from '../server/auth.mjs';
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
const [command, ...argumentsList] = process.argv.slice(2),
  args = Object.fromEntries(
    argumentsList
      .map((value, i) => (value.startsWith('--') ? [value.slice(2), argumentsList[i + 1]] : null))
      .filter(Boolean),
  );
async function main() {
  if (command === 'backup')
    return {
      ...(await writeManagedBackup(process.env)),
      pruned: (await pruneManagedBackups(process.env)).removed,
    };
  if (command === 'prune-backups') return await pruneManagedBackups(process.env);
  if (command === 'restore') {
    if (!args.file || !args.target)
      throw Error(
        'restore requires --file and --target; the authoritative journal must remain available',
      );
    return await restoreManagedBackup(process.env, args.file, args.target);
  }
  if (
    ![
      'grant',
      'recover',
      'rewrap',
      'verify-audit',
      'prepare-audit-archive',
      'commit-audit-archive',
      'verify-audit-archive',
    ].includes(command)
  )
    throw Error(
      'Commands: backup, prune-backups, restore, grant, recover, rewrap, verify-audit, prepare-audit-archive, commit-audit-archive, verify-audit-archive',
    );
  // Management is an OFFLINE operation. The exclusive writer lock refuses a live server.
  const runtime = await createApplication(
    { ...process.env, SECUREPASS_OPERATOR_RECOVERY: 'true' },
    { maintenance: true },
  );
  try {
    const { store, config } = runtime,
      { db, keys, tx, audit, grant, scoped } = store;
    if (command === 'verify-audit') return await store.verifyAudit();
    if (command === 'prepare-audit-archive')
      return await prepareAuditArchive(store, config, {
        directory: args.directory,
        keep: Number(args.keep || 1000),
      });
    if (command === 'commit-audit-archive')
      return await commitAuditArchive(store, config, {
        file: args.file,
        externalReference: args.reference,
      });
    if (command === 'verify-audit-archive') {
      if (!args.file) throw Error('--file required');
      const verified = verifyAuditArchive(fs.readFileSync(args.file, 'utf8'), keys);
      return { ok: true, lastSequence: verified.seq, lastHash: verified.mac };
    }
    if (command === 'rewrap') {
      await tx(async () => {
        for (const scope of config.sites) {
          for (const row of await db
            .prepare('SELECT * FROM secure_records WHERE tenant_id=? AND site_id=?')
            .all(...scoped(scope))) {
            const obj = keys.open(row.cipher, `record:${scope.scopeId}:${row.kind}:${row.id}`);
            await store.put(scope, row.kind, obj, row.expires);
          }
          for (const n of await db
            .prepare('SELECT version,cipher FROM notice_versions WHERE tenant_id=? AND site_id=?')
            .all(...scoped(scope)))
            await db
              .prepare(
                'UPDATE notice_versions SET cipher=? WHERE tenant_id=? AND site_id=? AND version=?',
              )
              .run(
                keys.seal(
                  keys.open(n.cipher, `notice:${scope.scopeId}:${n.version}`),
                  `notice:${scope.scopeId}:${n.version}`,
                ),
                ...scoped(scope),
                n.version,
              );
          for (const r of await db
            .prepare('SELECT id,cipher FROM privacy_requests WHERE tenant_id=? AND site_id=?')
            .all(...scoped(scope)))
            await db
              .prepare('UPDATE privacy_requests SET cipher=? WHERE id=?')
              .run(
                keys.seal(
                  keys.open(r.cipher, `privacy:${scope.scopeId}:${r.id}`),
                  `privacy:${scope.scopeId}:${r.id}`,
                ),
                r.id,
              );
          await audit(scope, 'operator', 'DATA_KEY_REWRAP', '', `Active key ${keys.active}`);
        }
        for (const f of await db.prepare('SELECT * FROM factors').all())
          await db
            .prepare('UPDATE factors SET secret_cipher=?,recovery_cipher=? WHERE user_id=?')
            .run(
              keys.seal(keys.open(f.secret_cipher, `mfa:${f.user_id}`), `mfa:${f.user_id}`),
              keys.seal(
                keys.open(f.recovery_cipher, `recovery:${f.user_id}`),
                `recovery:${f.user_id}`,
              ),
              f.user_id,
            );
        await db.exec('DELETE FROM auth_challenges; DELETE FROM sessions;');
      });
      return { rewrapped: true, activeKey: keys.active, sessionsRevoked: true };
    }
    if (
      !emailOK(args.email) ||
      !config.sites.some((s) => s.key === args.site) ||
      !/^[\w./-]{3,80}$/.test(args.case || '')
    )
      throw Error('A verified --email, --site and non-sensitive --case reference are required');
    const user = await db
        .prepare('SELECT * FROM users WHERE email=?')
        .get(args.email.trim().toLowerCase()),
      scope = config.sites.find((s) => s.key === args.site);
    if (!user) throw Error('Identity not found');
    if (command === 'grant') {
      if (!['admin', 'staff'].includes(args.role)) throw Error('--role must be admin or staff');
      await tx(async () => {
        await grant(scope, user, args.role);
        await db
          .prepare(
            "UPDATE memberships SET role=?,status='active' WHERE user_id=? AND tenant_id=? AND site_id=?",
          )
          .run(args.role, user.id, ...scoped(scope));
        await audit(
          scope,
          'operator',
          'SITE_MEMBERSHIP_GRANTED',
          user.id,
          'Operator case verified',
        );
      });
      return { granted: true, site: scope.key };
    }
    const password = process.env.SECUREPASS_RECOVERY_PASSWORD;
    if (!password || password.length < 16 || password.length > 1024)
      throw Error(
        'Supply a unique 16–1024 character SECUREPASS_RECOVERY_PASSWORD through a secret store',
      );
    const passwordHash = await hashPassword(password);
    await tx(async () => {
      await db
        .prepare('UPDATE users SET password_hash=?,status=? WHERE id=?')
        .run(passwordHash, 'active', user.id);
      await grant(scope, { ...user, status: 'active' }, 'admin');
      await db
        .prepare(
          "UPDATE memberships SET status='active',role='admin' WHERE user_id=? AND tenant_id=? AND site_id=?",
        )
        .run(user.id, ...scoped(scope));
      await db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);
      await db.prepare('DELETE FROM auth_challenges WHERE user_id=?').run(user.id);
      if (args['reset-mfa'] === 'yes')
        await db.prepare('DELETE FROM factors WHERE user_id=?').run(user.id);
      await db
        .prepare("INSERT OR REPLACE INTO installation VALUES ('recovery_required','false')")
        .run();
      await audit(
        scope,
        'operator',
        'OPERATOR_RECOVERY',
        user.id,
        'Account owner verified offline; other memberships remain suspended',
      );
    });
    return { recovered: true, site: scope.key, mfaEnrollmentRequired: args['reset-mfa'] === 'yes' };
  } finally {
    await runtime.close();
  }
}
try {
  console.log(JSON.stringify(await main()));
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
