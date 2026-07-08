CREATE TABLE IF NOT EXISTS generated_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  schedule_template_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  published_at TEXT,
  has_unsent_volunteer_updates INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_template_id) REFERENCES schedules(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_generated_schedules_organization
  ON generated_schedules (organization_id, start_date ASC, id ASC);

CREATE TABLE IF NOT EXISTS generated_schedule_occurrences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  generated_schedule_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  template_rhythm_id INTEGER NOT NULL,
  occurrence_date TEXT NOT NULL,
  name TEXT NOT NULL,
  start_time TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (generated_schedule_id) REFERENCES generated_schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (template_rhythm_id) REFERENCES schedule_rhythms(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_generated_schedule_occurrences_schedule
  ON generated_schedule_occurrences (generated_schedule_id, occurrence_date ASC, sort_order ASC);

CREATE TABLE IF NOT EXISTS generated_schedule_occurrence_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurrence_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  display_name TEXT NOT NULL,
  needed_count INTEGER NOT NULL CHECK (needed_count >= 1),
  assigned_count INTEGER NOT NULL DEFAULT 0 CHECK (assigned_count >= 0),
  template_rhythm_requirement_id INTEGER,
  schedule_serving_area_id INTEGER
    REFERENCES schedule_serving_areas(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (occurrence_id) REFERENCES generated_schedule_occurrences(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (template_rhythm_requirement_id) REFERENCES schedule_rhythm_requirements(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_schedule_occurrence_requirements_occurrence
  ON generated_schedule_occurrence_requirements (occurrence_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_generated_occurrence_req_unique_area
  ON generated_schedule_occurrence_requirements (occurrence_id, schedule_serving_area_id)
  WHERE schedule_serving_area_id IS NOT NULL;

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
