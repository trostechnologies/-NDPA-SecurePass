# SecurePass

Visitor registration, invitations and site-managed reception workflows with authenticated staff/admin access.

The same application supports **isolated customer/site installations** and a **shared multi-customer, multi-site service**. Shared mode requires explicit site registration and scoped memberships. See [deployment and operations](deploy/OPERATIONS.md).

For local development with fabricated data, use Node.js 24, run `npm ci`, copy `.env.example` to `.env`, replace the initial password, then run `npm run build` and `npm start`. Enroll privileged-user MFA on first sign-in. For Vite development run `npm run dev` and `npm run dev:server` in separate terminals.

Validation commands:

```sh
npm run lint
npm run build
npm test
npm run test:browser
npm audit --omit=dev --audit-level=high
```

The browser test uses isolated headless Edge on Windows or Playwright Chromium on Linux (`npx playwright install --with-deps chromium`).

Read [the re-audit implementation report](REAUDIT_IMPLEMENTATION.md) for coverage and remaining deployment acceptance work. Photo/ID collection and SSO are not available. A visitor QR requires online site-device verification and explicit authorization when gate access is enabled. This software does not certify legal compliance or the security of a deployment.

The follow-up [database audit](DATABASE_AUDIT.md) documents restore/retention fixes, backup format compatibility and the planned VPS deployment boundary.
