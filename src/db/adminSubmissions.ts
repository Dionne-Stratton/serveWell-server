import type { Env } from "../types";
import {
  normalizeSubmissionStatus,
  requirementsPendingStatusFilterValues,
} from "../lib/submissionStatus";

export interface AdminActorSummary {
  id: number;
  displayName: string;
  email: string;
}

export interface AdminSubmissionStaffNote {
  id: number;
  note: string;
  createdAt: string;
}

export interface AdminSubmissionListItem {
  id: number;
  formId: number;
  formName: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContactMethod: string;
  overallFrequency: string;
  availability: string[];
  openToSpecialEvents: boolean;
  status: string;
  isArchived: boolean;
  servingAreas: string[];
  requiresBackgroundCheck: boolean;
  requiresTraining: boolean;
  createdAt: string;
  volunteerSelfUpdatedAt: string | null;
  volunteerUpdateReviewNeeded: boolean;
  staffNotes: AdminSubmissionStaffNote[];
}

export interface AdminSubmissionDetail {
  submission: {
    id: number;
    organizationId: number;
    formId: number;
    formName: string;
    firstName: string;
    lastName: string;
    email: string | null;
    phone: string | null;
    preferredContactMethod: string;
    overallFrequency: string;
    availability: string[];
    openToSpecialEvents: boolean;
    experienceNotes: string | null;
    additionalNotes: string | null;
    status: string;
    isArchived: boolean;
    planningCenterPersonId: string | null;
    planningCenterSyncedAt: string | null;
    planningCenterSyncedBy: AdminActorSummary | null;
    editedSinceLastPlanningCenterSync: boolean;
    createdAt: string;
    updatedAt: string;
    updatedBy: AdminActorSummary | null;
    volunteerSelfUpdatedAt: string | null;
    volunteerUpdateReviewNeeded: boolean;
    volunteerUpdateReviewedAt: string | null;
    volunteerUpdateReviewedBy: AdminActorSummary | null;
  };
  interests: Array<{
    id: number;
    servingAreaId: number;
    servingAreaName: string;
    usesAreaSpecificFrequency: boolean;
    areaSpecificFrequency: string | null;
    effectiveFrequency: string;
    requiresBackgroundCheck: boolean;
    requiresTraining: boolean;
    experienceLevel: string | null;
    interestNotes: string | null;
  }>;
  requirementConfirmations: Array<{
    servingAreaId: number;
    requirementId: number;
    servingAreaName: string;
    label: string;
    confirmed: boolean;
  }>;
  adminNotes: Array<{
    id: number;
    submissionId: number;
    adminUserId: number;
    note: string;
    createdAt: string;
  }>;
}

export interface AdminSubmissionFilters {
  organizationId?: number;
  formId?: number;
  status?: string;
  archived?: boolean;
  servingAreaId?: number;
  formSectionId?: number;
  search?: string;
}

export interface UpdateAdminSubmissionInput {
  status?: string;
  isArchived?: boolean;
}

export interface RecordPlanningCenterSyncInput {
  planningCenterPersonId: string;
  syncedByAdminUserId: number;
  syncedAt?: string;
}

export interface AdminSubmissionMutationResult {
  id: number;
  status: string;
  isArchived: boolean;
  planningCenterPersonId: string | null;
  planningCenterSyncedAt: string | null;
  planningCenterSyncedBy: AdminActorSummary | null;
  updatedAt: string;
  intakeUpdatedAt: string;
  updatedBy: AdminActorSummary | null;
  /** Set when a status PATCH changed workflow status. */
  previousStatus?: string;
  statusChanged?: boolean;
}

interface AdminSubmissionRow {
  id: number;
  form_id: number;
  form_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact_method: string;
  overall_frequency: string;
  open_to_special_events: number;
  status: string;
  is_archived: number;
  serving_areas: string | null;
  availability: string | null;
  requires_background_check: number;
  requires_training: number;
  created_at: string;
  volunteer_self_updated_at: string | null;
  volunteer_update_review_needed: number;
}

