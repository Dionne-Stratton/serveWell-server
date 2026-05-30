-- Form sections (group headings) + detach submissions from hard-deleted forms

CREATE TABLE IF NOT EXISTS form_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_form_sections_form_sort
  ON form_sections (form_id, sort_order, id);

ALTER TABLE serving_areas ADD COLUMN section_id INTEGER REFERENCES form_sections(id);

INSERT INTO form_sections (organization_id, form_id, title, sort_order)
SELECT
  sa.organization_id,
  sa.form_id,
  CASE sa.category
    WHEN 'worship' THEN 'Worship'
    WHEN 'media_tech' THEN 'Media & tech'
    WHEN 'kids_youth' THEN 'Kids & youth'
    WHEN 'hospitality' THEN 'Hospitality'
    WHEN 'events' THEN 'Events'
    WHEN 'prayer_ministry' THEN 'Prayer & ministry'
    WHEN 'general' THEN 'General'
    WHEN 'outreach' THEN 'Outreach'
    WHEN 'custom' THEN 'Other'
    ELSE sa.category
  END,
  CASE sa.category
    WHEN 'worship' THEN 10
    WHEN 'media_tech' THEN 20
    WHEN 'kids_youth' THEN 30
    WHEN 'hospitality' THEN 40
    WHEN 'events' THEN 50
    WHEN 'prayer_ministry' THEN 60
    WHEN 'outreach' THEN 70
    WHEN 'general' THEN 80
    WHEN 'custom' THEN 90
    ELSE 100
  END
FROM serving_areas sa
GROUP BY sa.organization_id, sa.form_id, sa.category;

UPDATE serving_areas
SET section_id = (
  SELECT fs.id
  FROM form_sections fs
  WHERE fs.form_id = serving_areas.form_id
    AND fs.title = CASE serving_areas.category
      WHEN 'worship' THEN 'Worship'
      WHEN 'media_tech' THEN 'Media & tech'
      WHEN 'kids_youth' THEN 'Kids & youth'
      WHEN 'hospitality' THEN 'Hospitality'
      WHEN 'events' THEN 'Events'
      WHEN 'prayer_ministry' THEN 'Prayer & ministry'
      WHEN 'general' THEN 'General'
      WHEN 'outreach' THEN 'Outreach'
      WHEN 'custom' THEN 'Other'
      ELSE serving_areas.category
    END
  LIMIT 1
);

ALTER TABLE volunteer_interests ADD COLUMN serving_area_name TEXT;

UPDATE volunteer_interests
SET serving_area_name = (
  SELECT sa.name FROM serving_areas sa WHERE sa.id = volunteer_interests.serving_area_id
)
WHERE serving_area_name IS NULL;

PRAGMA foreign_keys = OFF;

CREATE TABLE volunteer_submissions_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
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
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL
);

INSERT INTO volunteer_submissions_new SELECT * FROM volunteer_submissions;

DROP TABLE volunteer_submissions;

ALTER TABLE volunteer_submissions_new RENAME TO volunteer_submissions;

CREATE INDEX IF NOT EXISTS idx_submissions_org_form_status
  ON volunteer_submissions (organization_id, form_id, status, is_archived, created_at);

CREATE TABLE volunteer_interests_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
  submission_id INTEGER NOT NULL,
  serving_area_id INTEGER,
  serving_area_name TEXT,
  uses_area_specific_frequency INTEGER NOT NULL DEFAULT 0,
  area_specific_frequency TEXT,
  interest_notes TEXT,
  experience_level TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE SET NULL
);

INSERT INTO volunteer_interests_new (
  id,
  organization_id,
  form_id,
  submission_id,
  serving_area_id,
  serving_area_name,
  uses_area_specific_frequency,
  area_specific_frequency,
  interest_notes,
  experience_level,
  created_at,
  updated_at
)
SELECT
  id,
  organization_id,
  form_id,
  submission_id,
  serving_area_id,
  serving_area_name,
  uses_area_specific_frequency,
  area_specific_frequency,
  interest_notes,
  experience_level,
  created_at,
  updated_at
FROM volunteer_interests;

DROP TABLE volunteer_interests;

ALTER TABLE volunteer_interests_new RENAME TO volunteer_interests;

CREATE INDEX IF NOT EXISTS idx_interests_submission
  ON volunteer_interests (submission_id);

CREATE INDEX IF NOT EXISTS idx_interests_serving_area
  ON volunteer_interests (serving_area_id);

CREATE TABLE admin_notes_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
  submission_id INTEGER NOT NULL,
  admin_user_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

INSERT INTO admin_notes_new SELECT * FROM admin_notes;

DROP TABLE admin_notes;

ALTER TABLE admin_notes_new RENAME TO admin_notes;

CREATE INDEX IF NOT EXISTS idx_admin_notes_submission
  ON admin_notes (submission_id, created_at);

CREATE TABLE volunteer_availability_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
  submission_id INTEGER NOT NULL,
  availability_key TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE
);

INSERT INTO volunteer_availability_new SELECT * FROM volunteer_availability;

DROP TABLE volunteer_availability;

ALTER TABLE volunteer_availability_new RENAME TO volunteer_availability;

CREATE INDEX IF NOT EXISTS idx_availability_submission
  ON volunteer_availability (submission_id);

CREATE TABLE volunteer_requirement_confirmations_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
  submission_id INTEGER NOT NULL,
  serving_area_id INTEGER,
  requirement_id INTEGER,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE SET NULL,
  FOREIGN KEY (requirement_id) REFERENCES serving_area_requirements(id) ON DELETE SET NULL
);

INSERT INTO volunteer_requirement_confirmations_new SELECT * FROM volunteer_requirement_confirmations;

DROP TABLE volunteer_requirement_confirmations;

ALTER TABLE volunteer_requirement_confirmations_new RENAME TO volunteer_requirement_confirmations;

CREATE INDEX IF NOT EXISTS idx_confirmations_submission
  ON volunteer_requirement_confirmations (submission_id);

PRAGMA foreign_keys = ON;
