import type { AdminUser, Env } from "../types";

interface AdminUserRow {
  id: number;
  organization_id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: "admin";
}

export interface AdminUserWithPassword extends AdminUser {
  passwordHash: string;
}

export async function findActiveAdminByEmail(
  env: Env,
  email: string
): Promise<AdminUserWithPassword | null> {
  const row = await env.DB.prepare(
    `
    SELECT id, organization_id, email, password_hash, display_name, role
    FROM admin_users
    WHERE lower(email) = lower(?)
      AND is_active = 1
    LIMIT 1
    `
  )
    .bind(email)
    .first<AdminUserRow>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    passwordHash: row.password_hash
  };
}

export async function findActiveAdminById(env: Env, id: number): Promise<AdminUser | null> {
  const row = await env.DB.prepare(
    `
    SELECT id, organization_id, email, display_name, role
    FROM admin_users
    WHERE id = ?
      AND is_active = 1
    LIMIT 1
    `
  )
    .bind(id)
    .first<Omit<AdminUserRow, "password_hash">>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role
  };
}

export async function getAdminSessionVersion(env: Env, adminUserId: number): Promise<number> {
  const row = await env.DB.prepare(
    `
    SELECT session_version
    FROM admin_users
    WHERE id = ? AND is_active = 1
    LIMIT 1
    `
  )
    .bind(adminUserId)
    .first<{ session_version: number }>();

  return row?.session_version ?? 0;
}

export async function updateAdminPasswordHash(
  env: Env,
  adminUserId: number,
  passwordHash: string
): Promise<boolean> {
  const result = await env.DB.prepare(
    `
    UPDATE admin_users
    SET
      password_hash = ?,
      session_version = session_version + 1,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND is_active = 1
    `
  )
    .bind(passwordHash, adminUserId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