interface AdminSubmissionDetailRow {
  id: number;
  organization_id: number;
  form_id: number;
  form_name: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  preferred_contact_method: string;
  overall_frequency: string;
  open_to_special_events: number;
  experience_notes: string | null;
  additional_notes: string | null;
  status: string;
  is_archived: number;
  planning_center_person_id: string | null;
  planning_center_synced_at: string | null;
  planning_center_synced_by_admin_user_id: number | null;
  updated_by_admin_user_id: number | null;
  updated_by_display_name: string | null;
  updated_by_email: string | null;
  pc_synced_by_display_name: string | null;
  pc_synced_by_email: string | null;
  created_at: string;
  updated_at: string;
  intake_updated_at: string | null;
  volunteer_self_updated_at: string | null;
  volunteer_update_review_needed: number;
  volunteer_update_reviewed_at: string | null;
  volunteer_update_reviewed_by_admin_user_id: number | null;
  volunteer_update_reviewed_by_display_name: string | null;
  volunteer_update_reviewed_by_email: string | null;
  availability: string | null;
}

interface AdminSubmissionInterestRow {
  id: number;
  serving_area_id: number;
  serving_area_name: string;
  uses_area_specific_frequency: number;
  area_specific_frequency: string | null;
  overall_frequency: string;
  requires_background_check: number;
  requires_training: number;
  experience_level: string | null;
  interest_notes: string | null;
}

interface AdminSubmissionConfirmationRow {
  serving_area_id: number;
  requirement_id: number;
  serving_area_name: string;
  label: string;
  confirmed: number;
}

interface AdminNoteRow {
  id: number;
  submission_id: number;
  admin_user_id: number;
  note: string;
  created_at: string;
}

