import type { Env } from "../types";

export interface AdminNotificationPreferences {
  newSubmissions: boolean;
  readyToSchedule: boolean;
  volunteerUpdated: boolean;
  /** Owner-only: email when an invited admin accepts and joins. */
  adminJoined: boolean;
}

interface NotificationPrefRow {
  notify_new_submissions: number;
  notify_ready_to_schedule: number;
  notify_volunteer_updated: number;
  notify_admin_joined: number;
}

function mapNotificationPreferences(row: NotificationPrefRow): AdminNotificationPreferences {
  return {
    newSubmissions: row.notify_new_submissions === 1,
    readyToSchedule: row.notify_ready_to_schedule === 1,
    volunteerUpdated: row.notify_volunteer_updated === 1,
    adminJoined: row.notify_admin_joined === 1
  };
}

export async function getAdminNotificationPreferences(
  env: Env,
  adminUserId: number,
  organizationId: number
): Promise<AdminNotificationPreferences | null> {
  const row = await env.DB.prepare(
    `
    SELECT notify_new_submissions, notify_ready_to_schedule, notify_volunteer_updated, notify_admin_joined
    FROM admin_users
    WHERE id = ? AND organization_id = ? AND is_active = 1
    LIMIT 1
    `
  )
    .bind(adminUserId, organizationId)
    .first<NotificationPrefRow>();

  if (!row) {
    return null;
  }

  return mapNotificationPreferences(row);
}

export interface UpdateAdminNotificationPreferencesInput {
  newSubmissions?: boolean;
  readyToSchedule?: boolean;
  volunteerUpdated?: boolean;
  adminJoined?: boolean;
}

export async function updateAdminNotificationPreferences(
  env: Env,
  adminUserId: number,
  organizationId: number,
  input: UpdateAdminNotificationPreferencesInput
): Promise<AdminNotificationPreferences | null> {
  const current = await getAdminNotificationPreferences(env, adminUserId, organizationId);

  if (!current) {
    return null;
  }

  const nextNew =
    typeof input.newSubmissions === "boolean" ? input.newSubmissions : current.newSubmissions;
  const nextReady =
    typeof input.readyToSchedule === "boolean"
      ? input.readyToSchedule
      : current.readyToSchedule;
  const nextVolunteerUpdated =
    typeof input.volunteerUpdated === "boolean"
      ? input.volunteerUpdated
      : current.volunteerUpdated;
  const nextAdminJoined =
    typeof input.adminJoined === "boolean" ? input.adminJoined : current.adminJoined;

  await env.DB.prepare(
    `
    UPDATE admin_users
    SET
      notify_new_submissions = ?,
      notify_ready_to_schedule = ?,
      notify_volunteer_updated = ?,
      notify_admin_joined = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ? AND is_active = 1
    `
  )
    .bind(
      nextNew ? 1 : 0,
      nextReady ? 1 : 0,
      nextVolunteerUpdated ? 1 : 0,
      nextAdminJoined ? 1 : 0,
      adminUserId,
      organizationId
    )
    .run();

  return getAdminNotificationPreferences(env, adminUserId, organizationId);
}

export interface AdminNotificationRecipient {
  id: number;
  email: string;
  displayName: string;
}

export async function listAdminsForSubmissionNotification(
  env: Env,
  organizationId: number,
  preference: "new_submissions" | "ready_to_schedule",
  excludeAdminUserId?: number
): Promise<AdminNotificationRecipient[]> {
  const column =
    preference === "new_submissions" ? "notify_new_submissions" : "notify_ready_to_schedule";

  const query =
    excludeAdminUserId !== undefined
      ? `
    SELECT au.id, au.email, au.display_name
    FROM admin_users au
    INNER JOIN organizations o ON o.id = au.organization_id AND o.is_active = 1
    WHERE au.organization_id = ?
      AND au.is_active = 1
      AND au.${column} = 1
      AND au.id != ?
    ORDER BY au.id ASC
    `
      : `
    SELECT au.id, au.email, au.display_name
    FROM admin_users au
    INNER JOIN organizations o ON o.id = au.organization_id AND o.is_active = 1
    WHERE au.organization_id = ?
      AND au.is_active = 1
      AND au.${column} = 1
    ORDER BY au.id ASC
    `;

  const statement = env.DB.prepare(query);
  const result =
    excludeAdminUserId !== undefined
      ? await statement
          .bind(organizationId, excludeAdminUserId)
          .all<{ id: number; email: string; display_name: string }>()
      : await statement
          .bind(organizationId)
          .all<{ id: number; email: string; display_name: string }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name
  }));
}

export async function listAdminsForVolunteerUpdatedNotification(
  env: Env,
  organizationId: number
): Promise<AdminNotificationRecipient[]> {
  const result = await env.DB.prepare(
    `
    SELECT id, email, display_name
    FROM admin_users
    WHERE organization_id = ?
      AND is_active = 1
      AND notify_volunteer_updated = 1
    ORDER BY id ASC
    `
  )
    .bind(organizationId)
    .all<{ id: number; email: string; display_name: string }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name
  }));
}

export async function listOwnersForAdminJoinedNotification(
  env: Env,
  organizationId: number,
  excludeAdminUserId: number
): Promise<AdminNotificationRecipient[]> {
  const result = await env.DB.prepare(
    `
    SELECT au.id, au.email, au.display_name
    FROM admin_users au
    INNER JOIN organizations o ON o.id = au.organization_id AND o.is_active = 1
    WHERE au.organization_id = ?
      AND au.is_active = 1
      AND au.role = 'owner'
      AND au.notify_admin_joined = 1
      AND au.id != ?
    ORDER BY au.id ASC
    `
  )
    .bind(organizationId, excludeAdminUserId)
    .all<{ id: number; email: string; display_name: string }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name
  }));
}
