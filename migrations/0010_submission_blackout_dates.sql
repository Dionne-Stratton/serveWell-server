CREATE TABLE IF NOT EXISTS submission_blackout_dates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  note TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submission_blackout_dates_submission
  ON submission_blackout_dates (submission_id, start_date);
