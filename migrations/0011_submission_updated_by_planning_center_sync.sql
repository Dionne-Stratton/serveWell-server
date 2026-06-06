-- Submission audit vs Planning Center sync metadata (separate from workflow status).

ALTER TABLE volunteer_submissions ADD COLUMN updated_by_admin_user_id INTEGER;

ALTER TABLE volunteer_submissions ADD COLUMN planning_center_synced_at TEXT;

ALTER TABLE volunteer_submissions ADD COLUMN planning_center_synced_by_admin_user_id INTEGER;

UPDATE volunteer_submissions
SET status = 'approved_ready_to_schedule'
WHERE status = 'added_to_planning_center';
