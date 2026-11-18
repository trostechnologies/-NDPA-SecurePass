import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { createPostgresAdapter } from '../server/postgres.mjs';

export async function postgresFixture(directory, { runtimeRole = false } = {}) {
  const engine = await PGlite.create(directory);
  let queue = Promise.resolve();
  const acquire = async () => {
    let release;
    const prior = queue;
    queue = new Promise((resolve) => {
      release = resolve;
    });
    await prior;
    return release;
  };
  const normalize = (result) => ({
    rows: (result?.rows || []).map((row) =>
      Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, typeof v === 'bigint' ? Number(v) : v]),
      ),
    ),
    rowCount: result?.affectedRows ?? result?.rows?.length ?? 0,
  });
  const query = async (sql, values = []) => {
    if (sql.includes('pg_advisory_xact_lock')) return { rows: [], rowCount: 0 };
    if (!values.length && sql.trim().split(';').filter(Boolean).length > 1) {
      const results = await engine.exec(sql);
      return normalize(results.at(-1));
    }
    return normalize(await engine.query(sql, values));
  };
  const pool = {
    async query(sql, values) {
      const release = await acquire();
      try {
        return await query(sql, values);
      } finally {
        release();
      }
    },
    async connect() {
      const release = await acquire();
      return { query, release };
    },
    async end() {
      await engine.close();
    },
  };
  await pool.query(
    `DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='anon') THEN CREATE ROLE anon; END IF; IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN CREATE ROLE authenticated; END IF; END $$;`,
  );
  await pool.query(
    'BEGIN;' +
      readFileSync(new URL('../migrations/001_postgres.sql', import.meta.url), 'utf8') +
      'COMMIT;',
  );
  await pool.query('SET search_path TO securepass, pg_catalog');
  if (runtimeRole) {
    await pool.query('CREATE ROLE securepass_runtime NOINHERIT;');
    await pool.query(
      readFileSync(new URL('../migrations/runtime-grants.sql', import.meta.url), 'utf8'),
    );
    await pool.query('SET ROLE securepass_runtime');
  }
  return createPostgresAdapter(pool, { writerLock: false });
}
