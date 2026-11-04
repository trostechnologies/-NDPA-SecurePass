CREATE SCHEMA IF NOT EXISTS securepass;
SET LOCAL search_path TO securepass, pg_catalog;
  CREATE TABLE IF NOT EXISTS schema_migrations(version BIGINT PRIMARY KEY,at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS installation(key TEXT PRIMARY KEY,value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS notice_versions(tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,version TEXT NOT NULL,hash TEXT NOT NULL,cipher TEXT NOT NULL,at TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id,version));
  CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,department TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',status TEXT NOT NULL DEFAULT 'active',password_hash TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS memberships(user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,role TEXT NOT NULL CHECK(role IN ('admin','staff')),status TEXT NOT NULL DEFAULT 'active',name TEXT NOT NULL,department TEXT NOT NULL DEFAULT '',title TEXT NOT NULL DEFAULT '',PRIMARY KEY(user_id,tenant_id,site_id));
  CREATE TABLE IF NOT EXISTS sessions(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires_at BIGINT NOT NULL,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,created_at BIGINT NOT NULL,mfa_verified_at BIGINT NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS secure_records(tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,kind TEXT NOT NULL,id TEXT NOT NULL,cipher TEXT NOT NULL,email_hash TEXT,code_hash TEXT,owner_id TEXT,visitor_id TEXT,badge_hash TEXT,host_id TEXT,status TEXT,expires BIGINT,created_at TEXT NOT NULL,PRIMARY KEY(tenant_id,site_id,kind,id));
  CREATE INDEX IF NOT EXISTS idx_records_expiry ON secure_records(expires);
  CREATE INDEX IF NOT EXISTS idx_records_email ON secure_records(tenant_id,site_id,kind,email_hash,status);
  CREATE INDEX IF NOT EXISTS idx_records_code ON secure_records(tenant_id,site_id,kind,code_hash);
  CREATE INDEX IF NOT EXISTS idx_records_owner ON secure_records(tenant_id,site_id,kind,owner_id);
  CREATE INDEX IF NOT EXISTS idx_records_badge ON secure_records(tenant_id,site_id,kind,badge_hash);
  CREATE TABLE IF NOT EXISTS rate_limits(key TEXT PRIMARY KEY,count BIGINT NOT NULL,expires BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS factors(user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,secret_cipher TEXT NOT NULL,last_counter BIGINT NOT NULL DEFAULT -1,recovery_cipher TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS auth_challenges(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,kind TEXT NOT NULL,secret_cipher TEXT,expires BIGINT NOT NULL,attempts BIGINT NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS reset_tokens(token_hash TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,expires BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS public_challenges(token_hash TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,source_hash TEXT NOT NULL,expires BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS idempotency(key_hash TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,fingerprint TEXT NOT NULL,visitor_id TEXT NOT NULL,expires BIGINT NOT NULL);
  CREATE TABLE IF NOT EXISTS legal_holds(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,subject_hash TEXT NOT NULL,case_ref TEXT NOT NULL,created_by TEXT NOT NULL,created_at TEXT NOT NULL,released_at TEXT);
  CREATE INDEX IF NOT EXISTS idx_holds_subject ON legal_holds(tenant_id,site_id,subject_hash,released_at);
  CREATE TABLE IF NOT EXISTS privacy_requests(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,visitor_id TEXT NOT NULL,type TEXT NOT NULL,status TEXT NOT NULL,requested_by TEXT NOT NULL,verified_by TEXT,cipher TEXT NOT NULL,created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS erasures(id TEXT PRIMARY KEY,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,subject_hash TEXT NOT NULL,record_ids TEXT NOT NULL,at TEXT NOT NULL,receipt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_chain(seq BIGINT PRIMARY KEY,at TEXT NOT NULL,tenant_id TEXT NOT NULL,site_id TEXT NOT NULL,actor TEXT NOT NULL,action TEXT NOT NULL,target TEXT NOT NULL,detail TEXT NOT NULL,previous_hash TEXT NOT NULL,mac TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS audit_checkpoint(id BIGINT PRIMARY KEY CHECK(id=1),seq BIGINT NOT NULL,mac TEXT NOT NULL,receipt TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS security_metrics(scope TEXT NOT NULL,event TEXT NOT NULL,count BIGINT NOT NULL,last_at TEXT NOT NULL,PRIMARY KEY(scope,event));
CREATE OR REPLACE FUNCTION securepass.reject_audit_mutation() RETURNS trigger
LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN RAISE EXCEPTION 'Audit rows are append-only'; END $$;
DROP TRIGGER IF EXISTS audit_no_update ON securepass.audit_chain;
DROP TRIGGER IF EXISTS audit_no_delete ON securepass.audit_chain;
CREATE TRIGGER audit_no_update BEFORE UPDATE ON securepass.audit_chain FOR EACH ROW EXECUTE FUNCTION securepass.reject_audit_mutation();
CREATE TRIGGER audit_no_delete BEFORE DELETE ON securepass.audit_chain FOR EACH ROW EXECUTE FUNCTION securepass.reject_audit_mutation();
REVOKE ALL ON SCHEMA securepass FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA securepass FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='anon') THEN
    REVOKE ALL ON SCHEMA securepass FROM anon;
    REVOKE ALL ON ALL TABLES IN SCHEMA securepass FROM anon;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='authenticated') THEN
    REVOKE ALL ON SCHEMA securepass FROM authenticated;
    REVOKE ALL ON ALL TABLES IN SCHEMA securepass FROM authenticated;
  END IF;
END $$;
INSERT INTO securepass.schema_migrations(version,at) VALUES (3, CURRENT_TIMESTAMP::text) ON CONFLICT(version) DO NOTHING;
