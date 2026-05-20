CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS serving_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  public_note TEXT,
  requires_background_check INTEGER NOT NULL DEFAULT 0,
  requires_training INTEGER NOT NULL DEFAULT 0,
  requires_audition_or_interview INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS serving_area_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  serving_area_id INTEGER NOT NULL,
  requirement_type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  day_of_week TEXT,
  start_time TEXT,
  end_time TEXT,
  is_mandatory INTEGER NOT NULL DEFAULT 0,
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS volunteer_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  preferred_contact_method TEXT NOT NULL,
  overall_frequency TEXT NOT NULL,
  general_availability_notes TEXT,
  open_to_special_events INTEGER NOT NULL DEFAULT 0,
  experience_notes TEXT,
  additional_notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (email IS NOT NULL OR phone IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS volunteer_interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  serving_area_id INTEGER NOT NULL,
  uses_area_specific_frequency INTEGER NOT NULL DEFAULT 0,
  area_specific_frequency TEXT,
  interest_notes TEXT,
  experience_level TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS volunteer_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  availability_key TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS volunteer_requirement_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  serving_area_id INTEGER NOT NULL,
  requirement_id INTEGER NOT NULL,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE RESTRICT,
  FOREIGN KEY (requirement_id) REFERENCES serving_area_requirements(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  submission_id INTEGER NOT NULL,
  admin_user_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_serving_areas_active_sort
  ON serving_areas (is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_requirements_serving_area
  ON serving_area_requirements (serving_area_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_submissions_status_archived
  ON volunteer_submissions (status, is_archived, created_at);

CREATE INDEX IF NOT EXISTS idx_interests_submission
  ON volunteer_interests (submission_id);

CREATE INDEX IF NOT EXISTS idx_interests_serving_area
  ON volunteer_interests (serving_area_id);

CREATE INDEX IF NOT EXISTS idx_availability_submission
  ON volunteer_availability (submission_id);

CREATE INDEX IF NOT EXISTS idx_confirmations_submission
  ON volunteer_requirement_confirmations (submission_id);

CREATE INDEX IF NOT EXISTS idx_admin_notes_submission
  ON admin_notes (submission_id, created_at);
