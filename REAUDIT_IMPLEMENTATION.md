# SecurePass re-audit implementation

This change implements the technical findings supplied in `SecurePass_Reaudit_Findings.md`. The PRD and solution brief informed product context; their compliance and security claims are not treated as evidence. This is an implementation report, not a legal compliance certification or independent penetration test.

## Finding coverage

| Finding | Implementation | Verification |
| --- | --- | --- |
| Missing build, real API and browser checks | TypeScript/build checks, real HTTP fixtures, browser acceptance test and CI | `npm run lint`, `npm run build`, `npm test`, `npm run test:browser` |
| Separate and shared deployments | Explicit isolated/shared registry; customer/site-bound sessions, memberships, records, invites, device credentials and governance | Shared customer and same-customer/different-site negative tests |
| Invitation ownership and overposting | Server-owned host identity; strict field allowlists; minimal public lookup; atomic, email/host/date-bound single redemption | Invitation and cross-scope HTTP tests |
| Public registration abuse | Persistent SQLite throttles; source/site-bound, expiring one-use proof; idempotency; active-visitor duplicate checks | Replay, retry, duplicate and restart tests |
| Registration mistaken for gate permission | Pending/reception-only state; explicit recent-admin approval; site-bound authenticated device verification; expiry and checkout revocation | Real HTTP gate API tests |
| Photo/ID lifecycle missing | Camera/photo/ID collection disabled; legacy sensitive fields removed during migration; no arbitrary submission fields | Migration and input validation tests |
| Mutable or silently truncated audits | Signed chained audit records, mutation triggers, signed head, fail-closed capacity; two-stage encrypted archive with external custody reference | Mutation, tail rollback, capacity and archive restart tests |
| Privileged account assurance | TOTP enrollment before access, replay protection, one-use recovery codes, recent-auth checks; verified resets revoke sessions | HTTP MFA/reset tests and RFC 6238 vector |
| Privacy request identity verification | Two distinct admins, explicit verification case, verified disclosure/erasure, independent legal-hold release, signed receipts | Privacy/hold/restore tests |
| Backup deletion overclaims | Encrypted managed backups with signed expiry manifests; authoritative erasure/hold journal replay before restore; recovery quarantine | Expiry, unsafe-path, restore and journal integrity tests |
| Typed encrypted persistence | AES-GCM context binding, normalized scoped indexes checked against ciphertext, separate signing/index keys, explicit legacy migration | Ciphertext/context/index tamper and migration tests |
| Host directory exposure | Public directory off by default; controller flag plus per-host opt-in; site-managed directory | Public/private and site isolation tests |
| Missing operational package | Nonroot container, TLS proxy Compose package, secrets bootstrap, backups, offline recovery and key rewrap tools | Compose configuration validated; runtime validation still required |

## Local verification, 2026-11-02

- `npm run lint`: passed.
- `npm run build`: passed.
- `npm test`: 20 passed, zero failures/skips. Tests use real HTTP servers, isolated SQLite databases and controlled temporary files.
- `npm run test:browser`: one integrated headless Edge acceptance test passed, covering initial anonymous state, malformed requests, login/MFA, user creation, staff routing, reload, suspension, logout and expiry cleanup.
- `npm audit --omit=dev --audit-level=high`: zero reported production vulnerabilities. This is registry advisory evidence, not a code-security guarantee.
- Docker Compose configuration: passed syntax/interpolation validation. Docker runtime/image/TLS checks were not possible because the local Docker daemon was unavailable; CI includes a runtime-image build.

## Security boundaries and remaining release work

- Both operating modes use the same code. Isolated installations have separate database, keys, journal and backups. Shared mode uses enforced application scopes within one database and one writer process; it is not database-per-tenant isolation or horizontal high availability.
- Production requires privileged MFA. Enterprise SSO/identity-provider integration is not implemented; do not advertise SSO support.
- Encryption protects sensitive record payloads. Operational metadata, membership attributes, indexes and timestamps are not all encrypted. Restrict filesystem access and use encrypted volumes; protect the host and secret store.
- A signed local chain detects modification when keys/checkpoints remain trustworthy. External immutable audit custody and externally retained anchors require operator provisioning. The package does not itself create a WORM storage account.
- Primary erasure and restored-copy enforcement are implemented. Managed snapshots expire on a controller-approved schedule (default seven days, never longer than primary retention). This is not immediate cryptographic destruction of every backup or external copy. External replicas, exports, host snapshots and legal policy need controller-owned procedures.
- The default primary retention is configurable, not a statement of a universal statutory period. Controllers must approve notice wording, purpose, lawful basis, retention, identity verification, hold handling and backup exceptions before collecting real data.
- Docker Compose configuration was validated, but the local Docker daemon was unavailable. The image, live TLS/domain configuration, persistent-volume recovery drill and actual physical gate hardware still need deployment-environment acceptance. Gate API tests do not certify a gate vendor integration.
- Run the CI workflow on GitHub and review its result before release. Local checks alone do not establish the deployed service's security.

See [deploy/OPERATIONS.md](deploy/OPERATIONS.md) for installation and recovery instructions. Earlier foundation notes in `SECURITY_FIXES.md` are historical and superseded where this report differs.
