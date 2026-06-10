import type { Env } from "../types";

export interface VolunteerInterestInput {
  servingAreaId: number;
  usesAreaSpecificFrequency: boolean;
  areaSpecificFrequency: string | null;
  experienceLevel: string | null;
  interestNotes: string | null;
}

export interface RequirementConfirmationInput {
  servingAreaId: number;
  requirementId: number;
  confirmed: boolean;
}

export interface SubmissionBlackoutDateInput {
  startDate: string;
  endDate: string;
  note: string | null;
}

export interface CreateVolunteerSubmissionInput {
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
  interests: VolunteerInterestInput[];
  requirementConfirmations: RequirementConfirmationInput[];
  blackoutDates: SubmissionBlackoutDateInput[];
}

export interface VolunteerSubmissionScope {
  organizationId: number;
  formId: number;
}

interface InsertMeta {
  last_row_id?: number;
  lastRowId?: number;
}

export async function createVolunteerSubmission(
  env: Env,
  input: CreateVolunteerSubmissionInput,
  scope: VolunteerSubmissionScope
): Promise<number> {
  const insertSubmission = await env.DB.prepare(
    `
    INSERT INTO volunteer_submissions (
      organization_id,
      form_id,
      first_name,
      last_name,
      email,
      phone,
      preferred_contact_method,
      overall_frequency,
      open_to_special_events,
      experience_notes,
      additional_notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      scope.organizationId,
      scope.formId,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.preferredContactMethod,
      input.overallFrequency,
      input.openToSpecialEvents ? 1 : 0,
      input.experienceNotes,
      input.additionalNotes
    )
    .run();

  const meta = insertSubmission.meta as InsertMeta;
  const submissionId = meta.last_row_id ?? meta.lastRowId;

  if (typeof submissionId !== "number") {
    throw new Error("D1 did not return a submission id.");
  }

  await insertVolunteerSubmissionChildren(env, submissionId, scope, input);
  return submissionId;
}

export async function replaceVolunteerSubmissionContent(
  env: Env,
  submissionId: number,
  organizationId: number,
  formId: number,
  input: CreateVolunteerSubmissionInput,
  adminUserId: number
): Promise<boolean> {
  const update = await env.DB.prepare(
    `
    UPDATE volunteer_submissions
    SET
      first_name = ?,
      last_name = ?,
      email = ?,
      phone = ?,
      preferred_contact_method = ?,
      overall_frequency = ?,
      open_to_special_events = ?,
      experience_notes = ?,
      additional_notes = ?,
      updated_at = CURRENT_TIMESTAMP,
      intake_updated_at = CURRENT_TIMESTAMP,
      updated_by_admin_user_id = ?
    WHERE id = ? AND organization_id = ? AND form_id = ?
    `
  )
    .bind(
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.preferredContactMethod,
      input.overallFrequency,
      input.openToSpecialEvents ? 1 : 0,
      input.experienceNotes,
      input.additionalNotes,
      adminUserId,
      submissionId,
      organizationId,
      formId
    )
    .run();

  if ((update.meta.changes ?? 0) === 0) {
    return false;
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM volunteer_interests WHERE submission_id = ?`).bind(submissionId),
    env.DB.prepare(`DELETE FROM volunteer_availability WHERE submission_id = ?`).bind(submissionId),
    env.DB.prepare(`DELETE FROM volunteer_requirement_confirmations WHERE submission_id = ?`).bind(
      submissionId
    ),
    env.DB.prepare(`DELETE FROM submission_blackout_dates WHERE submission_id = ?`).bind(
      submissionId
    )
  ]);

  const scope: VolunteerSubmissionScope = { organizationId, formId };
  await insertVolunteerSubmissionChildren(env, submissionId, scope, input);
  return true;
}

