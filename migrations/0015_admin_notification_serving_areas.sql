-- Notification serving-area scope for admin volunteer emails.
ALTER TABLE admin_users
  ADD COLUMN notify_serving_area_scope TEXT NOT NULL DEFAULT 'all'
    CHECK (notify_serving_area_scope IN ('all', 'selected'));

CREATE TABLE IF NOT EXISTS admin_notification_serving_areas (
  admin_user_id INTEGER NOT NULL,
  serving_area_id INTEGER NOT NULL,
  organization_id INTEGER NOT NULL,
  PRIMARY KEY (admin_user_id, serving_area_id),
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE CASCADE,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_notification_serving_areas_org_area
  ON admin_notification_serving_areas (organization_id, serving_area_id);

CREATE INDEX IF NOT EXISTS idx_admin_notification_serving_areas_admin
  ON admin_notification_serving_areas (admin_user_id);
