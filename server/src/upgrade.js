import { pool } from './db.js'
import { hashPassword } from './auth.js'

const SEED_PASSWORD = 'tracker'

export async function upgrade() {
  await pool.query(`
    ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS issue_assignees (
      issue_id INTEGER NOT NULL REFERENCES issues(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      PRIMARY KEY (issue_id, user_id)
    );

    INSERT INTO issue_assignees (issue_id, user_id)
    SELECT id, assignee_id FROM issues WHERE assignee_id IS NOT NULL
    ON CONFLICT DO NOTHING;

    UPDATE projects SET key = 'TASK', name = 'Наш трекер' WHERE key = 'RKS';
  `)

  const missing = await pool.query('SELECT id FROM users WHERE password_hash IS NULL')
  if (missing.rows.length) {
    const hash = hashPassword(SEED_PASSWORD)
    await pool.query('UPDATE users SET password_hash = $1 WHERE password_hash IS NULL', [hash])
  }
}
