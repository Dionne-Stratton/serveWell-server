import type { Env } from "../types";

export interface AdminSubmissionListItem {
  id: number;
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
}

export interface AdminSubmissionDetail {
  submission: {
    id: number;
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
    createdAt: string;
    updatedAt: string;
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
  status?: string;
  archived?: boolean;
  servingAreaId?: number;
  search?: string;
}

interface AdminSubmissionRow {
  id: number;
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
}

interface AdminSubmissionDetailRow {
  id: number;
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
  created_at: string;
  updated_at: string;
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

  if (filters.status) {
    conditions.push("vs.status = ?");
    bindings.push(filters.status);
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
      GROUP_CONCAT(DISTINCT sa.name) AS serving_areas,
      GROUP_CONCAT(DISTINCT va.availability_key) AS availability,
      MAX(sa.requires_background_check) AS requires_background_check,
      MAX(sa.requires_training) AS requires_training
    FROM volunteer_submissions vs
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

  return (result.results ?? []).map(mapAdminSubmissionListItem);
}

export async function getAdminSubmissionDetail(
  env: Env,
  submissionId: number
): Promise<AdminSubmissionDetail | null> {
  const submission = await env.DB.prepare(
    `
    SELECT
      vs.id,
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
      vs.created_at,
      vs.updated_at,
      GROUP_CONCAT(DISTINCT va.availability_key) AS availability
    FROM volunteer_submissions vs
    LEFT JOIN volunteer_availability va
      ON va.submission_id = vs.id
    WHERE vs.id = ?
    GROUP BY vs.id
    LIMIT 1
    `
  )
    .bind(submissionId)
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
      status: submission.status,
      isArchived: Boolean(submission.is_archived),
      createdAt: submission.created_at,
      updatedAt: submission.updated_at
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
      sa.name AS serving_area_name,
      vi.uses_area_specific_frequency,
      vi.area_specific_frequency,
      vs.overall_frequency,
      sa.requires_background_check,
      sa.requires_training,
      vi.experience_level,
      vi.interest_notes
    FROM volunteer_interests vi
    INNER JOIN volunteer_submissions vs
      ON vs.id = vi.submission_id
    INNER JOIN serving_areas sa
      ON sa.id = vi.serving_area_id
    WHERE vi.submission_id = ?
    ORDER BY sa.sort_order ASC, sa.name ASC
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
    requirementId: row.requirement_id,
    servingAreaName: row.serving_area_name,
    label: row.label,
    confirmed: Boolean(row.confirmed)
  }));
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

function mapAdminSubmissionListItem(row: AdminSubmissionRow): AdminSubmissionListItem {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    preferredContactMethod: row.preferred_contact_method,
    overallFrequency: row.overall_frequency,
    availability: splitGroupConcat(row.availability),
    openToSpecialEvents: Boolean(row.open_to_special_events),
    status: row.status,
    isArchived: Boolean(row.is_archived),
    servingAreas: splitGroupConcat(row.serving_areas),
    requiresBackgroundCheck: Boolean(row.requires_background_check),
    requiresTraining: Boolean(row.requires_training),
    createdAt: row.created_at
  };
}

function splitGroupConcat(value: string | null): string[] {
  if (!value) {
    return [];
  }

  return value.split(",").filter(Boolean);
}
