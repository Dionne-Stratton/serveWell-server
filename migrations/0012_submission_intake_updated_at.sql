-- Intake content changes only (not status/archive). Used for Planning Center stale detection.
ALTER TABLE volunteer_submissions ADD COLUMN intake_updated_at TEXT;

UPDATE volunteer_submissions
SET intake_updated_at = updated_at
WHERE intake_updated_at IS NULL;
