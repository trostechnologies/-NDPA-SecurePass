import { defineConfig } from '@playwright/test';
const port = process.env.SECUREPASS_BROWSER_PORT || '4173';
export default defineConfig({
  testDir: 'tests/browser',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  retries: 0,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    headless: true,
    viewport: { width: 1440, height: 1000 },
    trace: 'retain-on-failure',
    ...(process.platform === 'win32' ? { channel: 'msedge' } : {}),
  },
  webServer: {
    command: 'node tests/browser-server.mjs',
    url: `http://127.0.0.1:${port}/api/health`,
    reuseExistingServer: false,
    timeout: 30000,
  },
});
