DELETE FROM admin_invites
WHERE organization_id NOT IN (SELECT id FROM organizations);

DELETE FROM password_reset_tokens
WHERE admin_user_id IN (
  SELECT id FROM admin_users
  WHERE organization_id NOT IN (SELECT id FROM organizations)
);

DELETE FROM admin_users
WHERE organization_id NOT IN (SELECT id FROM organizations);
