import { runBackupCycle } from './backup-cycle.mjs';
const interval = Number(process.env.SECUREPASS_BACKUP_INTERVAL_HOURS || 6);
if (!Number.isFinite(interval) || interval < 1 || interval > 24)
  throw Error('Backup interval must be 1–24 hours');
function run() {
  runBackupCycle(process.env);
}
run();
setInterval(run, interval * 3600000);
