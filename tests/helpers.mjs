import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { randomUUID, createHash } from 'node:crypto';
import assert from 'node:assert/strict';
import { createApplication } from '../server/app.mjs';

export const adminEmail = 'admin@example.test',
  adminPassword = 'unique-test-admin-password-12345';
export const site = (key, tenantId = 'tenant-one', siteId = key) => ({
  key,
  tenantId,
  siteId,
  companyName: `Controller ${tenantId}`,
  facilityName: `Facility ${siteId}`,
  dpoEmail: 'privacy@example.test',
  noticeVersion: 'test-1',
  privacyNoticeText: 'Test facility privacy notice.',
  dataRetentionDays: 60,
  publicDirectory: false,
});
export async function fixture(options = {}) {
  const root = options.root || fs.mkdtempSync(path.join(os.tmpdir(), 'securepass-test-')),
    data = path.join(root, 'data');
  const env = {
    NODE_ENV: 'test',
    SECUREPASS_ORIGIN: 'http://localhost:3000',
    SECUREPASS_DATA_DIR: data,
    SECUREPASS_JOURNAL_DIR: path.join(root, 'journal'),
    SECUREPASS_COOKIE_SECURE: 'false',
    SECUREPASS_ADMIN_EMAIL: adminEmail,
    SECUREPASS_ADMIN_PASSWORD: adminPassword,
    SECUREPASS_NOTICE_VERSION: 'test-1',
    SECUREPASS_NOTICE_TEXT: 'Test facility privacy notice.',
    SECUREPASS_PROOF_DIFFICULTY: '1',
    ...options.env,
  };
  if (options.sites) {
    const file = path.join(root, 'sites.json');
    fs.writeFileSync(file, JSON.stringify(options.sites));
    env.SECUREPASS_SITES_FILE = file;
    env.SECUREPASS_DEPLOYMENT_MODE = 'shared';
  }
  if (options.devices) {
    const file = path.join(root, 'devices.json');
    fs.writeFileSync(file, JSON.stringify(options.devices));
    env.SECUREPASS_GATE_DEVICES_FILE = file;
    env.SECUREPASS_GATE_ENABLED = 'true';
  }
  const runtime = await createApplication(env),
    server = runtime.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`,
    defaultSite = options.sites?.[0].key || null;
  async function request(
    method,
    url,
    { body, cookie, site: scope = defaultSite, origin = env.SECUREPASS_ORIGIN, headers = {} } = {},
  ) {
    const response = await fetch(base + url, {
      method,
      headers: {
        ...(origin ? { Origin: origin } : {}),
        ...(scope ? { 'X-SecurePass-Site': scope } : {}),
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...headers,
      },
      ...(body !== undefined
        ? { body: typeof body === 'string' ? body : JSON.stringify(body) }
        : {}),
    });
    const raw = await response.text();
    let parsed;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw;
    }
    return {
      status: response.status,
      body: parsed,
      headers: response.headers,
      cookie: response.headers.get('set-cookie')?.split(';')[0],
    };
  }
  const login = (email = adminEmail, password = adminPassword, scope = defaultSite) =>
    request('POST', '/api/login', { body: { email, password }, site: scope });
  const proof = async (scope = defaultSite) => {
    const r = await request('POST', '/api/checkin/challenge', { body: {}, site: scope });
    assert.equal(r.status, 200);
    for (let answer = 0; answer < 10000000; answer++)
      if (
        createHash('sha256')
          .update(`${r.body.token}:${answer}`)
          .digest('hex')
          .startsWith('0'.repeat(r.body.difficulty))
      )
        return { token: r.body.token, answer: String(answer) };
    throw Error('Proof not found');
  };
  let counter = 0;
  const visitorBody = (extra = {}) => ({
    fullName: 'Test Visitor',
    email: `guest-${++counter}@example.test`,
    phone: '+2348000000000',
    hostEmployeeId: 'reception',
    generalConsentGranted: true,
    noticeVersion: 'test-1',
    idempotencyKey: randomUUID(),
    ...extra,
  });
  const checkin = async (extra = {}, scope = defaultSite) =>
    request('POST', '/api/checkin', {
      site: scope,
      body: { ...visitorBody(extra), proof: await proof(scope) },
    });
  async function close({ preserve = false } = {}) {
    server.closeAllConnections();
    await new Promise((resolve) => server.close(resolve));
    runtime.close();
    if (!preserve) {
      const target = path.resolve(root);
      assert.ok(
        target.startsWith(path.resolve(os.tmpdir()) + path.sep) &&
          path.basename(target).startsWith('securepass-test-'),
      );
      fs.rmSync(target, { recursive: true, force: true });
    }
  }
  return {
    root,
    data,
    env,
    runtime,
    server,
    base,
    request,
    login,
    proof,
    visitorBody,
    checkin,
    close,
  };
}
