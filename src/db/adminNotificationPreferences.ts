import type { Env } from "../types";

export type NotifyServingAreaScope = "all" | "selected";

export interface AdminNotificationPreferences {
  newSubmissions: boolean;
  readyToSchedule: boolean;
  volunteerUpdated: boolean;
  /** Owner-only: email when an invited admin accepts and joins. */
  adminJoined: boolean;
  /**
   * `all` = every serving area.
   * `selected` = only listed areas; if the list is empty, treated as all for delivery.
   */
  servingAreaScope: NotifyServingAreaScope;
  servingAreaIds: number[];
}

export interface NotificationServingAreaOption {
  id: number;
  name: string;
}

interface NotificationPrefRow {
  notify_new_submissions: number;
  notify_ready_to_schedule: number;
  notify_volunteer_updated: number;
  notify_admin_joined: number;
  notify_serving_area_scope: string | null;
}

function mapScope(raw: string | null | undefined): NotifyServingAreaScope {
  return raw === "selected" ? "selected" : "all";
}

function mapNotificationPreferences(
  row: NotificationPrefRow,
  servingAreaIds: number[]
): AdminNotificationPreferences {
  return {
    newSubmissions: row.notify_new_submissions === 1,
    readyToSchedule: row.notify_ready_to_schedule === 1,
    volunteerUpdated: row.notify_volunteer_updated === 1,
    adminJoined: row.notify_admin_joined === 1,
    servingAreaScope: mapScope(row.notify_serving_area_scope),
    servingAreaIds
  };
}

async function listAdminNotificationServingAreaIds(
  env: Env,
  adminUserId: number
): Promise<number[]> {
  const result = await env.DB.prepare(
    `
    SELECT serving_area_id
    FROM admin_notification_serving_areas
    WHERE admin_user_id = ?
    ORDER BY serving_area_id ASC
    `
  )
    .bind(adminUserId)
    .all<{ serving_area_id: number }>();

  return (result.results ?? []).map((row) => row.serving_area_id);
}

export async function listOrganizationServingAreasForNotifications(
  env: Env,
  organizationId: number
): Promise<NotificationServingAreaOption[]> {
  const result = await env.DB.prepare(
    `
    SELECT id, name
    FROM serving_areas
    WHERE organization_id = ?
      AND is_active = 1
    ORDER BY sort_order ASC, name ASC, id ASC
    `
  )
    .bind(organizationId)
    .all<{ id: number; name: string }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name
  }));
}

export async function getAdminNotificationPreferences(
  env: Env,
  adminUserId: number,
  organizationId: number
): Promise<AdminNotificationPreferences | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      notify_new_submissions,
      notify_ready_to_schedule,
      notify_volunteer_updated,
      notify_admin_joined,
      notify_serving_area_scope
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

  const servingAreaIds = await listAdminNotificationServingAreaIds(env, adminUserId);
  return mapNotificationPreferences(row, servingAreaIds);
}

export interface UpdateAdminNotificationPreferencesInput {
  newSubmissions?: boolean;
  readyToSchedule?: boolean;
  volunteerUpdated?: boolean;
  adminJoined?: boolean;
  servingAreaScope?: NotifyServingAreaScope;
  servingAreaIds?: number[];
}

async function replaceAdminNotificationServingAreas(
  env: Env,
  adminUserId: number,
  organizationId: number,
  servingAreaIds: number[]
): Promise<void> {
  const uniqueIds = [...new Set(servingAreaIds.filter((id) => Number.isInteger(id) && id > 0))];

  await env.DB.prepare(
    `
    DELETE FROM admin_notification_serving_areas
    WHERE admin_user_id = ? AND organization_id = ?
    `
  )
    .bind(adminUserId, organizationId)
    .run();

  if (uniqueIds.length === 0) {
    return;
  }

  const placeholders = uniqueIds.map(() => "?").join(", ");
  const valid = await env.DB.prepare(
    `
    SELECT id
    FROM serving_areas
    WHERE organization_id = ?
      AND is_active = 1
      AND id IN (${placeholders})
    `
  )
    .bind(organizationId, ...uniqueIds)
    .all<{ id: number }>();

  const validIds = (valid.results ?? []).map((row) => row.id);

  if (validIds.length === 0) {
    return;
  }

  await env.DB.batch(
    validIds.map((servingAreaId) =>
      env.DB.prepare(
        `
        INSERT INTO admin_notification_serving_areas (
          admin_user_id,
          serving_area_id,
          organization_id
        ) VALUES (?, ?, ?)
        `
      ).bind(adminUserId, servingAreaId, organizationId)
    )
  );
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
  const nextScope: NotifyServingAreaScope =
    input.servingAreaScope === "all" || input.servingAreaScope === "selected"
      ? input.servingAreaScope
      : current.servingAreaScope;

  await env.DB.prepare(
    `
    UPDATE admin_users
    SET
      notify_new_submissions = ?,
      notify_ready_to_schedule = ?,
      notify_volunteer_updated = ?,
      notify_admin_joined = ?,
      notify_serving_area_scope = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ? AND is_active = 1
    `
  )
    .bind(
      nextNew ? 1 : 0,
      nextReady ? 1 : 0,
      nextVolunteerUpdated ? 1 : 0,
      nextAdminJoined ? 1 : 0,
      nextScope,
      adminUserId,
      organizationId
    )
    .run();

  if (Array.isArray(input.servingAreaIds)) {
    await replaceAdminNotificationServingAreas(
      env,
      adminUserId,
      organizationId,
      input.servingAreaIds
    );
  } else if (nextScope === "all") {
    await replaceAdminNotificationServingAreas(env, adminUserId, organizationId, []);
  }

  return getAdminNotificationPreferences(env, adminUserId, organizationId);
}

