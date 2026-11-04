import pg from 'pg';
import { AsyncLocalStorage } from 'node:async_hooks';
import { readFileSync } from 'node:fs';

// Fixed identifiers, never supplied by an API caller.
export const tables = {
  schema_migrations: ['version', 'at'],
  installation: ['key', 'value'],
  notice_versions: ['tenant_id', 'site_id', 'version', 'hash', 'cipher', 'at'],
  users: [
    'id',
    'email',
    'name',
    'role',
    'department',
    'title',
    'status',
    'password_hash',
    'created_at',
  ],
  memberships: ['user_id', 'tenant_id', 'site_id', 'role', 'status', 'name', 'department', 'title'],
  sessions: [
    'token_hash',
    'user_id',
    'expires_at',
    'tenant_id',
    'site_id',
    'created_at',
    'mfa_verified_at',
  ],
  secure_records: [
    'tenant_id',
    'site_id',
    'kind',
    'id',
    'cipher',
    'email_hash',
    'code_hash',
    'owner_id',
    'visitor_id',
    'badge_hash',
    'host_id',
    'status',
    'expires',
    'created_at',
  ],
  rate_limits: ['key', 'count', 'expires'],
  factors: ['user_id', 'secret_cipher', 'last_counter', 'recovery_cipher'],
  auth_challenges: [
    'token_hash',
    'user_id',
    'tenant_id',
    'site_id',
    'kind',
    'secret_cipher',
    'expires',
    'attempts',
  ],
  reset_tokens: ['token_hash', 'user_id', 'expires'],
  public_challenges: ['token_hash', 'tenant_id', 'site_id', 'source_hash', 'expires'],
  idempotency: ['key_hash', 'tenant_id', 'site_id', 'fingerprint', 'visitor_id', 'expires'],
  legal_holds: [
    'id',
    'tenant_id',
    'site_id',
    'subject_hash',
    'case_ref',
    'created_by',
    'created_at',
    'released_at',
  ],
  privacy_requests: [
    'id',
    'tenant_id',
    'site_id',
    'visitor_id',
    'type',
    'status',
    'requested_by',
    'verified_by',
    'cipher',
    'created_at',
  ],
  erasures: ['id', 'tenant_id', 'site_id', 'subject_hash', 'record_ids', 'at', 'receipt'],
  audit_chain: [
    'seq',
    'at',
    'tenant_id',
    'site_id',
    'actor',
    'action',
    'target',
    'detail',
    'previous_hash',
    'mac',
  ],
  audit_checkpoint: ['id', 'seq', 'mac', 'receipt'],
  security_metrics: ['scope', 'event', 'count', 'last_at'],
};
const primary = {
  installation: ['key'],
  notice_versions: ['tenant_id', 'site_id', 'version'],
  memberships: ['user_id', 'tenant_id', 'site_id'],
  secure_records: ['tenant_id', 'site_id', 'kind', 'id'],
  factors: ['user_id'],
  audit_checkpoint: ['id'],
};

export function statementSql(source) {
  let sql = source.trim();
  if (/^INSERT OR IGNORE /i.test(sql))
    sql = sql.replace(/^INSERT OR IGNORE /i, 'INSERT ') + ' ON CONFLICT DO NOTHING';
  if (/^INSERT OR REPLACE /i.test(sql)) {
    sql = sql.replace(/^INSERT OR REPLACE /i, 'INSERT ');
    const table = /^INSERT INTO (\w+)/i.exec(sql)?.[1],
      keys = primary[table],
      columns = tables[table];
    if (!keys || !columns) throw Error('Unsupported upsert table');
    sql += ` ON CONFLICT (${keys.join(',')}) DO UPDATE SET ${columns
      .filter((c) => !keys.includes(c))
      .map((c) => `${c}=excluded.${c}`)
      .join(',')}`;
  }
  sql = sql.replace(
    /SET count=count\+1/g,
    () =>
      'SET count=' +
      (/INTO security_metrics/.test(sql) ? 'security_metrics' : 'rate_limits') +
      '.count+1',
  );
  sql = sql.replace(/WHERE count<\?/g, 'WHERE rate_limits.count<?');
  let index = 0,
    quote = false;
  return sql.replace(/'|'\b|\?/g, (token) => {
    if (token === "'") {
      quote = !quote;
      return token;
    }
    return token === '?' && !quote ? '$' + ++index : token;
  });
}

