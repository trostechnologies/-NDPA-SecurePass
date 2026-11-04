> Historical SQLite-era report/instructions. The current database is Supabase PostgreSQL. Use [the Supabase VPS guide](VPS_SUPABASE.md) and [migration notes](../SUPABASE_MIGRATION.md).

# SecurePass operations

Use Node.js 24 LTS. Keep secrets, personal data and runtime volumes outside source control. Never use the development fixture or browser-test server for production.

## Choose the installation boundary

`SECUREPASS_DEPLOYMENT_MODE=isolated` accepts exactly one site. Give each installation its own domain, database, keys, governance journal and backups. This supports separate customer installations and separate installations for individual sites.

`SECUREPASS_DEPLOYMENT_MODE=shared` requires a site registry. `sites.example.json` demonstrates two sites under one customer and a third site under another. Each entry needs unique `key` and unique `(tenantId, siteId)`. Users access `https://HOST/?site=REGISTRY_KEY`; the client sends `X-SecurePass-Site`, which the server checks against the session and membership. Changing a URL does not grant membership. Reception posters preserve the selected site.

The bootstrap administrator initially receives membership in every configured site. Use it only to provision independent site administrators, enroll their MFA, then remove unnecessary bootstrap memberships through User Management. Existing identities need explicit offline `grant` for additional sites; ordinary site administrators cannot attach a different customer's existing identity. Global identity credentials and MFA remain shared for an explicitly multi-site user; site roles and suspension are separate. A site admin cannot reset an identity with multiple memberships.

An initialized isolated database is bound to its customer/site. Changing the mode or binding in place is refused. Moving an established installation into shared hosting needs a separately reviewed data migration; do not relabel database rows or change registry identifiers. Removing existing scopes is also refused.

One database permits one application writer. Shared hosting supports multiple customers/sites, but does not support multiple app replicas against that database. Size capacity, partition deployments or plan a separately reviewed database architecture for higher availability.

## Production bootstrap

Generate configuration into a NEW private directory:

```sh
node ops/bootstrap.mjs --out .private --email admin@your-company.example --origin https://visitors.your-company.example
```

Replace every placeholder in `.private/sites.json` with reviewed controller/site identity, privacy contact, notice/version and retention. For shared mode add the other sites. `dataRetentionDays` defaults to 60; `backupRetentionDays` defaults to seven and must not exceed primary retention. The shortest backup schedule across configured sites governs shared snapshots. Neither default is a legal determination. Public host listings require both `publicDirectory: true` and explicit opt-in for each host. Reception remains the minimal public destination.

Store `secrets.json` in a real secret store with restricted access. On Windows, apply an owner-only ACL; POSIX mode flags alone do not establish Windows ACL protection. Bootstrap credentials are written to a private handover file, never printed to the console. Enroll MFA on first sign-in, rotate the bootstrap password and delete the handover file after secure transfer. Retain recovery codes separately from the account password.

Set deployment environment variables (for example in a private Compose `.env`):

```dotenv
SECUREPASS_HOSTNAME=visitors.your-company.example
SECUREPASS_ACME_EMAIL=operations@your-company.example
SECUREPASS_DEPLOYMENT_MODE=isolated
SECUREPASS_PRIVATE_DIR=./.private
SECUREPASS_BACKUP_POLICY_ACK=true
```

Set the acknowledgement only after approving backup custody, retention, expiry and external-copy procedures. Configure DNS and allow inbound TCP 80/443, then:

```sh
docker compose config --quiet
docker compose up --build -d
docker compose logs app backup
```

Only the TLS proxy publishes ports. Do not expose port 8080 or bypass the proxy. The app uses one explicitly trusted proxy hop; change the topology only after reviewing client-address and Origin handling. Protect Docker administration, host disks, persistent volumes and secret files. Patch and pin reviewed base images for the release environment. Export committed `audit_anchor` events to independently controlled immutable log custody and alert on integrity errors, failed backups, capacity exhaustion and repeated authentication abuse. Liveness/readiness are operational signals, not security attestations.

Before live rollout, verify the actual certificate/domain, MFA and recovery with two admins, customer/site denial cases, public notice, real-device gate checks if enabled, backup expiry, external audit custody and a full restore drill. This repository's local environment could not start Docker, so the container rollout must be validated on the target host.

## Local development and legacy upgrade

Run `npm ci`, copy `.env.example` to `.env`, replace its password, then run `npm run build` and `npm start`. For UI development use `npm run dev` alongside `npm run dev:server`. Use only fabricated personal data. The configured origin must exactly match the browser origin.

Back up the old installation before upgrading. Stop the writer. Legacy plaintext migration binds existing records to the configured site and revokes old unscoped sessions. For a multi-site registry explicitly set `SECUREPASS_MIGRATION_SITE` to the destination key. Development-only creation of new encryption keys for a plaintext legacy database requires `SECUREPASS_ALLOW_LEGACY_MIGRATION=true`; it is not a lost-key recovery option. Missing keys for encrypted data must fail closed. Old photo/ID fields and invalid historical invitations are removed, obsolete plaintext tables dropped, and the database vacuumed. Historic external backups remain governed by their own expiry and custody procedures.

