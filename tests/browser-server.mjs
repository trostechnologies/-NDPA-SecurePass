import { postgresFixture } from './postgres-fixture.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createApplication } from '../server/app.mjs';
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'securepass-browser-'));
const port = Number(process.env.SECUREPASS_BROWSER_PORT || 4173),
  origin = `http://127.0.0.1:${port}`;
const databaseDriver = await postgresFixture(path.join(dir, 'pgdata'));
const runtime = await createApplication(
  {
    NODE_ENV: 'test',
    SECUREPASS_ORIGIN: origin,
    SECUREPASS_DATA_DIR: path.join(dir, 'data'),
    SECUREPASS_JOURNAL_DIR: path.join(dir, 'journal'),
    SECUREPASS_COOKIE_SECURE: 'false',
    SECUREPASS_ADMIN_EMAIL: 'browser-admin@example.test',
    SECUREPASS_ADMIN_PASSWORD: 'browser-admin-password-12345',
    SECUREPASS_MFA_REQUIRED: 'admin',
    SECUREPASS_NOTICE_VERSION: 'browser-1',
    SECUREPASS_NOTICE_TEXT: 'Browser test facility privacy notice.',
    SECUREPASS_SERVE_DIST: 'true',
    SECUREPASS_PROOF_DIFFICULTY: '1',
  },
  { databaseDriver },
);
// This test-only route is not part of the production application or container.
runtime.app.post('/__test/expire', async (_req, res) => {
  await runtime.store.db.prepare('UPDATE sessions SET expires_at=?').run(Date.now() - 1);
  res.json({ ok: true });
});
const server = runtime.app.listen(port, '127.0.0.1');
function stop() {
  server.closeAllConnections();
  server.close(async () => {
    await runtime.close();
    const resolved = path.resolve(dir);
    if (
      resolved.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
      path.basename(resolved).startsWith('securepass-browser-')
    )
      fs.rmSync(resolved, { recursive: true, force: true });
    process.exit(0);
  });
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
