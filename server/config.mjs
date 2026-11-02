import path from 'node:path';
import { readFileSync } from 'node:fs';

export function loadConfig(input) {
  const env = { ...input };
  if (env.SECUREPASS_SECRETS_FILE)
    Object.assign(env, JSON.parse(readFileSync(env.SECUREPASS_SECRETS_FILE, 'utf8')));
  const production = env.NODE_ENV === 'production';
  const number = (name, fallback, max) => {
    const value = Number(env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value < 1 || value > max) throw Error(`Invalid ${name}`);
    return value;
  };
  const origin = env.SECUREPASS_ORIGIN;
  if (!origin || new URL(origin).origin !== origin)
    throw Error('SECUREPASS_ORIGIN must be an exact origin');
  const mode = env.SECUREPASS_DEPLOYMENT_MODE || 'isolated';
  if (!['isolated', 'shared'].includes(mode)) throw Error('Invalid deployment mode');
  const sites = env.SECUREPASS_SITES_FILE
    ? JSON.parse(readFileSync(env.SECUREPASS_SITES_FILE, 'utf8'))
    : [
        {
          key: env.SECUREPASS_SITE_KEY || 'default',
          tenantId: env.SECUREPASS_TENANT_ID || 'default',
          siteId: env.SECUREPASS_SITE_ID || 'default',
          companyName: env.SECUREPASS_CONTROLLER_NAME || 'Development controller',
          facilityName: env.SECUREPASS_FACILITY_NAME || 'Development facility',
          dpoEmail: env.SECUREPASS_PRIVACY_EMAIL || '',
          noticeVersion: env.SECUREPASS_NOTICE_VERSION || 'development-1',
          privacyNoticeText:
            env.SECUREPASS_NOTICE_TEXT ||
            'Development only. Obtain the facility-approved notice before providing real personal data.',
          dataRetentionDays: number('SECUREPASS_RETENTION_DAYS', 60, 3650),
          publicDirectory: env.SECUREPASS_PUBLIC_DIRECTORY === 'true',
        },
      ];
  if (
    !Array.isArray(sites) ||
    !sites.length ||
    sites.length > 1000 ||
    (mode === 'isolated' && sites.length !== 1)
  )
    throw Error('Invalid site registry for deployment mode');
  const keys = new Set(),
    pairs = new Set();
  for (const s of sites) {
    for (const field of ['key', 'tenantId', 'siteId'])
      if (!/^[a-zA-Z0-9_-]{1,80}$/.test(s[field] || '')) throw Error(`Invalid site ${field}`);
    if (keys.has(s.key) || pairs.has(`${s.tenantId}:${s.siteId}`))
      throw Error('Duplicate site registry entry');
    keys.add(s.key);
    pairs.add(`${s.tenantId}:${s.siteId}`);
    if (
      !s.companyName ||
      !s.facilityName ||
      !s.noticeVersion ||
      !s.privacyNoticeText ||
      !Number.isInteger(s.dataRetentionDays) ||
      s.dataRetentionDays < 1 ||
      s.dataRetentionDays > 3650
    )
      throw Error('Incomplete site privacy configuration');
    if (
      production &&
      (!s.dpoEmail ||
        [s.companyName, s.facilityName, s.noticeVersion, s.privacyNoticeText].some((value) =>
          /^(Development|REPLACE)/i.test(value),
        ))
    )
      throw Error('Reviewed site privacy configuration required');
    s.scopeId = `${s.tenantId}:${s.siteId}`;
    s.publicDirectory = s.publicDirectory === true;
    s.backupRetentionDays =
      s.backupRetentionDays ??
      Math.min(number('SECUREPASS_BACKUP_RETENTION_DAYS', 7, 3650), s.dataRetentionDays);
    if (
      !Number.isInteger(s.backupRetentionDays) ||
      s.backupRetentionDays < 1 ||
      s.backupRetentionDays > s.dataRetentionDays
    )
      throw Error(
        'Backup retention must be positive and no longer than the primary-record schedule',
      );
  }
  const secure = env.SECUREPASS_COOKIE_SECURE !== 'false';
  if (
    production &&
    (!secure || !origin.startsWith('https://') || env.SECUREPASS_MFA_REQUIRED === 'none')
  )
    throw Error('Production requires HTTPS, Secure cookies and privileged MFA');
  if (
    production &&
    (!env.SECUREPASS_DATA_KEYS ||
      !env.SECUREPASS_INDEX_KEY ||
      !env.SECUREPASS_AUDIT_KEY ||
      !env.SECUREPASS_BACKUP_KEY)
  )
    throw Error('Production encryption, index, audit and backup keys are required');
  if (
    production &&
    (!env.SECUREPASS_JOURNAL_DIR ||
      !env.SECUREPASS_BACKUP_DIR ||
      env.SECUREPASS_BACKUP_POLICY_ACK !== 'true')
  )
    throw Error(
      'Production requires a separate journal volume, managed backup directory and reviewed backup policy',
    );
  if (production) {
    const directories = [
      env.SECUREPASS_DATA_DIR || './securepass-data',
      env.SECUREPASS_JOURNAL_DIR,
      env.SECUREPASS_BACKUP_DIR,
    ].map((value) => path.resolve(value));
    for (let i = 0; i < directories.length; i++)
      for (let j = i + 1; j < directories.length; j++) {
        const overlaps = (parent, child) => {
          const relative = path.relative(parent, child);
          return (
            relative === '' ||
            (relative !== '..' &&
              !relative.startsWith('..' + path.sep) &&
              !path.isAbsolute(relative))
          );
        };
        if (overlaps(directories[i], directories[j]) || overlaps(directories[j], directories[i]))
          throw Error(
            'Production data, journal and backup directories must be separate, non-nested paths',
          );
      }
  }
  return {
    env,
    production,
    origin,
    mode,
    sites,
    secure,
    number,
    mfaRequired: production ? 'admin' : env.SECUREPASS_MFA_REQUIRED || 'none',
    sessionMs: number('SECUREPASS_SESSION_MINUTES', 480, 1440) * 60000,
    maxRecords: number('SECUREPASS_MAX_RECORDS', 10000, 10000),
    maxAudits: number('SECUREPASS_MAX_AUDITS', 50000, 500000),
    gateEnabled: env.SECUREPASS_GATE_ENABLED === 'true',
    gateHours: number('SECUREPASS_PASS_HOURS', 12, 24),
    proofDifficulty: production
      ? Math.max(3, number('SECUREPASS_PROOF_DIFFICULTY', 3, 4))
      : number('SECUREPASS_PROOF_DIFFICULTY', 3, 4),
  };
}
