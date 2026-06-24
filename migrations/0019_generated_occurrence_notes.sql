CREATE TABLE IF NOT EXISTS generated_schedule_occurrence_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  occurrence_id INTEGER NOT NULL,
  schedule_serving_area_id INTEGER,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (occurrence_id) REFERENCES generated_schedule_occurrences(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_serving_area_id) REFERENCES schedule_serving_areas(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_occurrence_notes_occurrence
  ON generated_schedule_occurrence_notes (occurrence_id, created_at ASC);
