-- 0001_init.sql — Cycle 1 baseline schema.
-- All five tables ship now even though only sessions + messages are wired
-- in Cycle 1; preferences / shortlists / saved_outfits exist so later cycles
-- don't need migrations.

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  created_at    TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  user_agent    TEXT,
  ip_hash       TEXT,
  view_mode     TEXT NOT NULL DEFAULT 'list',
  summary_blob  TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_updated ON sessions(updated_at);

CREATE TABLE IF NOT EXISTS preferences (
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  key           TEXT NOT NULL,
  value         TEXT NOT NULL,
  source        TEXT NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (session_id, key)
);

CREATE TABLE IF NOT EXISTS messages (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  role          TEXT NOT NULL,
  ordinal       INTEGER NOT NULL,
  blocks_json   TEXT NOT NULL,
  tool_name     TEXT,
  tool_call_id  TEXT,
  created_at    TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_messages_session_ordinal
  ON messages(session_id, ordinal);

CREATE TABLE IF NOT EXISTS shortlists (
  session_id            TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  product_id            TEXT NOT NULL,
  lane                  TEXT NOT NULL,
  product_snapshot_json TEXT NOT NULL,
  added_at              TEXT NOT NULL,
  PRIMARY KEY (session_id, product_id)
);

CREATE TABLE IF NOT EXISTS saved_outfits (
  id                TEXT PRIMARY KEY,
  session_id        TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  anchor_product_id TEXT NOT NULL,
  items_json        TEXT NOT NULL,
  saved_at          TEXT NOT NULL
);