export async function listAdminSubmissions(
  env: Env,
  filters: AdminSubmissionFilters
): Promise<AdminSubmissionListItem[]> {
  const conditions: string[] = [];
  const bindings: Array<string | number> = [];

  if (filters.organizationId) {
    conditions.push("vs.organization_id = ?");
    bindings.push(filters.organizationId);
  }

  if (filters.formId) {
    conditions.push("vs.form_id = ?");
    bindings.push(filters.formId);
  }

  if (filters.status) {
    if (filters.status === "requirements_pending") {
      const placeholders = requirementsPendingStatusFilterValues()
        .map(() => "?")
        .join(", ");
      conditions.push(`vs.status IN (${placeholders})`);
      bindings.push(...requirementsPendingStatusFilterValues());
    } else {
      conditions.push("vs.status = ?");
      bindings.push(filters.status);
    }
  }

  if (typeof filters.archived === "boolean") {
    conditions.push("vs.is_archived = ?");
    bindings.push(filters.archived ? 1 : 0);
  }

  if (filters.servingAreaId) {
    conditions.push(
      "EXISTS (SELECT 1 FROM volunteer_interests vi_filter WHERE vi_filter.submission_id = vs.id AND vi_filter.serving_area_id = ?)"
    );
    bindings.push(filters.servingAreaId);
  }

  if (filters.formSectionId) {
    conditions.push(
      `EXISTS (
        SELECT 1
        FROM volunteer_interests vi_section
        INNER JOIN serving_areas sa_section ON sa_section.id = vi_section.serving_area_id
        WHERE vi_section.submission_id = vs.id
          AND sa_section.section_id = ?
      )`
    );
    bindings.push(filters.formSectionId);
  }

  if (filters.search) {
    conditions.push(
      "(lower(vs.first_name) LIKE ? OR lower(vs.last_name) LIKE ? OR lower(vs.email) LIKE ? OR lower(vs.phone) LIKE ?)"
    );
    const searchValue = `%${filters.search.toLowerCase()}%`;
    bindings.push(searchValue, searchValue, searchValue, searchValue);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
  const result = await env.DB.prepare(
    `
    SELECT
      vs.id,
      vs.form_id,
      vf.name AS form_name,
      vs.first_name,
      vs.last_name,
      vs.email,
      vs.phone,
      vs.preferred_contact_method,
      vs.overall_frequency,
      vs.open_to_special_events,
      vs.status,
      vs.is_archived,
      vs.created_at,
      vs.volunteer_self_updated_at,
      vs.volunteer_update_review_needed,
      GROUP_CONCAT(DISTINCT COALESCE(sa.name, vi.serving_area_name)) AS serving_areas,
      GROUP_CONCAT(DISTINCT va.availability_key) AS availability,
      MAX(sa.requires_background_check) AS requires_background_check,
      MAX(sa.requires_training) AS requires_training
    FROM volunteer_submissions vs
    INNER JOIN volunteer_forms vf
      ON vf.id = vs.form_id
    LEFT JOIN volunteer_interests vi
      ON vi.submission_id = vs.id
    LEFT JOIN serving_areas sa
      ON sa.id = vi.serving_area_id
    LEFT JOIN volunteer_availability va
      ON va.submission_id = vs.id
    ${whereClause}
    GROUP BY vs.id
    ORDER BY vs.created_at DESC, vs.id DESC
    `
  )
    .bind(...bindings)
    .all<AdminSubmissionRow>();

  const rows = result.results ?? [];
  const staffNotesBySubmission = await listStaffNotesForSubmissions(
    env,
    rows.map((row) => row.id)
  );

  return rows.map((row) =>
    mapAdminSubmissionListItem(row, staffNotesBySubmission.get(row.id) ?? [])
  );
}

export async function getAdminSubmissionDetail(
  env: Env,
  submissionId: number,
  organizationId?: number
): Promise<AdminSubmissionDetail | null> {
  const organizationClause =
    typeof organizationId === "number" ? " AND vs.organization_id = ?" : "";
  const submission = await env.DB.prepare(
    `
    SELECT
      vs.id,
      vs.organization_id,
      vs.form_id,
      vf.name AS form_name,
      vs.first_name,
      vs.last_name,
      vs.email,
      vs.phone,
      vs.preferred_contact_method,
      vs.overall_frequency,
      vs.open_to_special_events,
      vs.experience_notes,
      vs.additional_notes,
      vs.status,
      vs.is_archived,
      vs.planning_center_person_id,
      vs.planning_center_synced_at,
      vs.planning_center_synced_by_admin_user_id,
      vs.updated_by_admin_user_id,
      updated_admin.display_name AS updated_by_display_name,
      updated_admin.email AS updated_by_email,
      pc_sync_admin.display_name AS pc_synced_by_display_name,
      pc_sync_admin.email AS pc_synced_by_email,
      vs.created_at,
      vs.updated_at,
      vs.intake_updated_at,
      vs.volunteer_self_updated_at,
      vs.volunteer_update_review_needed,
      vs.volunteer_update_reviewed_at,
      vs.volunteer_update_reviewed_by_admin_user_id,
      review_admin.display_name AS volunteer_update_reviewed_by_display_name,
      review_admin.email AS volunteer_update_reviewed_by_email,
      GROUP_CONCAT(DISTINCT va.availability_key) AS availability
    FROM volunteer_submissions vs
    INNER JOIN volunteer_forms vf
      ON vf.id = vs.form_id
    LEFT JOIN admin_users updated_admin
      ON updated_admin.id = vs.updated_by_admin_user_id
    LEFT JOIN admin_users review_admin
      ON review_admin.id = vs.volunteer_update_reviewed_by_admin_user_id
    LEFT JOIN admin_users pc_sync_admin
      ON pc_sync_admin.id = vs.planning_center_synced_by_admin_user_id
    LEFT JOIN volunteer_availability va
      ON va.submission_id = vs.id
    WHERE vs.id = ?${organizationClause}
    GROUP BY vs.id
    LIMIT 1
    `
  )
    .bind(
      ...(typeof organizationId === "number"
        ? [submissionId, organizationId]
        : [submissionId])
    )
    .first<AdminSubmissionDetailRow>();

  if (!submission) {
    return null;
  }

  const [interests, confirmations, adminNotes] = await Promise.all([
    listSubmissionInterests(env, submissionId),
    listRequirementConfirmations(env, submissionId),
    listAdminNotes(env, submissionId)
  ]);

  return {
    submission: {
      id: submission.id,
      organizationId: submission.organization_id,
      formId: submission.form_id,
      formName: submission.form_name,
      firstName: submission.first_name,
      lastName: submission.last_name,
      email: submission.email,
      phone: submission.phone,
      preferredContactMethod: submission.preferred_contact_method,
      overallFrequency: submission.overall_frequency,
      availability: splitGroupConcat(submission.availability),
      openToSpecialEvents: Boolean(submission.open_to_special_events),
      experienceNotes: submission.experience_notes,
      additionalNotes: submission.additional_notes,
      status: normalizeSubmissionStatus(submission.status),
      isArchived: Boolean(submission.is_archived),
      planningCenterPersonId: submission.planning_center_person_id ?? null,
      planningCenterSyncedAt: submission.planning_center_synced_at ?? null,
      planningCenterSyncedBy: mapAdminActorFromJoin(
        submission.planning_center_synced_by_admin_user_id,
        submission.pc_synced_by_display_name,
        submission.pc_synced_by_email
      ),
      createdAt: submission.created_at,
      updatedAt: submission.updated_at,
      updatedBy: mapAdminActorFromJoin(
        submission.updated_by_admin_user_id,
        submission.updated_by_display_name,
        submission.updated_by_email
      ),
      editedSinceLastPlanningCenterSync: isSubmissionEditedSincePlanningCenterSync({
        planningCenterPersonId: submission.planning_center_person_id ?? null,
        planningCenterSyncedAt: submission.planning_center_synced_at ?? null,
        intakeUpdatedAt:
          submission.intake_updated_at ?? submission.updated_at
      }),
      volunteerSelfUpdatedAt: submission.volunteer_self_updated_at ?? null,
      volunteerUpdateReviewNeeded: Boolean(submission.volunteer_update_review_needed),
      volunteerUpdateReviewedAt: submission.volunteer_update_reviewed_at ?? null,
      volunteerUpdateReviewedBy: mapAdminActorFromJoin(
        submission.volunteer_update_reviewed_by_admin_user_id,
        submission.volunteer_update_reviewed_by_display_name,
        submission.volunteer_update_reviewed_by_email
      )
    },
    interests,
    requirementConfirmations: confirmations,
    adminNotes
  };
}

async function listSubmissionInterests(
  env: Env,
  submissionId: number
): Promise<AdminSubmissionDetail["interests"]> {
  const result = await env.DB.prepare(
    `
    SELECT
      vi.id,
      vi.serving_area_id,
      COALESCE(vi.serving_area_name, sa.name) AS serving_area_name,
      vi.uses_area_specific_frequency,
      vi.area_specific_frequency,
      vs.overall_frequency,
      COALESCE(sa.requires_background_check, 0) AS requires_background_check,
      COALESCE(sa.requires_training, 0) AS requires_training,
      vi.experience_level,
      vi.interest_notes
    FROM volunteer_interests vi
    INNER JOIN volunteer_submissions vs
      ON vs.id = vi.submission_id
    LEFT JOIN serving_areas sa
      ON sa.id = vi.serving_area_id
    WHERE vi.submission_id = ?
    ORDER BY sa.sort_order ASC, serving_area_name ASC
    `
  )
    .bind(submissionId)
    .all<AdminSubmissionInterestRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    servingAreaId: row.serving_area_id,
    servingAreaName: row.serving_area_name,
    usesAreaSpecificFrequency: Boolean(row.uses_area_specific_frequency),
    areaSpecificFrequency: row.area_specific_frequency,
    effectiveFrequency: row.uses_area_specific_frequency
      ? row.area_specific_frequency ?? row.overall_frequency
      : row.overall_frequency,
    requiresBackgroundCheck: Boolean(row.requires_background_check),
    requiresTraining: Boolean(row.requires_training),
    experienceLevel: row.experience_level,
    interestNotes: row.interest_notes
  }));
}

