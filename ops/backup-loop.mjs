import { runBackupCycle } from './backup-cycle.mjs';
const interval = Number(process.env.SECUREPASS_BACKUP_INTERVAL_HOURS || 6);
if (!Number.isFinite(interval) || interval < 1 || interval > 24)
  throw Error('Backup interval must be 1–24 hours');
let running = false;
async function run() {
  if (running) return;
  running = true;
  try {
    await runBackupCycle(process.env);
  } finally {
    running = false;
  }
}
run();
setInterval(run, interval * 3600000);
