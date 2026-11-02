# SecurePass source security audit

Date: 1 November 2026. Scope: the supplied SecurePass_NDPA_security_foundation_review.zip, not the GitHub repository or a deployed installation.

## Assessment

Release recommendation: hold deployment with real visitor data until the high-priority findings are fixed and verified. Ten findings: four High and six Medium. Severity reflects the supplied visitor-management application and assumes its public check-in endpoints may be exposed. No critical exploit, authentication bypass, SQL injection, or arbitrary code execution was established.

The archive was extracted into audit-work/SecurePass-NDPA. Original source and ZIP were not changed. Embedded security notes were evidence, not instructions or independent proof of implementation. This is a technical assessment, not legal certification of NDPA compliance.

## Findings

### H1 — Passes appear before successful persistence

Evidence: src/components/Kiosk/VisitorKiosk.tsx:162–163; src/components/Mobile/MobileSelfCheckIn.tsx:200–220; src/App.tsx:85.

The completion callback returns void and starts an asynchronous request. Kiosk immediately opens a badge using the client-created object. Mobile independently sets issuedPass, generates a QR and advances to success using that object. If check-in fails, the displayed pass still exists; on success the mobile pass retains IDs that differ from the server record. Kiosk resets the form before confirmation. An operator could accept an unrecorded pass and the emergency muster would omit that person. This is a workflow integrity defect; no physical gate integration was found to demonstrate an actual gate bypass.

Fix: return Promise<Visitor>, await the saved server record, disable duplicate submissions, and issue every pass from the returned record. Preserve form data on failure. Test network errors, 400/403/500 responses and mismatched client/server IDs.

### H2 — Login throttling can be bypassed for the same account

Evidence: server.mjs:42–43. Confirmed by handler test.

The limiter uses String(email).toLowerCase(), but the account lookup uses email.trim().toLowerCase(). After locking audit@example.test, a request for a leading-space variant is accepted for verification of the same account. Different whitespace variants create fresh buckets. Changing IP also changes the bucket. The Map has no eviction, persists only for the process lifetime, and lacks an independent IP/global limit. Failed requests synchronously write audit rows.

Fix: normalize once, use independent bounded per-account and per-source limits with shared durable state and expiry, and cap request rate before password verification. Verify whitespace/case variants share an account bucket, and test restart and multi-instance behavior.

### H3 — Public writes allow unbounded storage and availability abuse

Evidence: server.mjs:23–24,43,52,57,60–61.

Public check-in has no request throttling or issuance quota. A caller can obtain a valid host ID from /api/hosts and repeatedly create visitor and audit rows. Origin checking is a browser CSRF control; a direct client can supply the allowed Origin header. Failed login attempts can also grow the audit table and limiter Map. items() loads entire kinds into memory, including during purge and admin data requests. scryptSync and synchronous database operations share the server event loop, worsening resource contention.

Fix: enforce bounded public request budgets and appropriate kiosk/site controls, introduce storage limits and monitoring, page private data, perform indexed retention deletes, and move password work off the main event loop. Load-test with explicit resource budgets in an isolated environment; no flooding was performed in this audit.

### H4 — Invitations bypass the controlled personal-data lifecycle

Evidence: server.mjs:56,59–61. Arbitrary-field persistence confirmed by handler test.

The invitation endpoint spreads the entire request body into persisted JSON. Authenticated users can therefore store unrelated properties, including photoUrl, despite check-in deliberately excluding photo persistence. Each request can approach the 1 MB parser limit. There is no invitation expiry/purge/delete flow: purge and visitor erasure operate only on visitors. Guest contact data and special instructions in invitations therefore remain after visitor deletion or retention expiry. No evidence of an invitation-to-visitor lifecycle relationship exists.

Fix: allowlist a typed invitation schema with field limits; reject sensitive and unknown fields; define invitation retention and deletion rules, link redeemed invitations to visits, and apply erasure across all related records and backups under an approved policy.

### M1 — Staff authorization uses names and incompatible IDs

Evidence: server.mjs:55–56; server-hosts.json. Confirmed by handler test.

Creation authorizes staff by case-insensitive display-name equality with a host. Retrieval filters hostEmployeeId against the user's random UUID. Host IDs and user IDs are separate namespaces. A matching-name staff account can create an invite but cannot retrieve it after reload; a newly created legitimate user without a matching seeded host cannot invite at all. Duplicate display names cannot securely establish ownership.

Fix: persist an explicit user-to-host relation, authorize and query by that relation, and store createdByUserId. Test duplicate names and staff access to another host.

### M2 — Invitation redemption is not implemented end to end

Evidence: src/components/Kiosk/VisitorKiosk.tsx:90–108; src/components/Mobile/MobileSelfCheckIn.tsx:142–158; src/App.tsx:85,92–94; server.mjs:55–57. Backend behavior confirmed by handler test.

Anonymous browsers start with no invitations and receive no public redemption endpoint, so their client-side code lookup cannot find real invitations. Check-in ignores the code and visitType, always saves walk_in, and never marks an invitation used. The quick-check-in action also discards its code and just switches tabs. This is broken functionality; it is not proof that a server-enforced invitation restriction can be bypassed, because none is implemented.