async function listRequirementConfirmations(
  env: Env,
  submissionId: number
): Promise<AdminSubmissionDetail["requirementConfirmations"]> {
  const result = await env.DB.prepare(
    `
    SELECT
      vrc.serving_area_id,
      vrc.requirement_id,
      sa.name AS serving_area_name,
      sar.label,
      vrc.confirmed
    FROM volunteer_requirement_confirmations vrc
    INNER JOIN serving_areas sa
      ON sa.id = vrc.serving_area_id
    INNER JOIN serving_area_requirements sar
      ON sar.id = vrc.requirement_id
    WHERE vrc.submission_id = ?
    ORDER BY sa.sort_order ASC, sar.sort_order ASC
    `
  )
    .bind(submissionId)
    .all<AdminSubmissionConfirmationRow>();

  return (result.results ?? []).map((row) => ({
    servingAreaId: row.serving_area_id,
    requirementId: row.requirement_id,
    servingAreaName: row.serving_area_name,
    label: row.label,
    confirmed: Boolean(row.confirmed)
  }));
}

async function listStaffNotesForSubmissions(
  env: Env,
  submissionIds: number[]
): Promise<Map<number, AdminSubmissionStaffNote[]>> {
  const map = new Map<number, AdminSubmissionStaffNote[]>();

  if (submissionIds.length === 0) {
    return map;
  }

  const placeholders = submissionIds.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `
    SELECT id, submission_id, note, created_at
    FROM admin_notes
    WHERE submission_id IN (${placeholders})
    ORDER BY submission_id ASC, created_at ASC, id ASC
    `
  )
    .bind(...submissionIds)
    .all<AdminNoteRow>();

  for (const row of result.results ?? []) {
    const list = map.get(row.submission_id) ?? [];
    list.push({
      id: row.id,
      note: row.note,
      createdAt: row.created_at,
    });
    map.set(row.submission_id, list);
  }

  return map;
}

