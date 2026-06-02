-- Planning Center OAuth connections, scoped by ServeWell organization.

CREATE TABLE IF NOT EXISTS organization_integrations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  provider TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'not_connected'
    CHECK (status IN ('not_connected', 'connected', 'disabled', 'error')),
  display_name TEXT NOT NULL,
  external_organization_id TEXT,
  external_organization_name TEXT,
  connected_by_admin_user_id INTEGER,
  token_type TEXT,
  scope TEXT,
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  access_token_expires_at TEXT,
  settings_json TEXT,
  last_connected_at TEXT,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (connected_by_admin_user_id) REFERENCES admin_users(id) ON DELETE SET NULL,
  UNIQUE (organization_id, provider)
);

CREATE TABLE IF NOT EXISTS oauth_states (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  provider TEXT NOT NULL,
  state TEXT NOT NULL UNIQUE,
  organization_id INTEGER NOT NULL,
  admin_user_id INTEGER NOT NULL,
  code_verifier TEXT NOT NULL,
  redirect_path TEXT,
  expires_at TEXT NOT NULL,
  consumed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_organization_integrations_org_provider
  ON organization_integrations (organization_id, provider);

CREATE INDEX IF NOT EXISTS idx_oauth_states_state_provider
  ON oauth_states (state, provider);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry
  ON oauth_states (expires_at);
