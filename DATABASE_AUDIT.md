# Database audit and remediation — 2026-11-02

Scope: SQLite persistence, deployment boundaries, encrypted snapshots, restore safety, expiry cleanup and readiness. Source review and automated tests used disposable local databases. No live VPS or hosted database was available to inspect. This report does not certify a running deployment.

## Verified issues resolved

| Priority | Finding | Resolution |
| --- | --- | --- |
| High | Snapshot restore ignored the backup expiry schedule. A retained expired encrypted file could be restored. | Format 2 embeds authenticated creation/expiry timestamps; restore rejects expired snapshots and invalid retention metadata before creating the target. Legacy format 1 is refused by the ordinary restore path. |
| High | A signed manifest described a filename but did not bind it to a particular encrypted snapshot. | New manifests sign a SHA-256 digest. Managed restore checks signature, filename, digest and agreement with encrypted retention metadata. Missing manifests and swapped contents fail closed. |
| Medium | Backup creation failure skipped expiry cleanup. One damaged manifest also blocked cleanup of unrelated expired files. | Scheduled cleanup runs independently before snapshot creation. Pruning processes unaffected files before reporting aggregate errors. |
| Medium | A crash after snapshot writing but before manifest publication left an unmanaged encrypted copy. | Snapshot and manifest writes flush contents. Pruning recognizes orphan format-2 snapshots and uses their authenticated embedded expiry. Corrupt or legacy orphans require operator review. |
| Medium | Production only required directory variables; equal or nested data/journal/backup paths were accepted. | Production configuration rejects equal or nested resolved paths. Physical mount boundaries, aliases/symlinks and offsite custody still require deployment review. |
| Medium | Restore checked for an existing database before opening SQLite, leaving a check/open race. | Restore requires an empty target directory and exclusively reserves its new database file. It never opens another writer's existing file. |
| Medium | Readiness stayed successful when audit capacity prevented audited writes. | Readiness returns 503 when audit capacity is exhausted. Verified archive maintenance restores capacity. |

SQLite explicitly requests `synchronous=FULL`, WAL journaling, foreign-key enforcement, secure deletion and a bounded busy timeout. FULL improves commit durability; the storage stack must still honor flushes and needs its own resilience testing.

## Tests

`npm test` includes actual database/HTTP tests plus new regression cases for file swapping, expiry, missing manifests, orphan cleanup, damaged-copy isolation, simulated disk-full creation failure, production directory overlap, synchronous mode and exhausted-capacity readiness. Existing customer/site isolation, encryption context binding, audit tampering, erasure replay and restore quarantine tests remain in place.

## Deployment decision and remaining work

The selected target is a new VPS. No database has yet been provisioned there. The Compose package stores SQLite at `/data/securepass.sqlite` in the persistent `app-data` volume; it publishes only the HTTPS proxy. No database TCP port is needed. Each isolated installation must use independent volumes and secrets. Shared hosting uses scoped records in a single installation and a single application writer.

SQLite is retained in this change; a VPS does not automatically require PostgreSQL. This design does not provide multiple active backend replicas, database-level row security or automatic failover. A future PostgreSQL conversion needs its own migration and verification work.

The VPS address, SSH access, OS and domain are needed before deployment can be inspected or performed. On the target host, validate the container build, TLS, persistent volumes, MFA, customer/site denial cases and a full restore/recovery drill. Keep database and journal custody separate from backups; separate directories on one VPS do not protect against VPS loss. Configure independently protected offsite copies, external audit custody, host/volume encryption, monitoring and restore-tested key recovery before live data collection. No offsite service or storage account has been provisioned by this code change.

## Backup upgrade

New snapshots use format 2 and must travel with their `.manifest` file, preserving their filename. Format-1 backups lack authenticated embedded expiry and are intentionally rejected by normal restoration. If an old snapshot is the only recovery source, preserve it and obtain a reviewed offline migration; do not disable verification or relabel its version. Do not destroy the only recoverable copy before successfully verifying a new backup and recovery drill.

Expired-file pruning deletes managed files; it does not prove physical media destruction or erasure of external copies. Legal holds and signed erasure replay remain part of the restoration workflow. See [operations](deploy/OPERATIONS.md).
