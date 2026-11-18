import fs from 'node:fs';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { openPostgres } from '../server/postgres.mjs';

const [command, ...rest] = process.argv.slice(2),
  output = rest[rest.indexOf('--out') + 1];
const env = { ...process.env };
if (env.SECUREPASS_DATABASE_FILE)
  Object.assign(env, JSON.parse(fs.readFileSync(env.SECUREPASS_DATABASE_FILE, 'utf8')));
const db = await openPostgres(env, { writerLock: command !== 'check' });
try {
  if (command === 'check') {
    const result = await db.query(
      "SELECT current_database() AS database,current_user AS role,EXISTS(SELECT 1 FROM information_schema.tables WHERE table_schema='securepass' AND table_name='schema_migrations') AS migrated",
    );
    console.log(JSON.stringify({ connected: true, ...result.rows[0] }));
  } else if (command === 'migrate' || command === 'provision') {
    if (command === 'provision' && (!rest.includes('--out') || !output || fs.existsSync(output)))
      throw Error('provision requires --out NEW_PRIVATE_FILE');
    await db.acquireWriter();
    await db.transaction(async () => {
      await db.exec(
        fs.readFileSync(new URL('../migrations/001_postgres.sql', import.meta.url), 'utf8'),
      );
      if (command === 'provision') {
        const password = randomBytes(32).toString('base64url');
        await db.exec(
          `CREATE ROLE securepass_runtime LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD ${pg.escapeLiteral(password)};`,
        );
        await db.exec(
          fs.readFileSync(new URL('../migrations/runtime-grants.sql', import.meta.url), 'utf8'),
        );
        const suffix = env.PGUSER.includes('.') ? '.' + env.PGUSER.split('.').at(-1) : '';
        const credentials = {
          PGHOST: env.PGHOST,
          PGPORT: String(env.PGPORT || 5432),
          PGDATABASE: env.PGDATABASE,
          PGUSER: 'securepass_runtime' + suffix,
          PGPASSWORD: password,
          ...(env.PGSSLROOTCERT ? { PGSSLROOTCERT: env.PGSSLROOTCERT } : {}),
        };
        fs.writeFileSync(path.resolve(output), JSON.stringify(credentials, null, 2), {
          mode: 0o600,
          flag: 'wx',
          flush: true,
        });
      }
    });
    console.log(
      JSON.stringify({
        migrated: true,
        ...(command === 'provision' ? { runtimeCredentialsCreated: true } : {}),
      }),
    );
  } else throw Error('Commands: check, migrate, provision --out NEW_PRIVATE_FILE');
} catch (error) {
  console.error(
    JSON.stringify({ event: 'database_management_failed', code: error.code || error.name }),
  );
  process.exitCode = 1;
} finally {
  await db.close();
}
