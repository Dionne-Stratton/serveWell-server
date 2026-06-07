import type { AdminRole } from "../validation/adminRoles";
import type { AdminUser, Env } from "../types";

interface AdminUserRow {
  id: number;
  organization_id: number;
  email: string;
  password_hash: string;
  display_name: string;
  role: AdminRole;
}

export interface AdminUserWithPassword extends AdminUser {
  passwordHash: string;
}

export interface AdminOrganizationSummary {
  slug: string;
  name: string;
}

export async function listActiveOrganizationsForAdminEmail(
  env: Env,
  email: string
): Promise<AdminOrganizationSummary[]> {
  const result = await env.DB.prepare(
    `
    SELECT o.slug, o.name
    FROM admin_users au
    INNER JOIN organizations o ON o.id = au.organization_id
    WHERE lower(au.email) = lower(?)
      AND au.is_active = 1
      AND o.is_active = 1
    ORDER BY o.id ASC
    `
  )
    .bind(email.trim())
    .all<{ slug: string; name: string }>();

  return (result.results ?? []).map((row) => ({
    slug: row.slug,
    name: row.name
  }));
}

export async function findActiveAdminByOrganizationSlugAndEmail(
  env: Env,
  organizationSlug: string,
  email: string
): Promise<AdminUserWithPassword | null> {
  const row = await env.DB.prepare(
    `
    SELECT au.id, au.organization_id, au.email, au.password_hash, au.display_name, au.role
    FROM admin_users au
    INNER JOIN organizations o ON o.id = au.organization_id
    WHERE lower(o.slug) = lower(?)
      AND lower(au.email) = lower(?)
      AND au.is_active = 1
      AND o.is_active = 1
    LIMIT 1
    `
  )
    .bind(organizationSlug.trim(), email.trim())
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

export async function findActiveAdminByOrganizationAndEmail(
  env: Env,
  organizationId: number,
  email: string
): Promise<AdminUser | null> {
  const row = await env.DB.prepare(
    `
    SELECT id, organization_id, email, display_name, role
    FROM admin_users
    WHERE organization_id = ?
      AND lower(email) = lower(?)
      AND is_active = 1
    LIMIT 1
    `
  )
    .bind(organizationId, email.trim())
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

export async function listActiveAdminsForOrganization(
  env: Env,
  organizationId: number
): Promise<AdminUser[]> {
  const result = await env.DB.prepare(
    `
    SELECT id, organization_id, email, display_name, role
    FROM admin_users
    WHERE organization_id = ?
      AND is_active = 1
    ORDER BY
      CASE role WHEN 'owner' THEN 0 ELSE 1 END,
      id ASC
    `
  )
    .bind(organizationId)
    .all<Omit<AdminUserRow, "password_hash">>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role
  }));
}

export async function createAdminUser(
  env: Env,
  input: {
    organizationId: number;
    email: string;
    passwordHash: string;
    displayName: string;
    role: AdminRole;
  }
): Promise<AdminUser> {
  await env.DB.prepare(
    `
    INSERT INTO admin_users (
      organization_id,
      email,
      password_hash,
      display_name,
      role,
      is_active
    )
    VALUES (?, ?, ?, ?, ?, 1)
    `
  )
    .bind(
      input.organizationId,
      input.email.trim(),
      input.passwordHash,
      input.displayName,
      input.role
    )
    .run();

  const admin = await findActiveAdminByOrganizationAndEmail(
    env,
    input.organizationId,
    input.email
  );

  if (!admin) {
    throw new Error("Admin user was not persisted.");
  }

  return admin;
}

export async function deactivateAdminUser(
  env: Env,
  adminUserId: number,
  organizationId: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `
    UPDATE admin_users
    SET is_active = 0, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND organization_id = ?
      AND role = 'admin'
      AND is_active = 1
    `
  )
    .bind(adminUserId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

const ADMIN_EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type UpdateAdminProfileResult =
  | { ok: true; admin: AdminUser }
  | { ok: false; error: string; code?: string };

export async function updateAdminProfile(
  env: Env,
  adminUserId: number,
  organizationId: number,
  input: { displayName?: string; email?: string }
): Promise<UpdateAdminProfileResult> {
  if (input.displayName === undefined && input.email === undefined) {
    return { ok: false, error: "No profile fields to update." };
  }

  const updates: string[] = [];
  const binds: (string | number)[] = [];

  if (input.displayName !== undefined) {
    const displayName = input.displayName.trim();

    if (!displayName) {
      return { ok: false, error: "Name is required.", code: "INVALID_DISPLAY_NAME" };
    }

    updates.push("display_name = ?");
    binds.push(displayName);
  }

  if (input.email !== undefined) {
    const email = input.email.trim().toLowerCase();

    if (!email || !ADMIN_EMAIL_PATTERN.test(email)) {
      return { ok: false, error: "Please enter a valid email address.", code: "INVALID_EMAIL" };
    }

    const taken = await env.DB.prepare(
      `
      SELECT id
      FROM admin_users
      WHERE organization_id = ?
        AND lower(email) = lower(?)
        AND id != ?
        AND is_active = 1
      LIMIT 1
      `
    )
      .bind(organizationId, email, adminUserId)
      .first<{ id: number }>();

    if (taken) {
      return {
        ok: false,
        error: "Another admin in this organization already uses that email.",
        code: "EMAIL_IN_USE"
      };
    }

    updates.push("email = ?");
    binds.push(email);
  }

  binds.push(adminUserId, organizationId);

  const result = await env.DB.prepare(
    `
    UPDATE admin_users
    SET ${updates.join(", ")}, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ? AND is_active = 1
    `
  )
    .bind(...binds)
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return { ok: false, error: "Unable to update profile." };
  }

  const admin = await findActiveAdminById(env, adminUserId);

  if (!admin) {
    return { ok: false, error: "Unable to update profile." };
  }

  return { ok: true, admin };
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
