ALTER TABLE admin_users ADD COLUMN notify_admin_joined INTEGER NOT NULL DEFAULT 0;

UPDATE admin_users
SET notify_admin_joined = 1
WHERE role = 'owner';
