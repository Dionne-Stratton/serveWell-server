ALTER TABLE volunteer_submissions ADD COLUMN volunteer_update_review_needed INTEGER NOT NULL DEFAULT 0;
ALTER TABLE volunteer_submissions ADD COLUMN volunteer_update_reviewed_at TEXT;
ALTER TABLE volunteer_submissions ADD COLUMN volunteer_update_reviewed_by_admin_user_id INTEGER;

UPDATE volunteer_submissions
SET volunteer_update_review_needed = 1
WHERE volunteer_self_updated_at IS NOT NULL
  AND volunteer_update_review_needed = 0;
