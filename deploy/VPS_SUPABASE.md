# VPS + Supabase deployment (no Docker)

Target: Ubuntu 24.04 VPS `194.163.165.4`, Nginx, application bound only to `127.0.0.1:8181`, hostname `securepass.trostechnologies.com`. Supabase project `tyfpwyulwoufimjtfjtv` uses the provided **session pooler**, `aws-0-eu-west-1.pooler.supabase.com:5432`, database `postgres`. These endpoints are configuration, not secrets. The password is supplied privately on the VPS.

The browser talks only to the VPS API. Sensitive application tables are in the private `securepass` PostgreSQL schema. No browser Supabase key is needed. Supabase Auth, Storage and email delivery have not been enabled by selecting Supabase as the database; the existing SecurePass password/session/MFA implementation remains in use.

## 1. Prepare the release and service account

Keep existing Nginx sites, Java on port 8080 and any existing database/files running. Update your checkout of `security/audit-remediation`, then run `npm ci --ignore-scripts --no-audit --no-fund`, `npm run lint`, `npm run build`. Node 22.23.1 meets the declared minimum; CI uses Node 24. Do not globally replace Node on a shared VPS without checking its other services.

Create the `securepass` system user/group if absent. Place the built release in `/opt/securepass`, readable by this user, with source code owned by root. Do not overwrite an existing installation blindly. Stop SecurePass for a reviewed upgrade, preserve its keys/journal/metadata, and back it up first.

Create the runtime directories:

```sh
install -d -o securepass -g securepass -m 750 \
  /var/lib/securepass-state /var/lib/securepass-journal \
  /var/lib/securepass-backups /var/lib/securepass-audit-archives
```

`securepass-state` contains local audit checkpoints and installation metadata. **It is not a SQLite database.** PostgreSQL data lives in Supabase. The journal must remain independently recoverable and must never be rolled back with an old database snapshot.

## 2. Configure installation keys and site policy

On a fresh installation only, use `node ops/bootstrap.mjs --out /etc/securepass --email YOUR_ADMIN_EMAIL --origin https://securepass.trostechnologies.com`. The directory must not already exist. If keys/configuration were generated earlier, preserve and reuse them; do not generate replacements for existing encrypted data.

Complete `/etc/securepass/sites.json` with the actual controller/site identity, privacy contact, versioned approved notice and approved primary/backup retention. Use `isolated` with exactly one site, or `shared` with the full customer/site registry before initialization. The same scoped application supports both; independent isolated installations need separate Supabase databases/projects and keys. Do not change an initialized binding or remove scopes by editing identifiers.

Do not use the development notice in production. Photo/ID collection and gates remain disabled by default. Store the bootstrap handover file privately; enrol MFA and rotate the initial password after sign-in. Separate installation keys from backup custody.

## 3. Provision PostgreSQL without putting the admin password in source

Run this on the VPS as an operator in `/opt/securepass`. It creates only the `securepass` schema and its objects, then a restricted application role; it does not import, erase or overwrite an existing SQLite database. If you have existing SecurePass data in SQLite, stop and arrange a separately verified export/import before switching. Old SQLite snapshots cannot be restored into PostgreSQL by relabeling their format.

```sh
cd /opt/securepass
export PGHOST=aws-0-eu-west-1.pooler.supabase.com
export PGPORT=5432
export PGDATABASE=postgres
export PGUSER=postgres.tyfpwyulwoufimjtfjtv
read -r -s -p 'Supabase database administrator password: ' PGPASSWORD
printf '\n'
export PGPASSWORD
node ops/database.mjs provision --out /etc/securepass/database.json
unset PGPASSWORD PGUSER PGHOST PGPORT PGDATABASE
```

The command requires a NEW private output file and an unused `securepass_runtime` role. It refuses reuse instead of changing a possibly active role's password. It prints success metadata only. If it fails, stop and inspect the error code and database state; do not delete tables or credentials to retry.

It creates `securepass_runtime.tyfpwyulwoufimjtfjtv` session-pooler credentials with a strong random password. The role can use application tables but cannot create schema, rewrite/delete audit events or edit migration/archive checkpoints. Administrative migrations/archive/restore operations use operator credentials separately. The production application rejects roles with elevated database-administration flags. Do not add Supabase database administrator credentials, service-role keys or database passwords to frontend `VITE_*` variables.

TLS certificate verification is always enabled. If the project's chain needs an explicit CA, download the trusted CA from the Supabase dashboard and set `PGSSLROOTCERT` to its private configuration path before provisioning. Do not set `rejectUnauthorized=false`, disable verification or switch to the transaction pooler (6543); a session-level writer lease requires session pooling.

## 4. Set the service environment and permissions

Copy `.env.example` to `/etc/securepass/runtime.env`, review its paths and keep `SECUREPASS_DATABASE_FILE=/etc/securepass/database.json`. The database file holds the restricted credentials generated above. Review backup policy before setting `SECUREPASS_BACKUP_POLICY_ACK=true`. Use `HOST=127.0.0.1`, `PORT=8181`, exact HTTPS origin and `TRUST_PROXY=1` for the one local Nginx hop. Do not put configuration into the public web directory.

