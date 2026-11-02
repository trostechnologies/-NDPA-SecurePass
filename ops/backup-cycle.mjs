import { writeManagedBackup, pruneManagedBackups } from '../server/backups.mjs';

export function runBackupCycle(
  environment,
  {
    write = writeManagedBackup,
    prune = pruneManagedBackups,
    log = console.log,
    error = console.error,
  } = {},
) {
  // Expiry is independent of successful new snapshots, including disk-full failures.
  let pruned;
  try {
    pruned = prune(environment);
    log(JSON.stringify({ event: 'backup_cleanup_completed', expiredFilesRemoved: pruned.removed }));
  } catch (cause) {
    error(JSON.stringify({ event: 'backup_cleanup_failed', code: cause.code || cause.name }));
  }
  try {
    const result = write(environment);
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
}
