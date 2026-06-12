PRAGMA foreign_keys=OFF;

CREATE TABLE schedules_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  schedule_type TEXT NOT NULL DEFAULT 'monthly'
    CHECK (schedule_type IN ('monthly', 'special_event')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

INSERT INTO schedules_new (id, organization_id, name, schedule_type, created_at, updated_at)
SELECT
  id,
  organization_id,
  name,
  CASE
    WHEN schedule_type = 'recurring' THEN 'monthly'
    WHEN schedule_type IN ('monthly', 'special_event') THEN schedule_type
    ELSE 'monthly'
  END,
  created_at,
  updated_at
FROM schedules;

DROP TABLE schedules;

ALTER TABLE schedules_new RENAME TO schedules;

CREATE INDEX IF NOT EXISTS idx_schedules_organization
  ON schedules (organization_id, created_at DESC);

PRAGMA foreign_keys=ON;
