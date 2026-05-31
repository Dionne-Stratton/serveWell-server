INSERT INTO organizations (
  id,
  slug,
  name,
  organization_type,
  is_active
) VALUES (
  1,
  'demo',
  'Demo Church',
  'church',
  1
)
ON CONFLICT(slug) DO UPDATE SET
  name = excluded.name,
  organization_type = excluded.organization_type,
  is_active = excluded.is_active,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO volunteer_forms (
  id,
  organization_id,
  slug,
  name,
  template_key,
  is_default,
  is_active
) VALUES (
  1,
  1,
  'general-serving',
  'Volunteer Interest',
  'church_volunteer_default',
  1,
  1
)
ON CONFLICT(organization_id, slug) DO UPDATE SET
  name = excluded.name,
  template_key = excluded.template_key,
  is_default = excluded.is_default,
  is_active = excluded.is_active,
  updated_at = CURRENT_TIMESTAMP;

INSERT INTO admin_users (
  organization_id,
  email,
  password_hash,
  display_name,
  role,
  is_active
) VALUES (
  1,
  'church@example.com',
  'sha256$servewell-demo-admin-v2$AKpxxkopvoifk4qqWOa7VaKMbNWT7FUeNslmIta6JJE=',
  'Church Admin',
  'admin',
  1
)
ON CONFLICT(organization_id, email) DO UPDATE SET
  password_hash = excluded.password_hash,
  display_name = excluded.display_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = CURRENT_TIMESTAMP;
