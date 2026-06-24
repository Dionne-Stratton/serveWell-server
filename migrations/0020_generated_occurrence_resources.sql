CREATE TABLE IF NOT EXISTS generated_schedule_occurrence_resources (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  occurrence_id INTEGER NOT NULL,
  schedule_serving_area_id INTEGER,
  original_filename TEXT NOT NULL,
  display_name TEXT,
  storage_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (occurrence_id) REFERENCES generated_schedule_occurrences(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_serving_area_id) REFERENCES schedule_serving_areas(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_occurrence_resources_storage_key
  ON generated_schedule_occurrence_resources (storage_key);

CREATE INDEX IF NOT EXISTS idx_generated_occurrence_resources_occurrence
  ON generated_schedule_occurrence_resources (occurrence_id, created_at ASC);
