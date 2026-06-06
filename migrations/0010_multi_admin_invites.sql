-- Multi-admin: owner role for first admin per org; pending invites table.

UPDATE admin_users
SET role = 'owner'
WHERE id IN (
  SELECT MIN(id)
  FROM admin_users
  GROUP BY organization_id
);

CREATE TABLE IF NOT EXISTS admin_invites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  invited_by_admin_user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  revoked_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (invited_by_admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_admin_invites_org_email
  ON admin_invites (organization_id, email);

CREATE INDEX IF NOT EXISTS idx_admin_invites_token_hash
  ON admin_invites (token_hash);
