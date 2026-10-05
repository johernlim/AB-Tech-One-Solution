CREATE TABLE IF NOT EXISTS staff_users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  salt TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS staff_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES staff_users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS staff_sessions_expiry ON staff_sessions(expires_at);
CREATE TABLE IF NOT EXISTS staff_attempts (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS category_order (
  id INTEGER PRIMARY KEY CHECK(id=1),
  order_json TEXT NOT NULL,
  version INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS product_id_aliases (
  category_slug TEXT NOT NULL,
  old_id TEXT NOT NULL,
  new_id TEXT NOT NULL,
  category_names TEXT NOT NULL,
  state TEXT NOT NULL CHECK(state IN ('pending','active')),
  PRIMARY KEY(category_slug,old_id)
);
CREATE INDEX IF NOT EXISTS product_id_alias_lookup ON product_id_aliases(old_id,state);
