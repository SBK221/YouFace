CREATE TABLE IF NOT EXISTS wallet_balances (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  credits BIGINT NOT NULL DEFAULT 0 CHECK (credits >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS credit_ledger (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  direction VARCHAR(10) NOT NULL CHECK (direction IN ('credit','debit')),
  credits BIGINT NOT NULL CHECK (credits > 0),
  source VARCHAR(50) NOT NULL,
  external_reference TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(source, external_reference)
);
CREATE INDEX IF NOT EXISTS idx_credit_ledger_user_created ON credit_ledger(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS creator_tips (
  id UUID PRIMARY KEY,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credits BIGINT NOT NULL CHECK (credits > 0),
  creator_credits BIGINT NOT NULL CHECK (creator_credits >= 0),
  platform_fee_credits BIGINT NOT NULL CHECK (platform_fee_credits >= 0),
  status VARCHAR(20) NOT NULL DEFAULT 'recorded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (sender_id <> creator_id)
);
CREATE INDEX IF NOT EXISTS idx_creator_tips_creator_created ON creator_tips(creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS store_events (
  event_id TEXT PRIMARY KEY,
  provider VARCHAR(30) NOT NULL,
  event_type VARCHAR(120) NOT NULL,
  body_hash CHAR(64) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS platform_entitlements (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  entitlement VARCHAR(100) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'inactive',
  expires_at TIMESTAMPTZ,
  source VARCHAR(30) NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(user_id, entitlement)
);
