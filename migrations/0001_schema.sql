-- ServeWell consolidated schema (greenfield baseline).
-- Demo data: migrations 0002–0004.

CREATE TABLE IF NOT EXISTS organizations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  organization_type TEXT NOT NULL DEFAULT 'church',
  contact_email TEXT,
  website_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS volunteer_forms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  intro_text TEXT,
  success_message TEXT,
  template_key TEXT NOT NULL DEFAULT 'church_volunteer_default',
  is_default INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS form_sections (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  display_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  is_active INTEGER NOT NULL DEFAULT 1,
  session_version INTEGER NOT NULL DEFAULT 0,
  notify_new_submissions INTEGER NOT NULL DEFAULT 1,
  notify_ready_to_schedule INTEGER NOT NULL DEFAULT 0,
  notify_volunteer_updated INTEGER NOT NULL DEFAULT 0,
  notify_admin_joined INTEGER NOT NULL DEFAULT 0,
  last_login_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  UNIQUE (organization_id, email)
);

CREATE TABLE IF NOT EXISTS serving_areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER NOT NULL,
  section_id INTEGER,
  slug TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  description TEXT,
  public_note TEXT,
  requires_background_check INTEGER NOT NULL DEFAULT 0,
  requires_training INTEGER NOT NULL DEFAULT 0,
  requires_audition_or_interview INTEGER NOT NULL DEFAULT 0,
  recruitment_status TEXT NOT NULL DEFAULT 'open'
    CHECK (recruitment_status IN ('open', 'needed', 'urgent', 'closed')),
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE CASCADE,
  FOREIGN KEY (section_id) REFERENCES form_sections(id),
  UNIQUE (form_id, slug)
);

CREATE TABLE IF NOT EXISTS serving_area_requirements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER NOT NULL,
  serving_area_id INTEGER NOT NULL,
  requirement_type TEXT NOT NULL,
  label TEXT NOT NULL,
  description TEXT,
  day_of_week TEXT,
  start_time TEXT,
  end_time TEXT,
  is_mandatory INTEGER NOT NULL DEFAULT 0,
  requires_confirmation INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE CASCADE,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS volunteer_submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  preferred_contact_method TEXT NOT NULL,
  overall_frequency TEXT NOT NULL,
  general_availability_notes TEXT,
  open_to_special_events INTEGER NOT NULL DEFAULT 0,
  experience_notes TEXT,
  additional_notes TEXT,
  status TEXT NOT NULL DEFAULT 'new',
  is_archived INTEGER NOT NULL DEFAULT 0,
  planning_center_person_id TEXT,
  updated_by_admin_user_id INTEGER,
  planning_center_synced_at TEXT,
  planning_center_synced_by_admin_user_id INTEGER,
  intake_updated_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (email IS NOT NULL OR phone IS NOT NULL),
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS volunteer_interests (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
  submission_id INTEGER NOT NULL,
  serving_area_id INTEGER,
  serving_area_name TEXT,
  uses_area_specific_frequency INTEGER NOT NULL DEFAULT 0,
  area_specific_frequency TEXT,
  interest_notes TEXT,
  experience_level TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS volunteer_availability (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
  submission_id INTEGER NOT NULL,
  availability_key TEXT NOT NULL,
  label TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS volunteer_requirement_confirmations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
  submission_id INTEGER NOT NULL,
  serving_area_id INTEGER,
  requirement_id INTEGER,
  confirmed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (serving_area_id) REFERENCES serving_areas(id) ON DELETE SET NULL,
  FOREIGN KEY (requirement_id) REFERENCES serving_area_requirements(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  organization_id INTEGER NOT NULL,
  form_id INTEGER,
  submission_id INTEGER NOT NULL,
  admin_user_id INTEGER NOT NULL,
  note TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
  FOREIGN KEY (form_id) REFERENCES volunteer_forms(id) ON DELETE SET NULL,
  FOREIGN KEY (submission_id) REFERENCES volunteer_submissions(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE RESTRICT
);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_user_id INTEGER NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (admin_user_id) REFERENCES admin_users(id) ON DELETE CASCADE
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

CREATE INDEX IF NOT EXISTS idx_volunteer_forms_org_default
  ON volunteer_forms (organization_id, is_default, is_active);

CREATE INDEX IF NOT EXISTS idx_form_sections_form_sort
  ON form_sections (form_id, sort_order, id);

CREATE INDEX IF NOT EXISTS idx_admin_users_org_active
  ON admin_users (organization_id, is_active);

CREATE INDEX IF NOT EXISTS idx_serving_areas_form_active_sort
  ON serving_areas (form_id, is_active, sort_order);

CREATE INDEX IF NOT EXISTS idx_requirements_form_area
  ON serving_area_requirements (form_id, serving_area_id, sort_order);

CREATE INDEX IF NOT EXISTS idx_submissions_org_form_status
  ON volunteer_submissions (organization_id, form_id, status, is_archived, created_at);

CREATE INDEX IF NOT EXISTS idx_submissions_planning_center_person
  ON volunteer_submissions (organization_id, planning_center_person_id)
  WHERE planning_center_person_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_interests_submission
  ON volunteer_interests (submission_id);

CREATE INDEX IF NOT EXISTS idx_interests_serving_area
  ON volunteer_interests (serving_area_id);

CREATE INDEX IF NOT EXISTS idx_availability_submission
  ON volunteer_availability (submission_id);

CREATE INDEX IF NOT EXISTS idx_confirmations_submission
  ON volunteer_requirement_confirmations (submission_id);

CREATE INDEX IF NOT EXISTS idx_admin_notes_submission
  ON admin_notes (submission_id, created_at);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_hash
  ON password_reset_tokens (token_hash);

CREATE INDEX IF NOT EXISTS idx_password_reset_tokens_admin_expires
  ON password_reset_tokens (admin_user_id, expires_at);

CREATE INDEX IF NOT EXISTS idx_admin_invites_org_email
  ON admin_invites (organization_id, email);

CREATE INDEX IF NOT EXISTS idx_admin_invites_token_hash
  ON admin_invites (token_hash);

CREATE INDEX IF NOT EXISTS idx_organization_integrations_org_provider
  ON organization_integrations (organization_id, provider);

CREATE INDEX IF NOT EXISTS idx_oauth_states_state_provider
  ON oauth_states (state, provider);

CREATE INDEX IF NOT EXISTS idx_oauth_states_expiry
  ON oauth_states (expires_at);