async function listAdminNotes(
  env: Env,
  submissionId: number
): Promise<AdminSubmissionDetail["adminNotes"]> {
  const result = await env.DB.prepare(
    `
    SELECT
      id,
      submission_id,
      admin_user_id,
      note,
      created_at
    FROM admin_notes
    WHERE submission_id = ?
    ORDER BY created_at ASC, id ASC
    `
  )
    .bind(submissionId)
    .all<AdminNoteRow>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    submissionId: row.submission_id,
    adminUserId: row.admin_user_id,
    note: row.note,
    createdAt: row.created_at
  }));
}

export async function touchSubmissionAdminActivity(
  env: Env,
  submissionId: number,
  organizationId: number,
  adminUserId: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `
    UPDATE volunteer_submissions
    SET
      updated_at = CURRENT_TIMESTAMP,
      updated_by_admin_user_id = ?
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(adminUserId, submissionId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function recordPlanningCenterSync(
  env: Env,
  submissionId: number,
  organizationId: number,
  input: RecordPlanningCenterSyncInput
): Promise<AdminSubmissionMutationResult | null> {
  const syncedAt = input.syncedAt ?? new Date().toISOString();

  const result = await env.DB.prepare(
    `
    UPDATE volunteer_submissions
    SET
      planning_center_person_id = ?,
      planning_center_synced_at = ?,
      planning_center_synced_by_admin_user_id = ?
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(
      input.planningCenterPersonId,
      syncedAt,
      input.syncedByAdminUserId,
      submissionId,
      organizationId
    )
    .run();

  if ((result.meta.changes ?? 0) === 0) {
    return null;
  }

  return getAdminSubmissionMutationResult(env, submissionId, organizationId);
}

