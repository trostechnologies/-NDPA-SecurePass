> Historical foundation report. Current implementation and verification: [REAUDIT_IMPLEMENTATION.md](REAUDIT_IMPLEMENTATION.md). Deployment instructions: [deploy/OPERATIONS.md](deploy/OPERATIONS.md).

# Security remediation — 1 November 2026

This source package addresses the ten findings in the accompanying SECURITY_AUDIT.md. It has not been deployed. The repository version is prepared on the security/audit-remediation branch.

## Changes

| Audit finding | Remediation |
| --- | --- |
| H1: passes before persistence | Both flows await the saved server record, prevent duplicate clicks, show request failures and preserve entered details. |
| H2: throttle bypass | One normalized email identity; SQLite-backed account, source and installation windows with expiry. Limits survive restart on the same database. |
| H3: resource exhaustion | Public issuance/lookup/request limits, 16 KB JSON bodies, record/user/log limits, paginated data queries, indexed expiry and asynchronous scrypt. |
| H4: invitation lifecycle | Selected-field schema, unknown-field rejection, expiry, linked visitor erasure and an authorized invitation erasure endpoint. |
| M1: staff ownership | Persisted host relation keyed by user ID; matching display names convey no authority. Account creation/update provisions the linked directory entry. |
| M2: redemption | Rate-limited minimal lookup and transactional, single-use check-in with matching guest email, host and visit date. Quick-check-in carries its code. |
| M3: CSV injection | Every cell passes through one formula-neutralizing and quote-escaping serializer. |
| M4: QR personal data | Mobile and badge modal share an opaque-reference serializer; stale QR images are cleared. |
| M5: unsupported assertions | Operational exports and active UI copy no longer claim cryptographic erasure, immutable logs or compliance certification. Controller information comes from server configuration. |
| M6: acknowledgement evidence | Checkbox defaults off, notices are versioned and displayed, backend rejects stale versions, and photo/ID collection is disabled. |

## Development setup

Use Node 22.13 or newer. Copy .env.example to .env and set a unique initial admin email/password. The npm server scripts read .env. Never commit real credentials.

```
npm install
npm test
npm run lint
npm run build
```

Run `npm run dev:server` and `npm run dev` in separate terminals. Open http://localhost:3000. The configured Origin must match the browser origin exactly. Use HTTPS and Secure cookies in production. Production startup also requires controller, facility, privacy contact and notice configuration. One installation remains for one customer.

Dependency installation completed on 2 November 2026. The esbuild development dependency was updated to ^0.28.2 to satisfy Vite 8 peer requirements. package-lock.json replaces the stale Bun lockfile; use npm ci for reproducible installation. Dependencies were installed with --ignore-scripts.

## Validation completed

Seven tests passed on Node 24.15.0, with no skipped tests:

- Authentication and role guards, Origin rejection, cookie attributes, host ownership, unknown invitation fields, redemption, reuse prevention, linked erasure and suspension revocation.
- Whitespace/case normalization and throttling after reopening the SQLite database.
- Public issuance limits, capacity, expiry, bounded logs and bounded data pages.
- CSV formula escaping and QR privacy.
- Kiosk failed/pending/successful persistence sequencing and duplicate-click protection.
- Mobile failed/pending/successful persistence sequencing and server-issued QR content.
- A real Express HTTP server: unauthenticated requests, Origin rejection, malformed and oversized JSON, login cookie attributes, persisted check-in and logout revocation.

TypeScript type checking (`npm run lint`), the Vite production build (`npm run build`), server syntax validation and all seven tests passed. The production build transforms 1,704 modules. The HTTP test required execution outside the restricted sandbox so its parent process could reach the local child server.

Handler tests execute actual middleware and SQL with synthetic data in temporary SQLite databases, replacing only Express transport/parser and the listening socket. The additional HTTP test uses a real Express process. UI tests use a deterministic hook/event harness and the installed esbuild transformer. These are not React/browser E2E tests. Browser E2E, dependency-vulnerability assessment, penetration testing and deployment verification remain outstanding; this is not a production certification.

## Upgrade and operating notes

- Back up an existing installation before upgrading. Startup removes unsupported extra fields from legacy invitations and invalidates invitations without an owner or a modern 32-hex-character code. Reissue those invitations. Backups/exported copies still need their own deletion policy.
- Legacy staff users gain their own host entries keyed by user ID. Legacy host IDs are not automatically matched by display name. Existing modern invitations are not reassigned by guessing ownership.
- Development retains sample hosts. Production removes unlinked sample hosts and builds the directory from active users. Configure real account names/departments before inviting guests.
- Invitation dates use Africa/Lagos. Invitations expire at the end of their scheduled visit date, which must be within the configured retention window. Check-in requires that date to be today and the submitted email to match the invitation. The invitation code is a bearer reference, not strong identity verification.
- Erasing a visitor removes linked invitations and other invitations for the same normalized email. Review the subject's scope before using this action. Invitation-only deletion is available at POST /api/invitations/:id/erase to the owner or an administrator.
- Visitor retention defaults to 60 days and is configurable. This is an application policy setting, not a claim about a universal legal requirement. Purge runs every minute and uses the expiry index.
- Capacity defaults to 10,000 combined invitation/visitor records and 1,000 users. New writes fail at capacity. Audit storage defaults to the latest 50,000 entries, with oldest entries removed; send security logs to an independently protected external system before using this operational log in production. Limits may be lowered in environment configuration.
- Per source: 180 API requests/minute, 30 login requests/15 minutes, 10 public check-ins/minute and 10 invitation lookups/minute. Per account: 10 logins/15 minutes. Installation-wide: 1,000 API requests/minute, 150 logins/15 minutes and 100 public check-ins/hour. Shared-office IPs may need a reviewed limiter policy. Persisting limits does not make this a multi-host distributed service.
- /api/data uses 500-row pages with an offset; the current UI accumulates those bounded pages so the muster and exports are not silently limited to one page.
- QR references do not authorize physical access. Gate/scanner verification, SSO/MFA, email delivery, legal holds, backup erasure, encrypted storage, immutable external logging, load testing and deployment controls remain separate work.
