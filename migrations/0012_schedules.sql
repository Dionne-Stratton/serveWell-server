CREATE TABLE IF NOT EXISTS schedules (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL DEFAULT 'recurring'
    CHECK (schedule_type IN ('recurring')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedules_organization
  ON schedules (organization_id, created_at DESC);

CREATE TABLE IF NOT EXISTS schedule_serving_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  serving_area_id INTEGER,
  form_id INTEGER,
  custom_name TEXT,
  display_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE SET NULL,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_schedule_serving_areas_schedule
  ON schedule_serving_areas (schedule_id);

CREATE TABLE IF NOT EXISTS schedule_rhythms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  schedule_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  day_of_week TEXT NOT NULL,
  start_time TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (schedule_id) REFERENCES schedules(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_rhythms_schedule
  ON schedule_rhythms (schedule_id, sort_order);

CREATE TABLE IF NOT EXISTS schedule_rhythm_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  rhythm_id INTEGER NOT NULL,
  schedule_serving_area_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  needed_count INTEGER NOT NULL CHECK (needed_count >= 1),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (rhythm_id) REFERENCES schedule_rhythms(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_serving_area_id) REFERENCES schedule_serving_areas(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_schedule_rhythm_requirements_rhythm
  ON schedule_rhythm_requirements (rhythm_id);
