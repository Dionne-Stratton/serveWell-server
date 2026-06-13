PRAGMA foreign_keys=OFF;

CREATE TABLE generated_schedules_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  schedule_template_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'published', 'archived')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (schedule_template_id) REFERENCES schedules(id) ON DELETE RESTRICT
);

INSERT INTO generated_schedules_new (
  id,
  organization_id,
  schedule_template_id,
  name,
  status,
  start_date,
  end_date,
  created_at,
  updated_at
)
SELECT
  id,
  organization_id,
  schedule_template_id,
  name,
  status,
  start_date,
  end_date,
  created_at,
  updated_at
FROM generated_schedules;

DROP TABLE generated_schedules;

ALTER TABLE generated_schedules_new RENAME TO generated_schedules;

CREATE INDEX IF NOT EXISTS idx_generated_schedules_organization
  ON generated_schedules (organization_id, start_date ASC, id ASC);

PRAGMA foreign_keys=ON;
