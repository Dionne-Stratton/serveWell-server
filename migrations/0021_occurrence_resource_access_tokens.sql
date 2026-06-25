CREATE TABLE IF NOT EXISTS generated_occurrence_resource_access_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  resource_id INTEGER NOT NULL,
  submission_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (resource_id) REFERENCES generated_schedule_occurrence_resources(id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_occurrence_resource_access_tokens_hash
  ON generated_occurrence_resource_access_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_occurrence_resource_access_tokens_resource_submission
  ON generated_occurrence_resource_access_tokens (resource_id, submission_id);
