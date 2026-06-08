ALTER TABLE volunteer_submissions ADD COLUMN volunteer_self_updated_at TEXT;

CREATE TABLE IF NOT EXISTS volunteer_submission_edit_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_volunteer_edit_tokens_hash
  ON volunteer_submission_edit_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_volunteer_edit_tokens_submission
  ON volunteer_submission_edit_tokens (submission_id);