## Gate integration

Keep `SECUREPASS_GATE_ENABLED=false` until site-bound device credentials are provisioned in the private device registry and the vendor integration is tested. Use the shape in `gate-devices.example.json`; store only token hashes in the registry, protect the actual random device tokens separately and rotate them with a short controlled overlap. A registered visitor is pending/reception-only. A recently authenticated site administrator must authorize a pass before a device can verify it. Devices must verify online and honor expiry, checkout/revocation and API failure. A printed QR alone is not an access decision. Photo and ID collection are disabled.

## Privacy and account recovery

The governance interface requires a different administrator to attest identity verification before disclosure or erasure. Record a non-sensitive case reference and the approved method, not copies of identity documents. Holds block erasure; hold release also needs a different administrator. Download receipts into controlled case storage. The independent signed journal must survive database restore and must not be rolled back together with it.

An admin-issued reset token is short-lived, single-use and requires a verified case. Issuing it revokes sessions; redeeming it retains MFA. Multi-site credentials require owner/operator recovery. Password or MFA changes require current credentials and recent factor verification. Lost MFA recovery is an offline operator procedure after independently verifying the owner.

`ops/manage.mjs` reads the same environment/secret configuration as the server. All mutating maintenance commands except snapshot creation require the app writer to be stopped; the lock refuses concurrent writers. Do not remove a lock until confirming that its process is dead and preserving evidence of an unclean shutdown.

```sh
npm run ops -- grant --email staff@your-company.example --site customer-a-lagos --role staff --case CASE-123
npm run ops -- verify-audit
```

For owner recovery, supply a unique 16+ character `SECUREPASS_RECOVERY_PASSWORD` through a secret store and run:

```sh
npm run ops -- recover --email admin@your-company.example --site customer-a-lagos --case CASE-124
```

Use `--reset-mfa yes` only when the verified owner also lost their factor and recovery codes. It removes that identity's factor and requires enrollment again. Clear the temporary recovery password immediately. Recovery activates the chosen site only; other memberships suspended by restoration remain suspended until independently reviewed.

## Backups and restoration

The backup container creates encrypted consistent logical snapshots every six hours. Expiry cleanup runs independently of creation success and processes unaffected expired copies even when another copy is damaged. Snapshots exclude active sessions and ephemeral authentication material. Format-2 snapshots embed authenticated expiry and have signed content-digest manifests; restore rejects expired copies. Preserve the snapshot filename and adjacent `.manifest` when copying them. Format-1 backups require reviewed offline recovery and cannot use normal restoration. Separate keys from backup storage, limit backup access and monitor both backup and cleanup failures. Manually run `npm run ops -- backup` or `npm run ops -- prune-backups` under the same configuration.

Stop the writer and preserve current authoritative governance journal and audit custody. Restore into an UNUSED target directory:

```sh
npm run ops -- restore --file /backups/SNAPSHOT_FILE --target /recovery/unused-directory
```

Restore requires the configured binding, decryption keys and current signed journal. It replays erasures and holds, removes expired non-held records, revokes sessions and suspends all memberships. The result remains quarantined until verified offline `recover` using that restored data directory. Switch to the recovered directory only after verification, then reactivate other memberships deliberately. Never restore a stale journal alongside a stale database to bypass erasure enforcement.

Erasure receipts state their extent: primary deletion plus replay enforcement and managed-copy expiry. They do not prove immediate physical or cryptographic destruction of all copies. Exports, external snapshots, offsite copies and disaster-recovery retention need separate tracked controls. Losing the authoritative journal blocks safe restoration; keep independently protected redundant copies of the current journal and signed head.

## Keys and audit custody

Data keys are a JSON keyring in `SECUREPASS_DATA_KEYS`, selected by `SECUREPASS_ACTIVE_KEY_ID`. Add the new key alongside the old keys, stop the writer, run `npm run ops -- rewrap`, verify, and restart. The command rewraps current records/notices/privacy cases/factors and revokes sessions. Retained backups may still need old data keys plus the backup key; retire keys only after all required snapshots are expired or re-encrypted. Index and audit keys are stable installation identities; changing them needs a separately reviewed migration, not the data rewrap command.

Audit records are append-only until an offline archive workflow verifies a prefix. Capacity fails closed; it never discards the oldest events automatically. Before capacity is exhausted:

```sh
npm run ops -- prepare-audit-archive --directory /archives --keep 1000
```

Upload the encrypted result to independent immutable storage and verify its returned SHA-256 there. Only then commit using the exact file and custody reference:

```sh
npm run ops -- commit-audit-archive --file /archives/ARCHIVE_FILE --reference IMMUTABLE_OBJECT_VERSION
npm run ops -- verify-audit-archive --file /archives/ARCHIVE_FILE
```

Keep the archive, external object version, signed checkpoint and keys for the approved audit retention. The tool validates chain continuity and the exact prefix; the supplied reference is an operator attestation, not an automatic cloud-storage verification. External immutable custody and external anchor retention are essential against a privileged host attacker who can replace both local data and local checkpoints.
