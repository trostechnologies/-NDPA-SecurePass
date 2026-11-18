import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
const args = Object.fromEntries(
  process.argv
    .slice(2)
    .map((value, i, all) => (value.startsWith('--') ? [value.slice(2), all[i + 1]] : null))
    .filter(Boolean),
);
if (
  !args.out ||
  !args.email ||
  !args.origin ||
  !/^https:\/\/[^/]+$/.test(args.origin) ||
  !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(args.email)
)
  throw Error(
    'Required: --out NEW_PRIVATE_DIRECTORY --email VERIFIED_ADMIN_EMAIL --origin https://HOST',
  );
const dir = path.resolve(args.out);
if (fs.existsSync(dir)) throw Error('Refusing to overwrite an existing secrets directory');
fs.mkdirSync(dir, { mode: 0o700 });
const secret = () => randomBytes(32).toString('base64');
const password = randomBytes(32).toString('base64url');
fs.writeFileSync(
  path.join(dir, 'secrets.json'),
  JSON.stringify(
    {
      SECUREPASS_DATA_KEYS: JSON.stringify({ v1: secret() }),
      SECUREPASS_ACTIVE_KEY_ID: 'v1',
      SECUREPASS_INDEX_KEY: secret(),
      SECUREPASS_AUDIT_KEY: secret(),
      SECUREPASS_BACKUP_KEY: secret(),
      SECUREPASS_ADMIN_EMAIL: args.email,
      SECUREPASS_ADMIN_PASSWORD: password,
    },
    null,
    2,
  ),
  { mode: 0o600, flag: 'wx' },
);
const site = {
  key: 'main',
  tenantId: 'customer-one',
  siteId: 'building-one',
  companyName: 'REPLACE WITH CONTROLLER NAME',
  facilityName: 'REPLACE WITH FACILITY NAME',
  dpoEmail: args.email,
  noticeVersion: 'REPLACE-WITH-REVIEWED-VERSION',
  privacyNoticeText:
    'Development placeholder. Replace with the controller-approved privacy notice before startup.',
  dataRetentionDays: 60,
  backupRetentionDays: 7,
  publicDirectory: false,
};
fs.writeFileSync(path.join(dir, 'sites.json'), JSON.stringify([site], null, 2), {
  mode: 0o600,
  flag: 'wx',
});
fs.writeFileSync(path.join(dir, 'gate-devices.json'), '[]\n', { mode: 0o600, flag: 'wx' });
fs.writeFileSync(
  path.join(dir, 'bootstrap-credentials.txt'),
  `Initial account: ${args.email}\nInitial password: ${password}\nEnroll MFA at first sign-in. Remove this file after secure handover and rotate the bootstrap credential.\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log(
  'Private configuration created. Complete sites.json and store secrets separately from backups before deployment.',
);