export interface AdminNotificationRecipient {
  id: number;
  email: string;
  displayName: string;
}

async function loadSubmissionServingAreaIds(
  env: Env,
  organizationId: number,
  submissionId: number
): Promise<number[]> {
  const result = await env.DB.prepare(
    `
    SELECT DISTINCT vi.serving_area_id
    FROM volunteer_interests vi
    INNER JOIN volunteer_submissions vs ON vs.id = vi.submission_id
    WHERE vi.submission_id = ?
      AND vs.organization_id = ?
      AND vi.serving_area_id IS NOT NULL
    `
  )
    .bind(submissionId, organizationId)
    .all<{ serving_area_id: number }>();

  return (result.results ?? []).map((row) => row.serving_area_id);
}

function adminMatchesServingAreaScope(
  scope: NotifyServingAreaScope,
  selectedAreaIds: number[],
  submissionAreaIds: number[]
): boolean {
  // "selected" with no areas configured behaves like all.
  if (scope !== "selected" || selectedAreaIds.length === 0) {
    return true;
  }

  // Submission has no linked catalog areas — only org-wide recipients should get it.
  if (submissionAreaIds.length === 0) {
    return false;
  }

  const selected = new Set(selectedAreaIds);
  return submissionAreaIds.some((id) => selected.has(id));
}

async function filterRecipientsByServingAreaScope(
  env: Env,
  organizationId: number,
  submissionId: number,
  recipients: AdminNotificationRecipient[]
): Promise<AdminNotificationRecipient[]> {
  if (recipients.length === 0) {
    return [];
  }

  const submissionAreaIds = await loadSubmissionServingAreaIds(
    env,
    organizationId,
    submissionId
  );

  const recipientIds = recipients.map((row) => row.id);
  const placeholders = recipientIds.map(() => "?").join(", ");

  const prefs = await env.DB.prepare(
    `
    SELECT id, notify_serving_area_scope
    FROM admin_users
    WHERE organization_id = ?
      AND id IN (${placeholders})
    `
  )
    .bind(organizationId, ...recipientIds)
    .all<{ id: number; notify_serving_area_scope: string | null }>();

  const scopeByAdmin = new Map<number, NotifyServingAreaScope>();
  for (const row of prefs.results ?? []) {
    scopeByAdmin.set(row.id, mapScope(row.notify_serving_area_scope));
  }

  const areaRows = await env.DB.prepare(
    `
    SELECT admin_user_id, serving_area_id
    FROM admin_notification_serving_areas
    WHERE organization_id = ?
      AND admin_user_id IN (${placeholders})
    `
  )
    .bind(organizationId, ...recipientIds)
    .all<{ admin_user_id: number; serving_area_id: number }>();

  const areasByAdmin = new Map<number, number[]>();
  for (const row of areaRows.results ?? []) {
    const list = areasByAdmin.get(row.admin_user_id) ?? [];
    list.push(row.serving_area_id);
    areasByAdmin.set(row.admin_user_id, list);
  }

  return recipients.filter((recipient) =>
    adminMatchesServingAreaScope(
      scopeByAdmin.get(recipient.id) ?? "all",
      areasByAdmin.get(recipient.id) ?? [],
      submissionAreaIds
    )
  );
}

export async function listAdminsForSubmissionNotification(
  env: Env,
  organizationId: number,
  preference: "new_submissions" | "ready_to_schedule",
  submissionId: number,
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

  const recipients = (result.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name
  }));

  return filterRecipientsByServingAreaScope(env, organizationId, submissionId, recipients);
}

export async function listAdminsForVolunteerUpdatedNotification(
  env: Env,
  organizationId: number,
  submissionId: number
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

  const recipients = (result.results ?? []).map((row) => ({
    id: row.id,
    email: row.email,
    displayName: row.display_name
  }));

  return filterRecipientsByServingAreaScope(env, organizationId, submissionId, recipients);
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

export function defaultNotificationPreferences(
  role: string | undefined
): AdminNotificationPreferences {
  return {
    newSubmissions: true,
    readyToSchedule: false,
    volunteerUpdated: true,
    adminJoined: role === "owner",
    servingAreaScope: "all",
    servingAreaIds: []
  };
}
