ALTER TABLE generated_schedules
  ADD COLUMN has_unsent_volunteer_updates INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS generated_schedule_pending_volunteer_updates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  generated_schedule_id INTEGER NOT NULL,
  submission_id INTEGER NOT NULL,
  payload TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (generated_schedule_id) REFERENCES generated_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_gs_pending_volunteer_updates_schedule
  ON generated_schedule_pending_volunteer_updates (generated_schedule_id, submission_id);