export async function updateAdminSubmission(
  env: Env,
  submissionId: number,
  organizationId: number,
  input: UpdateAdminSubmissionInput,
  adminUserId: number
): Promise<AdminSubmissionMutationResult | null> {
  const existing = await env.DB.prepare(
    `
    SELECT id, status, is_archived
    FROM volunteer_submissions
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(submissionId, organizationId)
    .first<{
      id: number;
      status: string;
      is_archived: number;
    }>();

  if (!existing) {
    return null;
  }

  const status = input.status ?? existing.status;
  const isArchived =
    typeof input.isArchived === "boolean" ? input.isArchived : Boolean(existing.is_archived);
  const statusChanged = input.status !== undefined && input.status !== existing.status;
  const archiveChanged =
    input.isArchived !== undefined && isArchived !== Boolean(existing.is_archived);

  if (!statusChanged && !archiveChanged) {
    return getAdminSubmissionMutationResult(env, submissionId, organizationId);
  }

  await env.DB.prepare(
    `
    UPDATE volunteer_submissions
    SET
      status = ?,
      is_archived = ?,
      updated_at = CURRENT_TIMESTAMP,
      updated_by_admin_user_id = ?
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(status, isArchived ? 1 : 0, adminUserId, submissionId, organizationId)
    .run();

  const result = await getAdminSubmissionMutationResult(env, submissionId, organizationId);

  if (!result) {
    return null;
  }

  if (statusChanged) {
    return {
      ...result,
      previousStatus: existing.status,
      statusChanged: true
    };
  }

  return result;
}

async function getAdminSubmissionMutationResult(
  env: Env,
  submissionId: number,
  organizationId: number
): Promise<AdminSubmissionMutationResult | null> {
  const updated = await env.DB.prepare(
    `
    SELECT
      vs.id,
      vs.status,
      vs.is_archived,
      vs.planning_center_person_id,
      vs.planning_center_synced_at,
      vs.planning_center_synced_by_admin_user_id,
      vs.updated_at,
      vs.intake_updated_at,
      vs.updated_by_admin_user_id,
      updated_admin.display_name AS updated_by_display_name,
      updated_admin.email AS updated_by_email,
      pc_sync_admin.display_name AS pc_synced_by_display_name,
      pc_sync_admin.email AS pc_synced_by_email
    FROM volunteer_submissions vs
    LEFT JOIN admin_users updated_admin
      ON updated_admin.id = vs.updated_by_admin_user_id
    LEFT JOIN admin_users pc_sync_admin
      ON pc_sync_admin.id = vs.planning_center_synced_by_admin_user_id
    WHERE vs.id = ? AND vs.organization_id = ?
    LIMIT 1
    `
  )
    .bind(submissionId, organizationId)
    .first<{
      id: number;
      status: string;
      is_archived: number;
      planning_center_person_id: string | null;
      planning_center_synced_at: string | null;
      planning_center_synced_by_admin_user_id: number | null;
      updated_at: string;
      intake_updated_at: string | null;
      updated_by_admin_user_id: number | null;
      updated_by_display_name: string | null;
      updated_by_email: string | null;
      pc_synced_by_display_name: string | null;
      pc_synced_by_email: string | null;
    }>();

  if (!updated) {
    return null;
  }

  return {
    id: updated.id,
    status: normalizeSubmissionStatus(updated.status),
    isArchived: Boolean(updated.is_archived),
    planningCenterPersonId: updated.planning_center_person_id ?? null,
    planningCenterSyncedAt: updated.planning_center_synced_at ?? null,
    planningCenterSyncedBy: mapAdminActorFromJoin(
      updated.planning_center_synced_by_admin_user_id,
      updated.pc_synced_by_display_name,
      updated.pc_synced_by_email
    ),
    updatedAt: updated.updated_at,
    intakeUpdatedAt: updated.intake_updated_at ?? updated.updated_at,
    updatedBy: mapAdminActorFromJoin(
      updated.updated_by_admin_user_id,
      updated.updated_by_display_name,
      updated.updated_by_email
    )
  };
}

function parseStoredTimestamp(value: string): number {
  const trimmed = value.trim();

  if (!trimmed) {
    return Number.NaN;
  }

  if (trimmed.includes("T")) {
    return Date.parse(trimmed);
  }

  return Date.parse(`${trimmed.replace(" ", "T")}Z`);
}

export function isSubmissionEditedSincePlanningCenterSync(submission: {
  planningCenterPersonId: string | null;
  planningCenterSyncedAt: string | null;
  intakeUpdatedAt: string;
}): boolean {
  if (!submission.planningCenterPersonId?.trim() || !submission.planningCenterSyncedAt) {
    return false;
  }

  const syncMs = parseStoredTimestamp(submission.planningCenterSyncedAt);
  const intakeMs = parseStoredTimestamp(submission.intakeUpdatedAt);

  if (Number.isNaN(syncMs) || Number.isNaN(intakeMs)) {
    return false;
  }

  return intakeMs > syncMs;
}

function mapAdminActorFromJoin(
  adminUserId: number | null,
  displayName: string | null,
  email: string | null
): AdminActorSummary | null {
  if (!adminUserId || !email) {
    return null;
  }

  return {
    id: adminUserId,
    displayName: displayName?.trim() || email,
    email
  };
}

export async function deleteAdminSubmission(
  env: Env,
  submissionId: number,
  organizationId: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `
    DELETE FROM volunteer_submissions
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(submissionId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

function mapAdminSubmissionListItem(
  row: AdminSubmissionRow,
  staffNotes: AdminSubmissionStaffNote[]
): AdminSubmissionListItem {
  return {
    id: row.id,
    formId: row.form_id,
    formName: row.form_name,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    preferredContactMethod: row.preferred_contact_method,
    overallFrequency: row.overall_frequency,
    availability: splitGroupConcat(row.availability),
    openToSpecialEvents: Boolean(row.open_to_special_events),
    status: normalizeSubmissionStatus(row.status),
    isArchived: Boolean(row.is_archived),
    servingAreas: splitGroupConcat(row.serving_areas),
    requiresBackgroundCheck: Boolean(row.requires_background_check),
    requiresTraining: Boolean(row.requires_training),
    createdAt: row.created_at,
    volunteerSelfUpdatedAt: row.volunteer_self_updated_at ?? null,
    volunteerUpdateReviewNeeded: Boolean(row.volunteer_update_review_needed),
    staffNotes,
  };
}

export async function markVolunteerUpdateReviewed(
  env: Env,
  submissionId: number,
  organizationId: number,
  adminUserId: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `
    UPDATE volunteer_submissions
    SET
      volunteer_update_review_needed = 0,
      volunteer_update_reviewed_at = CURRENT_TIMESTAMP,
      volunteer_update_reviewed_by_admin_user_id = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND organization_id = ?
      AND is_archived = 0
      AND volunteer_update_review_needed = 1
    `
  )
    .bind(adminUserId, submissionId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

function splitGroupConcat(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(",").filter(Boolean);
}