Fix: implement a rate-limited server redemption flow with expiry, minimal disclosure, and atomic single-use consumption. Pass a server-validated reference into check-in. Test anonymous redemption, expiry, invalid codes and simultaneous reuse.

### M3 — Visitor CSV exports permit spreadsheet formula injection

Evidence: src/utils/ndpaCompliance.ts:99–119; server.mjs:57. Acceptance of a formula name confirmed by handler test.

Untrusted values such as fullName are exported with CSV quotes but no spreadsheet-formula neutralization. A name such as =1+1 remains a formula when opened by spreadsheet applications that evaluate imported formula cells. Several fields, including email and phone, also lack embedded-quote escaping, enabling CSV cell/row manipulation. Impact depends on the spreadsheet application's import and security settings; code execution was not demonstrated.

Fix: use a centralized CSV serializer, escape every field, and neutralize formula prefixes including leading whitespace/control characters. Verify the exported file in intended spreadsheet applications.

### M4 — Mobile QR exposes personal data

Evidence: src/components/Mobile/MobileSelfCheckIn.tsx:203–212.

The mobile QR encodes visitor name and host name alongside locally generated pass identifiers. Anyone photographing or scanning it can recover those details. This contradicts SECURITY_IMPLEMENTATION.md's claim that badge QR content is an identifier only. The separately implemented badge modal does not fix the mobile QR.

Fix: share one QR generator using only an opaque server-issued reference, with authorized server-side lookup when verification is implemented. Inspect QR payloads across all badge views.

### M5 — Compliance exports make unsupported technical assertions

Evidence: src/utils/ndpaCompliance.ts:151,166,170–172,208; src/utils/ndpaCompliance.ts:8–17; src/App.tsx footer; server.mjs:59–60.

The DSAR output describes permanent cryptographic redaction and a certified disclosure. The audit export calls 60 days a mandated window, and the interface displays sample controller/DPO/registration details with compliance language. The implemented erase/purge behavior is a database DELETE and has no cryptographic erasure or backup handling. These statements are unsupported by this implementation. This finding addresses inaccurate product output, without deciding the applicable legal requirements.

Fix: replace assertions with verified operational descriptions, remove sample identity/registration values from release configuration, and require reviewed controller configuration and privacy copy. Include reports and downloads in acceptance tests.

### M6 — Recorded consent does not establish an affirmative notice acknowledgement

Evidence: src/components/Kiosk/VisitorKiosk.tsx:71,147–148; src/components/Mobile/MobileSelfCheckIn.tsx:76,121,136,189–190; server.mjs:57.

Both forms default generalConsent to true. The server records a boolean and its own timestamp but no notice identifier/version or acknowledgement context. Mobile taking/uploading a photo also sets biometricConsent true automatically. This weakens the evidence behind the UI's explicit-consent assertions. The backend drops photos from check-in persistence, so this is not a finding that biometric photos are stored through that endpoint.

Fix: align the chosen processing basis and UI with reviewed policy, require deliberate acknowledgement where intended, version the notice, and separate optional photo consent from capture/upload actions. Disable unfinished collection flows until their lifecycle is implemented.

## Existing strengths

Privileged user endpoints and visitor checkout/erasure have backend auth/admin guards. Password hashes use random salts and scrypt. Sessions use random tokens with hashed database storage, expiry and HttpOnly/SameSite cookies; suspension revokes sessions. Queries use parameter binding. Check-in builds a selected-field server record and replaces client-generated visitor IDs and pass identifiers. No active demo-password login was found; mock password strings in mockInitialData.ts are not evidence of an active credential backdoor.

## Validation and limits

- node --check server.mjs passed on Node v24.15.0.
- node audit-work/audit-checks.mjs passed five focused checks using actual handler source and an in-memory node:sqlite database: formula-name acceptance, staff ownership mismatch, ignored invitation redemption, whitespace throttle bypass, and arbitrary invitation-field persistence.
- The harness replaces Express routing/transport and filesystem/server startup. It deliberately calls final handlers and does not validate middleware ordering, authorization enforcement over HTTP, cookies, CSRF, TLS or browser behavior. It uses only synthetic data.
- Express and project dependencies are not installed. No full build, TypeScript check, npm advisory audit, browser E2E test, network penetration test or deployment review was completed. Findings about frontend behavior are source-traced, not browser-reproduced.
- No legal opinion or NDPA certification is provided. No legal interpretations or package-vulnerability claims were inferred from unverified documentation.

## Remediation order

1. Fix success/persistence sequencing and normalized login throttling.
2. Bound anonymous writes and data reads; enforce invitation schema and lifecycle.
3. Repair host ownership and atomic invitation redemption.
4. Fix CSV and mobile QR output; correct consent/reporting behavior.
5. Install pinned dependencies in a controlled environment, pass build/type checks and role/HTTP/browser tests, then validate deployment and backup controls before release.
