# Supabase PostgreSQL migration

This release replaces the SQLite persistence implementation with PostgreSQL through `pg`. It targets the supplied Supabase Cloud session-pooler connection. No SQLite database is created or opened by the runtime, test suite or management tools. The VPS serves the app through Nginx/systemd; Docker is optional and not required for the selected deployment.

## Implementation

- Explicit, transactional migration installs only the private `securepass` schema. Existing Supabase `public`, `auth` and `storage` application data are not moved or modified. Application tables deny `PUBLIC`, `anon` and `authenticated` schema/table access. Do not expose this private schema through the Data API.
- The browser continues to use scoped backend endpoints. It has no PostgreSQL password or Supabase service key. Existing password/session/MFA authentication remains; this does not implement Supabase Auth, email delivery or SSO.
- Administrative provisioning creates a separate restricted runtime role and writes a NEW private credentials file. Runtime cannot create schema, rewrite/delete audit events or alter migration/archive checkpoints. Production rejects elevated PostgreSQL role flags. Migrations, archive commit and full restore require separate operator credentials.
- TLS certificate verification is mandatory. Host, port, database, username and password are separate configuration fields; a URI cannot replace the TLS settings. Trusted project CA configuration is optional; verification must never be disabled.
- Asynchronous queries retain one client for each transaction using async-local context, with rollback and nested-transaction propagation. A session-level advisory writer lease preserves the existing one-writer application/journal boundary. The session pooler on 5432 is required; transaction pooling on 6543 is unsuitable for that lease. Losing the lease fails closed and requires service restart.
- Epoch times and counters use PostgreSQL BIGINT, decoded only within JavaScript's safe integer range. Parameter binding remains separate from SQL. Fixed internal upserts use PostgreSQL `ON CONFLICT`; no payload-supplied SQL is executed.
- Scoped encrypted records, notice immutability, membership/session boundaries, host ownership, durable throttles, invitation redemption, gate expiry/revocation and signed audit chaining remain. Private-schema permissions protect the backend boundary; this is not a claim of per-user database RLS or database-per-tenant isolation in shared mode.
- Authenticated mutations recheck session, membership status and role inside the transaction, preventing queued revoked requests from writing. MFA challenge attempts/consumption and concurrent check-in idempotency are transactional. Gate authorization and checkout re-read current state while holding the write transaction.
- Format-3 encrypted logical snapshots use a repeatable-read, read-only PostgreSQL transaction. Fixed tables/columns are exported; sessions and ephemeral authentication material are omitted. Signed manifest digests and embedded expiry are checked. Cleanup is independent of creation success. Restore only accepts an empty migrated PostgreSQL target, replays current authoritative erasures/holds, expires non-held records, suspends memberships and enters recovery quarantine.
- Signed governance intents and audit checkpoints remain independently persisted on the VPS. Snapshot/restore changes do not provision external immutable log custody or offsite journal/key storage.

## Compatibility and existing data

This is a persistence implementation migration, not an automatic import of any existing visitor/user data. Existing SQLite files, keys and backups must be preserved if they contain data you need. Nothing here deletes those files. Arrange a separately verified offline import before switching a populated installation. Format-1/2 SQLite snapshots cannot be used as PostgreSQL snapshots by editing their version.

Supabase provider-managed backup/PITR behavior is outside this logical snapshot tool. After provider-level restore, isolate the application and reconcile the independently retained governance journal and credentials before opening access. Provider-console restoration does not automatically invoke application recovery quarantine. Controller backup retention, offsite custody and restore procedures must cover both sets of copies.

Both deployment modes remain available: a dedicated PostgreSQL database/project per isolated customer/site installation, or multiple registered customers/sites in one scoped shared service. One active backend writer per database remains intentional. This migration does not claim horizontally active replicas or automatic failover. Existing immutable scope bindings still prevent relabeling a populated installation.

## Validation and limits

Automated tests run the actual schema and HTTP application against disposable PGlite PostgreSQL/WASM databases, plus driver transaction/lease tests. PGlite is a development dependency only. It exercises PostgreSQL schema, constraints, role permissions and transaction semantics without using the live Supabase project. Tests cover runtime-role denial, revoked requests, customer/site isolation, MFA/recovery, single-use resets, concurrent idempotency, gates, signed audit archive, encryption tampering and verified privacy/restore workflows. SQLite-specific legacy tests were replaced with PostgreSQL tests; old test counts do not describe this release.

Live Supabase credentials were not supplied and no live tables were created, migration run, runtime role provisioned or application deployed by the author. Connection/TLS and Supavisor session/role behavior still require a real `ops/database.mjs check`, migration/provisioning and live acceptance on the VPS. Nginx/systemd configurations are provided for review; they were not installed or exercised on the VPS. The VPS's last supplied DNS result pointed at a different IP and needs correction before certificate issuance.

Follow [the native VPS + Supabase guide](deploy/VPS_SUPABASE.md). It replaces previous SQLite/Docker deployment instructions.

Local verification on 2026-11-04: clean lockfile installation, TypeScript check and production build passed; all 19 automated tests passed with zero skips/failures; the real-browser acceptance test passed; production dependency audit reported zero known vulnerabilities. Optional Compose interpolation/syntax validation also passed. None of these results substitutes for live Supabase/VPS verification.

Connection and role provisioning follow [Supabase connection guidance](https://supabase.com/docs/guides/database/connecting-to-postgres) and [PostgreSQL role guidance](https://supabase.com/docs/guides/database/postgres/roles). Transaction clients and TLS settings follow [node-postgres transactions](https://node-postgres.com/features/transactions) and [SSL configuration](https://node-postgres.com/features/ssl).