export async function replaceVolunteerSubmissionByVolunteer(
  env: Env,
  submissionId: number,
  organizationId: number,
  formId: number,
  input: CreateVolunteerSubmissionInput
): Promise<boolean> {
  const update = await env.DB.prepare(
    `
    UPDATE volunteer_submissions
    SET
      first_name = ?,
      last_name = ?,
      email = ?,
      phone = ?,
      preferred_contact_method = ?,
      overall_frequency = ?,
      open_to_special_events = ?,
      experience_notes = ?,
      additional_notes = ?,
      volunteer_self_updated_at = CURRENT_TIMESTAMP,
      volunteer_update_review_needed = 1,
      volunteer_update_reviewed_at = NULL,
      volunteer_update_reviewed_by_admin_user_id = NULL,
      updated_at = CURRENT_TIMESTAMP,
      intake_updated_at = CURRENT_TIMESTAMP,
      updated_by_admin_user_id = NULL
    WHERE id = ? AND organization_id = ? AND form_id = ? AND is_archived = 0
    `
  )
    .bind(
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.preferredContactMethod,
      input.overallFrequency,
      input.openToSpecialEvents ? 1 : 0,
      input.experienceNotes,
      input.additionalNotes,
      submissionId,
      organizationId,
      formId
    )
    .run();

  if ((update.meta.changes ?? 0) === 0) {
    return false;
  }

  await env.DB.batch([
    env.DB.prepare(`DELETE FROM volunteer_interests WHERE submission_id = ?`).bind(submissionId),
    env.DB.prepare(`DELETE FROM volunteer_availability WHERE submission_id = ?`).bind(submissionId),
    env.DB.prepare(`DELETE FROM volunteer_requirement_confirmations WHERE submission_id = ?`).bind(
      submissionId
    ),
    env.DB.prepare(`DELETE FROM submission_blackout_dates WHERE submission_id = ?`).bind(
      submissionId
    )
  ]);

  const scope: VolunteerSubmissionScope = { organizationId, formId };
  await insertVolunteerSubmissionChildren(env, submissionId, scope, input);
  return true;
}

async function insertVolunteerSubmissionChildren(
  env: Env,
  submissionId: number,
  scope: VolunteerSubmissionScope,
  input: CreateVolunteerSubmissionInput
): Promise<void> {
  const areaNameById = await loadServingAreaNames(
    env,
    input.interests.map((interest) => interest.servingAreaId)
  );

  const relatedStatements = [
    ...input.interests.map((interest) =>
      env.DB.prepare(
        `
        INSERT INTO volunteer_interests (
          organization_id,
          form_id,
          submission_id,
          serving_area_id,
          serving_area_name,
          uses_area_specific_frequency,
          area_specific_frequency,
          interest_notes,
          experience_level
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `
      ).bind(
        scope.organizationId,
        scope.formId,
        submissionId,
        interest.servingAreaId,
        areaNameById.get(interest.servingAreaId) ?? null,
        interest.usesAreaSpecificFrequency ? 1 : 0,
        interest.areaSpecificFrequency,
        interest.interestNotes,
        interest.experienceLevel
      )
    ),
    ...input.availability.map((availabilityKey) =>
      env.DB.prepare(
        `
        INSERT INTO volunteer_availability (
          organization_id,
          form_id,
          submission_id,
          availability_key,
          label
        ) VALUES (?, ?, ?, ?, ?)
        `
      ).bind(
        scope.organizationId,
        scope.formId,
        submissionId,
        availabilityKey,
        availabilityLabel(availabilityKey)
      )
    ),
    ...input.requirementConfirmations.map((confirmation) =>
      env.DB.prepare(
        `
        INSERT INTO volunteer_requirement_confirmations (
          organization_id,
          form_id,
          submission_id,
          serving_area_id,
          requirement_id,
          confirmed
        ) VALUES (?, ?, ?, ?, ?, ?)
        `
      ).bind(
        scope.organizationId,
        scope.formId,
        submissionId,
        confirmation.servingAreaId,
        confirmation.requirementId,
        confirmation.confirmed ? 1 : 0
      )
    ),
    ...input.blackoutDates.map((blackout) =>
      env.DB.prepare(
        `
        INSERT INTO submission_blackout_dates (
          submission_id,
          start_date,
          end_date,
          note
        ) VALUES (?, ?, ?, ?)
        `
      ).bind(submissionId, blackout.startDate, blackout.endDate, blackout.note)
    )
  ];

  if (relatedStatements.length > 0) {
    await env.DB.batch(relatedStatements);
  }
}

async function loadServingAreaNames(
  env: Env,
  servingAreaIds: number[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const uniqueIds = [...new Set(servingAreaIds)];

  if (uniqueIds.length === 0) {
    return map;
  }

  const placeholders = uniqueIds.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `SELECT id, name FROM serving_areas WHERE id IN (${placeholders})`
  )
    .bind(...uniqueIds)
    .all<{ id: number; name: string }>();

  for (const row of result.results ?? []) {
    map.set(row.id, row.name);
  }

  return map;
}

function availabilityLabel(availabilityKey: string): string {
  const labels: Record<string, string> = {
    sunday_morning: "Sunday morning",
    tuesday_night: "Tuesday night",
    wednesday_night: "Wednesday night",
    special_events: "Special events",
    other: "Other"
  };

  return labels[availabilityKey] ?? availabilityKey;
}
