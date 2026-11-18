import { writeManagedBackup, pruneManagedBackups } from '../server/backups.mjs';

export async function runBackupCycle(
  environment,
  {
    write = writeManagedBackup,
    prune = pruneManagedBackups,
    log = console.log,
    error = console.error,
  } = {},
) {
  // Expiry is independent of successful new snapshots, including disk-full failures.
  let pruned,
    cleanupOk = false,
    backupOk = false;
  try {
    pruned = await prune(environment);
    cleanupOk = true;
    log(JSON.stringify({ event: 'backup_cleanup_completed', expiredFilesRemoved: pruned.removed }));
  } catch (cause) {
    error(JSON.stringify({ event: 'backup_cleanup_failed', code: cause.code || cause.name }));
  }
  try {
    const result = await write(environment);
    backupOk = true;
    log(
      JSON.stringify({
        event: 'backup_completed',
        expiresAt: result.expiresAt,
        expiredFilesRemoved: pruned?.removed ?? null,
      }),
    );
  } catch (cause) {
    error(JSON.stringify({ event: 'backup_failed', code: cause.code || cause.name }));
  }
  return { ok: cleanupOk && backupOk };
}
