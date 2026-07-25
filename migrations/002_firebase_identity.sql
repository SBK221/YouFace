ALTER TABLE users ALTER COLUMN email DROP NOT NULL;
ALTER TABLE users ALTER COLUMN password_hash DROP NOT NULL;
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_email_key;
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_unique
  ON users(email) WHERE email IS NOT NULL;
ALTER TABLE users ADD COLUMN IF NOT EXISTS primary_auth_provider VARCHAR(20);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_primary_auth_provider_check;
ALTER TABLE users ADD CONSTRAINT users_primary_auth_provider_check
  CHECK (primary_auth_provider IS NULL OR primary_auth_provider IN ('phone','google','gmail'));

CREATE TABLE IF NOT EXISTS identity_accounts (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider VARCHAR(20) NOT NULL CHECK (provider IN ('phone','google','gmail')),
  provider_subject VARCHAR(200) NOT NULL,
  email VARCHAR(320),
  phone_e164 VARCHAR(32),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(provider, provider_subject)
);
CREATE INDEX IF NOT EXISTS idx_identity_accounts_user ON identity_accounts(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_identity_phone_unique
  ON identity_accounts(phone_e164) WHERE phone_e164 IS NOT NULL;

CREATE TABLE IF NOT EXISTS app_settings (
  key VARCHAR(120) PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
