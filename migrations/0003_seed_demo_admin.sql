INSERT INTO admin_users (
  email,
  password_hash,
  display_name,
  role,
  is_active
) VALUES (
  'church@example.com',
  'pbkdf2_sha256$210000$servewell-demo-admin-v1$nML8YMfCFtlAavEyMIDJ3C7N4wFjK0lcJ4i7B//gtaI=',
  'Church Admin',
  'admin',
  1
)
ON CONFLICT(email) DO UPDATE SET
  password_hash = excluded.password_hash,
  display_name = excluded.display_name,
  role = excluded.role,
  is_active = excluded.is_active,
  updated_at = CURRENT_TIMESTAMP;
