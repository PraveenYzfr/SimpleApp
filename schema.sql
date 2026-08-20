-- SimpleApp D1 schema (Cloudflare Workers)

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('viewer', 'editor', 'admin')),
  disabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Seed managed users (demo data)
INSERT OR IGNORE INTO users (id, name, email, role, created_at, updated_at) VALUES
  ('1', 'Alice Johnson', 'alice@example.com', 'admin', datetime('now'), datetime('now')),
  ('2', 'Bob Smith', 'bob@example.com', 'user', datetime('now'), datetime('now')),
  ('3', 'Carol Lee', 'carol@example.com', 'user', datetime('now'), datetime('now'));
