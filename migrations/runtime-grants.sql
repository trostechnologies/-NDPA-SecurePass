GRANT USAGE ON SCHEMA securepass TO securepass_runtime;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA securepass TO securepass_runtime;
REVOKE UPDATE,DELETE ON securepass.audit_chain FROM securepass_runtime;
REVOKE INSERT,UPDATE,DELETE ON securepass.schema_migrations,securepass.audit_checkpoint FROM securepass_runtime;
