# SecurePass

Visitor reception, invitations and scoped staff/admin workflows. The backend now uses **Supabase PostgreSQL**, with no SQLite runtime fallback.

Deploy the application on the VPS behind Nginx at `securepass.trostechnologies.com`, with the database in Supabase project `tyfpwyulwoufimjtfjtv`. Use the [VPS + Supabase guide](deploy/VPS_SUPABASE.md) for the native systemd installation; Docker is not required. Host/user/project values are environment configuration. Database passwords and encryption keys stay on the backend.

Both isolated customer/site installations and shared customer/site hosting are supported. An isolated installation needs its own PostgreSQL database/project, registry and keys. Shared hosting enforces customer/site authorization in the API. Private PostgreSQL tables are not exposed directly to the browser. The existing application authentication/MFA remains; Supabase Auth and automatic email delivery are not implemented by this database switch.

The schema is installed explicitly through `ops/database.mjs`. Normal application startup never creates a database or falls back to SQLite. Provision a restricted runtime role separately from administrative migration/restore credentials. See [migration notes](SUPABASE_MIGRATION.md).

Validation:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm run lint
npm run build
npm test
npm run test:browser
npm audit --omit=dev --audit-level=high
```

Database/HTTP tests use disposable PostgreSQL (PGlite/WASM), not your live Supabase project. The browser acceptance test uses isolated headless Edge on Windows or Playwright Chromium on Linux. Live pooler connectivity, TLS, roles and recovery must also be checked on the VPS. Historical SQLite/Docker reports retain their original context and are superseded by the Supabase migration and deployment guide.
