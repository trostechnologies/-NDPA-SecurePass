> Historical SQLite-era report/instructions. The current database is Supabase PostgreSQL. Use [the Supabase VPS guide](deploy/VPS_SUPABASE.md) and [migration notes](SUPABASE_MIGRATION.md).

# Security implementation status

SecurePass supports both separate customer/site installations and a shared customer/site service with scoped authorization.

See [REAUDIT_IMPLEMENTATION.md](REAUDIT_IMPLEMENTATION.md) for finding coverage, verification and remaining deployment acceptance work, and [deploy/OPERATIONS.md](deploy/OPERATIONS.md) for installation, secrets, migration, recovery and audit custody.

The implementation does not certify legal compliance or a deployed environment. Live container/TLS acceptance, external immutable custody and actual gate hardware integration remain deployment responsibilities.
