ALTER TABLE volunteer_submissions ADD COLUMN planning_center_imported_at TEXT;
ALTER TABLE volunteer_submissions ADD COLUMN planning_center_imported_by_admin_user_id INTEGER;
ALTER TABLE volunteer_submissions ADD COLUMN planning_center_import_tab_id TEXT;
ALTER TABLE volunteer_submissions ADD COLUMN planning_center_import_tab_name TEXT;
ALTER TABLE volunteer_submissions ADD COLUMN planning_center_import_custom_data_json TEXT;

CREATE INDEX IF NOT EXISTS idx_submissions_pc_import_lookup
  ON volunteer_submissions (organization_id, form_id, planning_center_person_id)
  WHERE planning_center_person_id IS NOT NULL;
