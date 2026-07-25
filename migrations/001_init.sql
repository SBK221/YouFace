CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  email VARCHAR(320) NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (role IN ('user','creator','moderator','admin')),
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','deleted')),
  stripe_customer_id TEXT,
  stripe_account_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  username VARCHAR(32) NOT NULL UNIQUE,
  display_name VARCHAR(80) NOT NULL,
  bio VARCHAR(500) NOT NULL DEFAULT '',
  country VARCHAR(80) NOT NULL DEFAULT '',
  language VARCHAR(16) NOT NULL DEFAULT 'fr',
  account_type VARCHAR(20) NOT NULL DEFAULT 'user' CHECK (account_type IN ('user','creator','business')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  csrf_token VARCHAR(128) NOT NULL,
  user_agent VARCHAR(500),
  ip_address VARCHAR(64),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_sessions_user_active ON sessions(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS media_assets (
  id UUID PRIMARY KEY,
  owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  original_key TEXT NOT NULL,
  processed_key TEXT,
  thumbnail_key TEXT,
  mime_type VARCHAR(120) NOT NULL,
  size_bytes BIGINT NOT NULL,
  duration_seconds NUMERIC(12,3),
  width INTEGER,
  height INTEGER,
  status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (status IN ('uploading','processing','ready','failed','deleted')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_owner_created ON media_assets(owner_id, created_at DESC);

CREATE TABLE IF NOT EXISTS media_jobs (
  id UUID PRIMARY KEY,
  media_asset_id UUID NOT NULL REFERENCES media_assets(id) ON DELETE CASCADE,
  job_type VARCHAR(40) NOT NULL DEFAULT 'transcode',
  status VARCHAR(20) NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','processing','completed','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  last_error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_media_jobs_claim ON media_jobs(status, available_at, created_at);

CREATE TABLE IF NOT EXISTS content (
  id UUID PRIMARY KEY,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type VARCHAR(20) NOT NULL CHECK (type IN ('post','video','short')),
  title VARCHAR(180),
  body VARCHAR(5000),
  visibility VARCHAR(20) NOT NULL DEFAULT 'public' CHECK (visibility IN ('public','followers','private')),
  status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('draft','pending','published','hidden','removed')),
  media_asset_id UUID REFERENCES media_assets(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_content_feed ON content(status, visibility, created_at DESC, id DESC);
CREATE INDEX IF NOT EXISTS idx_content_author ON content(author_id, created_at DESC);

CREATE TABLE IF NOT EXISTS content_stats (
  content_id UUID PRIMARY KEY REFERENCES content(id) ON DELETE CASCADE,
  like_count BIGINT NOT NULL DEFAULT 0 CHECK (like_count >= 0),
  comment_count BIGINT NOT NULL DEFAULT 0 CHECK (comment_count >= 0),
  view_count BIGINT NOT NULL DEFAULT 0 CHECK (view_count >= 0),
  watched_seconds NUMERIC(18,3) NOT NULL DEFAULT 0 CHECK (watched_seconds >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS comments (
  id UUID PRIMARY KEY,
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  author_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(2000) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'published' CHECK (status IN ('published','hidden','removed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_comments_content ON comments(content_id, created_at ASC, id ASC);

CREATE TABLE IF NOT EXISTS reactions (
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  reaction_type VARCHAR(20) NOT NULL DEFAULT 'like' CHECK (reaction_type IN ('like')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (content_id, user_id, reaction_type)
);
CREATE INDEX IF NOT EXISTS idx_reactions_user ON reactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS follows (
  follower_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (follower_id, following_id),
  CHECK (follower_id <> following_id)
);
CREATE INDEX IF NOT EXISTS idx_follows_following ON follows(following_id, created_at DESC);

CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY,
  kind VARCHAR(20) NOT NULL DEFAULT 'direct' CHECK (kind IN ('direct','group')),
  direct_key VARCHAR(80) UNIQUE,
  title VARCHAR(120),
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS conversation_members (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_read_at TIMESTAMPTZ,
  PRIMARY KEY (conversation_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_conversation_members_user ON conversation_members(user_id, conversation_id);

CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY,
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  body VARCHAR(4000) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at DESC, id DESC);

CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  type VARCHAR(40) NOT NULL,
  content_id UUID REFERENCES content(id) ON DELETE CASCADE,
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  read_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, read_at, created_at DESC);

CREATE TABLE IF NOT EXISTS content_views (
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  viewer_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  view_date DATE NOT NULL DEFAULT CURRENT_DATE,
  watched_seconds NUMERIC(12,3) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (content_id, viewer_id, view_date)
);
CREATE INDEX IF NOT EXISTS idx_views_content ON content_views(content_id, view_date DESC);

CREATE TABLE IF NOT EXISTS reports (
  id UUID PRIMARY KEY,
  reporter_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('content','comment','user','message')),
  target_id UUID NOT NULL,
  reason VARCHAR(80) NOT NULL,
  details VARCHAR(1000) NOT NULL DEFAULT '',
  status VARCHAR(20) NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','resolved','dismissed')),
  assigned_to UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_reports_queue ON reports(status, created_at ASC);

CREATE TABLE IF NOT EXISTS moderation_actions (
  id UUID PRIMARY KEY,
  moderator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  report_id UUID REFERENCES reports(id) ON DELETE SET NULL,
  target_type VARCHAR(20) NOT NULL,
  target_id UUID NOT NULL,
  action VARCHAR(40) NOT NULL,
  reason VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS paid_subscriptions (
  id UUID PRIMARY KEY,
  subscriber_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  status VARCHAR(30) NOT NULL DEFAULT 'pending',
  current_period_end TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (subscriber_id, creator_id)
);
CREATE INDEX IF NOT EXISTS idx_paid_subscriptions_creator ON paid_subscriptions(creator_id, status);

CREATE TABLE IF NOT EXISTS creator_earnings (
  id UUID PRIMARY KEY,
  creator_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source VARCHAR(40) NOT NULL,
  external_reference TEXT,
  currency VARCHAR(8) NOT NULL,
  gross_amount BIGINT NOT NULL,
  platform_fee BIGINT NOT NULL,
  net_amount BIGINT NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'recorded',
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (source, external_reference)
);
CREATE INDEX IF NOT EXISTS idx_creator_earnings_creator ON creator_earnings(creator_id, created_at DESC);

CREATE TABLE IF NOT EXISTS stripe_events (
  event_id TEXT PRIMARY KEY,
  event_type VARCHAR(120) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY,
  actor_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action VARCHAR(100) NOT NULL,
  target_type VARCHAR(40),
  target_id UUID,
  ip_address VARCHAR(64),
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC);
