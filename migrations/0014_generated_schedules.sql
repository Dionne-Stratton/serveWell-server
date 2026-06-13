CREATE TABLE IF NOT EXISTS generated_schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  schedule_template_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
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
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (occurrence_id) REFERENCES generated_schedule_occurrences(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (template_rhythm_requirement_id) REFERENCES schedule_rhythm_requirements(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_generated_schedule_occurrence_requirements_occurrence
  ON generated_schedule_occurrence_requirements (occurrence_id);
