-- EdgeMarket PostgreSQL schema (auto-run by Spring Boot on startup)

CREATE TABLE IF NOT EXISTS follows (
  id             SERIAL PRIMARY KEY,
  user_address   TEXT NOT NULL,
  target_address TEXT NOT NULL,
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_address, target_address)
);

CREATE INDEX IF NOT EXISTS idx_follows_user ON follows (user_address);

CREATE TABLE IF NOT EXISTS push_tokens (
  id           SERIAL PRIMARY KEY,
  user_address TEXT NOT NULL UNIQUE,
  push_token   TEXT NOT NULL,
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS seen_trades (
  id                  SERIAL PRIMARY KEY,
  user_address        TEXT NOT NULL,
  target_address      TEXT NOT NULL,
  last_seen_timestamp BIGINT NOT NULL DEFAULT 0,
  UNIQUE(user_address, target_address)
);

CREATE INDEX IF NOT EXISTS idx_seen_trades_user ON seen_trades (user_address);

CREATE TABLE IF NOT EXISTS auth_nonces (
  id             SERIAL PRIMARY KEY,
  wallet_address TEXT        NOT NULL,
  nonce          TEXT        NOT NULL UNIQUE,
  expires_at     TIMESTAMPTZ NOT NULL,
  used           BOOLEAN     NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_auth_nonces_address
  ON auth_nonces (wallet_address, used, expires_at);

CREATE TABLE IF NOT EXISTS paper_trades (
  id             SERIAL PRIMARY KEY,
  user_address   TEXT        NOT NULL,
  target_address TEXT        NOT NULL,
  market_id      TEXT        NOT NULL,
  entry_price    NUMERIC     NOT NULL CHECK (entry_price > 0),
  shares         NUMERIC     NOT NULL CHECK (shares > 0),
  market_title   TEXT,
  outcome        TEXT,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_address, target_address, market_id)
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_user
  ON paper_trades (user_address);

CREATE TABLE IF NOT EXISTS users (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  email            TEXT        NOT NULL UNIQUE,
  password_hash    TEXT        NOT NULL,
  display_name     TEXT,
  wallet_address   TEXT,
  email_verified   BOOLEAN     NOT NULL DEFAULT FALSE,
  login_count      INTEGER     NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Idempotent migrations: add columns that may be missing from older deployments
ALTER TABLE users ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN IF NOT EXISTS wallet_address TEXT;

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TABLE IF NOT EXISTS email_verification_codes (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  code         VARCHAR(6)  NOT NULL,
  expires_at   TIMESTAMPTZ NOT NULL,
  consumed_at  TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Paper trade end dates (idempotent)
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS end_date TIMESTAMPTZ;

-- Copy-trade settlement tracking (idempotent migration)
-- notified_closed: flips to TRUE once a "trade closed" push notification has
--   been sent for this position, so the watcher never double-notifies.
-- closed_price:    the resolved outcome price (1.0 win / 0.0 loss) at settlement.
-- realized_pnl:    (closed_price - entry_price) * shares, frozen at settlement time.
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS notified_closed BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS closed_price NUMERIC;
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS realized_pnl NUMERIC;
ALTER TABLE paper_trades ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_paper_trades_unnotified
  ON paper_trades (notified_closed) WHERE notified_closed = FALSE;

CREATE INDEX IF NOT EXISTS idx_evc_user_id
  ON email_verification_codes (user_id, consumed_at, expires_at);

-- Premium subscription columns (idempotent migrations)
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier TEXT NOT NULL DEFAULT 'basic' CHECK (subscription_tier IN ('basic','premium'));
ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;
-- Paystack subscription columns (replacing Stripe — idempotent migrations)
ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_customer_code TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS paystack_subscription_code TEXT;
