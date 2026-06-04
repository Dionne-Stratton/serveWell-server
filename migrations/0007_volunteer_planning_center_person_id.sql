-- Links a ServeWell submission to a Planning Center People person (push or future pull).
ALTER TABLE volunteer_submissions ADD COLUMN planning_center_person_id TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_planning_center_person
  ON volunteer_submissions (organization_id, planning_center_person_id)
  WHERE planning_center_person_id IS NOT NULL;