export function connectionOptions(env) {
  if (!env.PGHOST || !env.PGUSER || !env.PGDATABASE || !env.PGPASSWORD)
    throw Error('Supabase PostgreSQL host, user, database and password are required');
  const port = Number(env.PGPORT || 5432);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw Error('Invalid PostgreSQL port');
  // Separate fields prevent a URI's sslmode from silently replacing certificate verification.
  return {
    host: env.PGHOST,
    port,
    user: env.PGUSER,
    database: env.PGDATABASE,
    password: env.PGPASSWORD,
    ssl: {
      rejectUnauthorized: true,
      ...(env.PGSSLROOTCERT ? { ca: readFileSync(env.PGSSLROOTCERT, 'utf8') } : {}),
    },
    max: 5,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 30000,
    application_name: 'securepass',
    types: {
      getTypeParser(oid, format) {
        return oid === 20
          ? (value) => {
              const n = Number(value);
              if (!Number.isSafeInteger(n)) throw Error('PostgreSQL integer outside safe range');
              return n;
            }
          : pg.types.getTypeParser(oid, format);
      },
    },
  };
}

export function createPostgresAdapter(
  pool,
  { writerLock = true, initialize = async () => {} } = {},
) {
  const context = new AsyncLocalStorage();
  let writer,
    closed = false,
    writerFailed = false;
  const checkout = async () => {
    const client = await pool.connect();
    try {
      await initialize(client);
      return client;
    } catch (error) {
      client.release(true);
      throw error;
    }
  };
  const query = async (sql, values = []) => {
    if (writerFailed) throw Error('Database writer lease lost; restart required');
    const current = context.getStore();
    if (current) return current.query(sql, values);
    const client = await checkout();
    try {
      return await client.query(sql, values);
    } finally {
      client.release();
    }
  };
  return {
    dialect: 'postgres',
    query,
    inTransaction: () => !!context.getStore(),
    async acquireWriter() {
      if (!writerLock) return;
      writer = await checkout();
      const result = await writer.query('SELECT pg_try_advisory_lock(843061, 1) AS acquired');
      if (!result.rows[0].acquired) {
        writer.release();
        writer = null;
        throw Error('Another SecurePass writer is active for this database');
      }
      writer.on?.('error', () => {
        console.error(JSON.stringify({ event: 'database_writer_connection_lost' }));
        writerFailed = true;
      });
    },
    prepare(source) {
      const sql = statementSql(source);
      return {
        async get(...values) {
          return (await query(sql, values)).rows[0];
        },
        async all(...values) {
          return (await query(sql, values)).rows;
        },
        async run(...values) {
          const result = await query(sql, values);
          return { changes: result.rowCount };
        },
      };
    },
    async exec(sql) {
      return query(sql);
    },
    async transaction(fn, { readOnly = false } = {}) {
      if (writerFailed) throw Error('Database writer lease lost; restart required');
      if (context.getStore()) return fn();
      const client = await checkout();
      try {
        await client.query(readOnly ? 'BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY' : 'BEGIN');
        if (!readOnly) await client.query('SELECT pg_advisory_xact_lock(843061, 2)');
        const result = await context.run(client, fn);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    async close() {
      if (closed) return;
      closed = true;
      if (writer) {
        await writer.query('SELECT pg_advisory_unlock(843061, 1)').catch(() => {});
        writer.release();
      }
      await pool.end();
    },
  };
}
export async function openPostgres(env, options) {
  const pool = new pg.Pool(connectionOptions(env));
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_pool_error' })));
  const initialized = new WeakSet();
  return createPostgresAdapter(pool, {
    ...options,
    initialize: async (client) => {
      if (initialized.has(client)) return;
      await client.query(
        'SET search_path TO securepass, pg_catalog; SET statement_timeout TO 15000; SET idle_in_transaction_session_timeout TO 30000;',
      );
      initialized.add(client);
    },
  });
}
