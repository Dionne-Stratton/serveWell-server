CREATE TABLE IF NOT EXISTS generated_schedule_occurrence_assignments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  occurrence_id INTEGER NOT NULL,
  requirement_id INTEGER NOT NULL,
  submission_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (occurrence_id) REFERENCES generated_schedule_occurrences(id) ON DELETE CASCADE,
  FOREIGN KEY (requirement_id) REFERENCES generated_schedule_occurrence_requirements(id) ON DELETE CASCADE,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  UNIQUE (requirement_id, submission_id)
);

CREATE INDEX IF NOT EXISTS idx_generated_occurrence_assignments_occurrence
  ON generated_schedule_occurrence_assignments (occurrence_id);

CREATE INDEX IF NOT EXISTS idx_generated_occurrence_assignments_requirement
  ON generated_schedule_occurrence_assignments (requirement_id);
