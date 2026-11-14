ALTER TABLE users DROP CONSTRAINT IF EXISTS users_primary_auth_provider_check;
ALTER TABLE users ADD CONSTRAINT users_primary_auth_provider_check
  CHECK (primary_auth_provider IS NULL OR primary_auth_provider IN ('phone','google','gmail'));

ALTER TABLE identity_accounts DROP CONSTRAINT IF EXISTS identity_accounts_provider_check;
ALTER TABLE identity_accounts ADD CONSTRAINT identity_accounts_provider_check
  CHECK (provider IN ('phone','google','gmail'));

CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_gmail_unique
  ON identity_accounts(LOWER(email))
  WHERE provider='gmail' AND email IS NOT NULL;
