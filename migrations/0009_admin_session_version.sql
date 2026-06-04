-- Bump on password reset to invalidate outstanding admin JWTs.
ALTER TABLE admin_users ADD COLUMN session_version INTEGER NOT NULL DEFAULT 0;