```sh
chown root:securepass /etc/securepass
chmod 750 /etc/securepass
chown root:securepass /etc/securepass/secrets.json /etc/securepass/sites.json \
  /etc/securepass/gate-devices.json /etc/securepass/database.json /etc/securepass/runtime.env
chmod 640 /etc/securepass/secrets.json /etc/securepass/sites.json \
  /etc/securepass/gate-devices.json /etc/securepass/database.json /etc/securepass/runtime.env
chmod 600 /etc/securepass/bootstrap-credentials.txt
```

Before starting, check a real connection without displaying the password:

```sh
sudo -u securepass /usr/bin/node --env-file=/etc/securepass/runtime.env /opt/securepass/ops/database.mjs check
```

It must show `connected: true`, the intended database/runtime role and `migrated: true`. Confirm no other process is using 8181. No live Supabase connectivity was available to the code author; this check and the VPS acceptance tests are mandatory.

## 5. Start the application and backup timer

```sh
install -m 644 deploy/systemd/securepass.service /etc/systemd/system/securepass.service
install -m 644 deploy/systemd/securepass-backup.service /etc/systemd/system/securepass-backup.service
install -m 644 deploy/systemd/securepass-backup.timer /etc/systemd/system/securepass-backup.timer
systemctl daemon-reload
systemctl enable --now securepass.service
systemctl enable --now securepass-backup.timer
systemctl status securepass.service --no-pager
journalctl -u securepass.service -n 60 --no-pager
curl --fail http://127.0.0.1:8181/api/ready
```

The process runs as `securepass`, with a root-owned release and restricted writable state paths. It never creates a local SQLite fallback. One active application writer per PostgreSQL database is enforced using an advisory session lock; this release does not promise horizontally replicated application instances. Loss of the lock connection makes requests fail closed; investigate the connection and restart the service before resuming. Monitor readiness, connection errors and backup failures externally.

## 6. Connect the existing Nginx and obtain HTTPS

Correct the subdomain A record to `194.163.165.4`; the last supplied DNS output pointed at `94.136.170.25`. Check with `getent ahostsv4 securepass.trostechnologies.com`. Review any AAAA record too. Allow public TCP 80/443 and outbound access to the Supabase session pooler. Keep 8181 bound to loopback; do not stop existing Nginx sites or the Java service.

If there is no existing SecurePass virtual host, install `deploy/nginx/securepass.conf` as `/etc/nginx/sites-available/securepass`, link it into `sites-enabled`, run `nginx -t`, then reload Nginx only if validation passes. The supplied virtual host forwards to 127.0.0.1:8181 and replaces forwarded client-address headers. It is an HTTP bootstrap configuration; do not collect real data until HTTPS is configured.

Use your existing approved certificate tooling or Certbot's Nginx integration to obtain a certificate for this hostname and enable HTTP-to-HTTPS redirection. Test Nginx configuration again and verify automatic renewal. Keep Caddy inactive; no Docker is needed. Verify `https://securepass.trostechnologies.com/api/ready`, then sign in at `https://securepass.trostechnologies.com/?site=main` for the default site key.

## 7. Backups, recovery and release acceptance

Run `systemctl start securepass-backup.service` and inspect its journal. Cleanup is independent of new snapshot success; failures produce a failing service exit status. The six-hour timer is persistent across missed runs. Format-3 logical backups contain a consistent PostgreSQL table snapshot, exclude ephemeral authentication material, enforce signed content/expiry, and keep the existing signed erasure/hold replay and quarantine controls. No snapshot-supplied SQL is executed on restore.

Supabase provider backups/PITR are additional copies governed by your selected plan and settings. This code does not configure, delete, encrypt or certify all provider-managed copies. After a provider-level restore, isolate access and reconcile the authoritative journal before serving requests; do not assume a provider dashboard restore performs application quarantine or credential revocation for you. Restrict operators and provider-console access. Arrange approved offsite custody of keys, current journal/checkpoints and application backups. Copies on the VPS alone are insufficient for VPS loss.

Managed restore requires an explicitly selected **empty migrated PostgreSQL target**, a new local checkpoint directory, original keys/current journal, operator credentials, and a verified unexpired format-3 snapshot plus manifest. Configure the target connection privately, then run `ops/manage.mjs restore --file SNAPSHOT --target NEW_METADATA_DIRECTORY`. It refuses a populated database, restores in a transaction, replays erasures/holds, removes expired non-held records, clears ephemeral material and suspends memberships. Complete the offline account-owner `recover` procedure before serving the restored application. Rotate compromised credentials and deliberately reactivate other memberships. Runtime-only credentials cannot perform administrative archive or full restore operations.

Before using real personal data: run a live restore/recovery drill, verify TLS and renewals, MFA/recovery, customer/site denial cases, independent erasure approval, retention/hold behavior and offsite monitoring/custody. Actual physical gates and email delivery require separate integrations. Previous SQLite/Docker reports are historical, not current deployment instructions.
