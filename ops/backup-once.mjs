import { runBackupCycle } from './backup-cycle.mjs';
const result = await runBackupCycle(process.env);
if (!result.ok) process.exitCode = 1;
