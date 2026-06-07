ALTER TABLE admin_users ADD COLUMN notify_new_submissions INTEGER NOT NULL DEFAULT 1;
ALTER TABLE admin_users ADD COLUMN notify_ready_to_schedule INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN notify_volunteer_updated INTEGER NOT NULL DEFAULT 0;
