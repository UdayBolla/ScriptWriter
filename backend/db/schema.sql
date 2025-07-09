-- Connect to your database
-- Example for psql: \c "ScriptsDB"
-- Make sure you are connected to the correct database before running.

/* ========== 1. Drop existing tables if they exist (for a fresh start) ========== */
DROP TABLE IF EXISTS screenplays;
DROP TABLE IF EXISTS users;

/* ========== 2. Tables ========== */
CREATE TABLE IF NOT EXISTS users (
  id              SERIAL PRIMARY KEY,
  username        TEXT UNIQUE NOT NULL,
  password_hash   TEXT NOT NULL,
  created_at      TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS screenplays (
  id            SERIAL PRIMARY KEY,
  user_id       INTEGER NOT NULL
                REFERENCES users(id) ON DELETE CASCADE,
  title         TEXT NOT NULL,
  content       TEXT NOT NULL DEFAULT '', -- Changed from JSONB to TEXT, default to empty string
  created_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
  updated_at    TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

/* ========== 3. Trigger to keep updated_at fresh ========== */
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_screenplays_updated_at ON screenplays;
CREATE TRIGGER trg_screenplays_updated_at
BEFORE UPDATE ON screenplays
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

/* ========== 4. Helpful indices ========== */
CREATE INDEX IF NOT EXISTS idx_screenplays_user_id      ON screenplays(user_id);
CREATE INDEX IF NOT EXISTS idx_screenplays_updated_at  ON screenplays(updated_at);