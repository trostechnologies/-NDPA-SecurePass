import { writeManagedBackup, pruneManagedBackups } from '../server/backups.mjs';
const interval = Number(process.env.SECUREPASS_BACKUP_INTERVAL_HOURS || 6);
if (!Number.isFinite(interval) || interval < 1 || interval > 24)
  throw Error('Backup interval must be 1–24 hours');
function run() {
  try {
    const result = writeManagedBackup(process.env),
      pruned = pruneManagedBackups(process.env);
    console.log(
      JSON.stringify({
        event: 'backup_completed',
        expiresAt: result.expiresAt,
        expiredFilesRemoved: pruned.removed,
      }),
    );
  } catch (error) {
    console.error(JSON.stringify({ event: 'backup_failed', code: error.code || error.name }));
  }
}
run();
setInterval(run, interval * 3600000);
