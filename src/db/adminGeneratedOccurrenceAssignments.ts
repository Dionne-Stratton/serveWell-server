import type { Env } from "../types";
import { schedulingReadyStatusSqlInList } from "../lib/submissionStatus";
import { volunteerWouldExceedFrequencyLimits } from "../scheduling/volunteerSchedulingEligibility";
import {
  countMonthAssignmentsInScheduleBySubmission,
  countScheduleAssignmentsBySubmission,
  loadOccurrenceRequirementSchedulingContext,
  loadOtherOccurrenceRoleNamesBySubmission,
  loadSchedulingProfilesBySubmissionId,
  volunteerHasOtherRoleOnOccurrence,
  volunteerIsBlackoutOnOccurrence
} from "../scheduling/manualOccurrenceAssignmentScheduling";

export interface OccurrenceVolunteerAssignment {
  id: number;
  submissionId: number;
  firstName: string;
  lastName: string;
  displayName: string;
}

export interface EligibleOccurrenceVolunteer {
  submissionId: number;
  firstName: string;
  lastName: string;
  displayName: string;
  frequencyLimitWarning?: boolean;
  multipleRolesOnOccurrenceWarning?: boolean;
  otherRolesOnOccurrence?: string[];
}

interface RequirementContext {
  requirementId: number;
  occurrenceId: number;
  generatedScheduleId: number;
  organizationId: number;
  scheduleServingAreaId: number | null;
  neededCount: number;
  assignedCount: number;
}

async function getRequirementContext(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  requirementId: number
): Promise<RequirementContext | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      greq.id AS requirement_id,
      greq.occurrence_id,
      greq.schedule_serving_area_id,
      greq.needed_count,
      greq.assigned_count,
      gso.generated_schedule_id
    FROM generated_schedule_occurrence_requirements greq
    INNER JOIN generated_schedule_occurrences gso ON gso.id = greq.occurrence_id
    INNER JOIN generated_schedules gs ON gs.id = gso.generated_schedule_id
    WHERE greq.id = ?
      AND greq.occurrence_id = ?
      AND gso.generated_schedule_id = ?
      AND greq.organization_id = ?
      AND gso.organization_id = ?
      AND gs.organization_id = ?
    LIMIT 1
    `
  )
    .bind(
      requirementId,
      occurrenceId,
      generatedScheduleId,
      organizationId,
      organizationId,
      organizationId
    )
    .first<{
      requirement_id: number;
      occurrence_id: number;
      schedule_serving_area_id: number | null;
      needed_count: number;
      assigned_count: number;
      generated_schedule_id: number;
    }>();

  if (!row) {
    return null;
  }

  return {
    requirementId: row.requirement_id,
    occurrenceId: row.occurrence_id,
    generatedScheduleId: row.generated_schedule_id,
    organizationId,
    scheduleServingAreaId: row.schedule_serving_area_id,
    neededCount: row.needed_count,
    assignedCount: row.assigned_count
  };
}

async function refreshRequirementAssignedCount(env: Env, requirementId: number): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE generated_schedule_occurrence_requirements
    SET assigned_count = (
      SELECT COUNT(*)
      FROM generated_schedule_occurrence_assignments
      WHERE requirement_id = ?
    )
    WHERE id = ?
    `
  )
    .bind(requirementId, requirementId)
    .run();
}

export async function loadOccurrenceAssignmentsByRequirement(
  env: Env,
  occurrenceId: number
): Promise<Map<number, OccurrenceVolunteerAssignment[]>> {
  const result = await env.DB.prepare(
    `
    SELECT
      a.id,
      a.requirement_id,
      a.submission_id,
      vs.first_name,
      vs.last_name
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN volunteer_submissions vs ON vs.id = a.submission_id
    WHERE a.occurrence_id = ?
    ORDER BY vs.last_name ASC, vs.first_name ASC, a.id ASC
    `
  )
    .bind(occurrenceId)
    .all<{
      id: number;
      requirement_id: number;
      submission_id: number;
      first_name: string;
      last_name: string;
    }>();

  const map = new Map<number, OccurrenceVolunteerAssignment[]>();

  for (const row of result.results ?? []) {
    const list = map.get(row.requirement_id) ?? [];
    list.push({
      id: row.id,
      submissionId: row.submission_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: `${row.first_name} ${row.last_name}`.trim()
    });
    map.set(row.requirement_id, list);
  }

  return map;
}

export async function listEligibleVolunteersForRequirement(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  requirementId: number
): Promise<EligibleOccurrenceVolunteer[] | null> {
  const schedulingContext = await loadOccurrenceRequirementSchedulingContext(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId,
    requirementId
  );

  if (!schedulingContext) {
    return null;
  }

  if (!schedulingContext.scheduleServingAreaId || !schedulingContext.servingAreaId) {
    return [];
  }

  const result = await env.DB.prepare(
    `
    SELECT DISTINCT
      vs.id AS submission_id,
      vs.first_name,
      vs.last_name
    FROM volunteer_submissions vs
    INNER JOIN volunteer_interests vi ON vi.submission_id = vs.id
    INNER JOIN schedule_serving_areas ssa ON ssa.id = ?
    INNER JOIN serving_areas sa ON sa.id = ssa.serving_area_id AND sa.id = vi.serving_area_id
    WHERE vs.organization_id = ?
      AND vs.is_archived = 0
      AND vs.status IN (${schedulingReadyStatusSqlInList()})
      AND ssa.organization_id = ?
      AND NOT EXISTS (
        SELECT 1
        FROM generated_schedule_occurrence_assignments a
        WHERE a.requirement_id = ?
          AND a.submission_id = vs.id
      )
    ORDER BY vs.last_name ASC, vs.first_name ASC, vs.id ASC
    `
  )
    .bind(
      schedulingContext.scheduleServingAreaId,
      organizationId,
      organizationId,
      requirementId
    )
    .all<{
      submission_id: number;
      first_name: string;
      last_name: string;
    }>();

  const rows = result.results ?? [];

  if (rows.length === 0) {
    return [];
  }

  const submissionIds = rows.map((row) => row.submission_id);
  const profiles = await loadSchedulingProfilesBySubmissionId(env, organizationId, submissionIds);
  const assignmentsInSchedule = await countScheduleAssignmentsBySubmission(
    env,
    generatedScheduleId,
    submissionIds
  );
  const assignmentsInMonth = await countMonthAssignmentsInScheduleBySubmission(
    env,
    generatedScheduleId,
    schedulingContext.occurrenceDate,
    submissionIds
  );
  const otherRolesBySubmission = await loadOtherOccurrenceRoleNamesBySubmission(
    env,
    schedulingContext.occurrenceId,
    schedulingContext.requirementId,
    submissionIds
  );

  const volunteers: EligibleOccurrenceVolunteer[] = [];

  for (const row of rows) {
    const profile = profiles.get(row.submission_id);

    if (!profile) {
      continue;
    }

    if (volunteerIsBlackoutOnOccurrence(profile, schedulingContext.occurrenceDate)) {
      continue;
    }

    const frequencyLimitWarning = volunteerWouldExceedFrequencyLimits(profile, {
      servingAreaId: schedulingContext.servingAreaId,
      scheduleStartDate: schedulingContext.scheduleStartDate,
      scheduleEndDate: schedulingContext.scheduleEndDate,
      assignmentsInSchedule: assignmentsInSchedule.get(row.submission_id) ?? 0,
      assignmentsInMonth: assignmentsInMonth.get(row.submission_id) ?? 0
    });

    const otherRoles = otherRolesBySubmission.get(row.submission_id) ?? [];
    const multipleRolesOnOccurrenceWarning = otherRoles.length > 0;

    volunteers.push({
      submissionId: row.submission_id,
      firstName: row.first_name,
      lastName: row.last_name,
      displayName: `${row.first_name} ${row.last_name}`.trim(),
      ...(frequencyLimitWarning ? { frequencyLimitWarning: true } : {}),
      ...(multipleRolesOnOccurrenceWarning
        ? {
            multipleRolesOnOccurrenceWarning: true,
            otherRolesOnOccurrence: otherRoles
          }
        : {})
    });
  }

  return volunteers;
}

export type CreateOccurrenceAssignmentResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "NOT_FOUND"
        | "FULL"
        | "INELIGIBLE"
        | "DUPLICATE"
        | "INVALID_BODY"
        | "BLACKOUT_DATE"
        | "FREQUENCY_LIMIT_REQUIRES_CONFIRMATION"
        | "MULTIPLE_ROLES_ON_OCCURRENCE_REQUIRES_CONFIRMATION";
    };

export interface CreateOccurrenceAssignmentOptions {
  confirmFrequencyOverride?: boolean;
  confirmMultipleRolesOnOccurrence?: boolean;
}

export async function createOccurrenceAssignment(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  requirementId: number,
  submissionId: number,
  options: CreateOccurrenceAssignmentOptions = {}
): Promise<CreateOccurrenceAssignmentResult> {
  if (!Number.isInteger(submissionId) || submissionId < 1) {
    return { ok: false, code: "INVALID_BODY" };
  }

  const context = await getRequirementContext(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId,
    requirementId
  );

  if (!context) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const currentCount = await env.DB.prepare(
    `
    SELECT COUNT(*) AS count
    FROM generated_schedule_occurrence_assignments
    WHERE requirement_id = ?
    `
  )
    .bind(requirementId)
    .first<{ count: number }>();

  if ((currentCount?.count ?? 0) >= context.neededCount) {
    return { ok: false, code: "FULL" };
  }

  const duplicate = await env.DB.prepare(
    `
    SELECT id
    FROM generated_schedule_occurrence_assignments
    WHERE requirement_id = ? AND submission_id = ?
    LIMIT 1
    `
  )
    .bind(requirementId, submissionId)
    .first<{ id: number }>();

  if (duplicate) {
    return { ok: false, code: "DUPLICATE" };
  }

  if (!context.scheduleServingAreaId) {
    return { ok: false, code: "INELIGIBLE" };
  }

  const eligible = await env.DB.prepare(
    `
    SELECT vs.id
    FROM volunteer_submissions vs
    INNER JOIN volunteer_interests vi ON vi.submission_id = vs.id
    INNER JOIN schedule_serving_areas ssa ON ssa.id = ?
    INNER JOIN serving_areas sa ON sa.id = ssa.serving_area_id AND sa.id = vi.serving_area_id
    WHERE vs.id = ?
      AND vs.organization_id = ?
      AND vs.is_archived = 0
      AND vs.status IN (${schedulingReadyStatusSqlInList()})
    LIMIT 1
    `
  )
    .bind(context.scheduleServingAreaId, submissionId, organizationId)
    .first<{ id: number }>();

  if (!eligible) {
    return { ok: false, code: "INELIGIBLE" };
  }

  const schedulingContext = await loadOccurrenceRequirementSchedulingContext(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId,
    requirementId
  );

  if (!schedulingContext?.servingAreaId) {
    return { ok: false, code: "INELIGIBLE" };
  }

  const profiles = await loadSchedulingProfilesBySubmissionId(env, organizationId, [submissionId]);
  const profile = profiles.get(submissionId);

  if (!profile) {
    return { ok: false, code: "INELIGIBLE" };
  }

  if (volunteerIsBlackoutOnOccurrence(profile, schedulingContext.occurrenceDate)) {
    return { ok: false, code: "BLACKOUT_DATE" };
  }

  const hasOtherRoleOnOccurrence = await volunteerHasOtherRoleOnOccurrence(
    env,
    occurrenceId,
    requirementId,
    submissionId
  );

  if (hasOtherRoleOnOccurrence && !options.confirmMultipleRolesOnOccurrence) {
    return { ok: false, code: "MULTIPLE_ROLES_ON_OCCURRENCE_REQUIRES_CONFIRMATION" };
  }

  const assignmentsInSchedule = await countScheduleAssignmentsBySubmission(
    env,
    generatedScheduleId,
    [submissionId]
  );
  const assignmentsInMonth = await countMonthAssignmentsInScheduleBySubmission(
    env,
    generatedScheduleId,
    schedulingContext.occurrenceDate,
    [submissionId]
  );

  const exceedsFrequency = volunteerWouldExceedFrequencyLimits(profile, {
    servingAreaId: schedulingContext.servingAreaId,
    scheduleStartDate: schedulingContext.scheduleStartDate,
    scheduleEndDate: schedulingContext.scheduleEndDate,
    assignmentsInSchedule: assignmentsInSchedule.get(submissionId) ?? 0,
    assignmentsInMonth: assignmentsInMonth.get(submissionId) ?? 0
  });

  if (exceedsFrequency && !options.confirmFrequencyOverride) {
    return { ok: false, code: "FREQUENCY_LIMIT_REQUIRES_CONFIRMATION" };
  }

  await env.DB.prepare(
    `
    INSERT INTO generated_schedule_occurrence_assignments (
      organization_id,
      occurrence_id,
      requirement_id,
      submission_id
    )
    VALUES (?, ?, ?, ?)
    `
  )
    .bind(organizationId, occurrenceId, requirementId, submissionId)
    .run();

  await refreshRequirementAssignedCount(env, requirementId);

  return { ok: true };
}

export type DeleteOccurrenceAssignmentResult =
  | { ok: true }
  | { ok: false; code: "NOT_FOUND" };

export async function deleteOccurrenceAssignment(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  assignmentId: number
): Promise<DeleteOccurrenceAssignmentResult> {
  const row = await env.DB.prepare(
    `
    SELECT a.id, a.requirement_id
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN generated_schedule_occurrences gso ON gso.id = a.occurrence_id
    INNER JOIN generated_schedules gs ON gs.id = gso.generated_schedule_id
    WHERE a.id = ?
      AND a.occurrence_id = ?
      AND gso.generated_schedule_id = ?
      AND a.organization_id = ?
      AND gso.organization_id = ?
      AND gs.organization_id = ?
    LIMIT 1
    `
  )
    .bind(
      assignmentId,
      occurrenceId,
      generatedScheduleId,
      organizationId,
      organizationId,
      organizationId
    )
    .first<{ id: number; requirement_id: number }>();

  if (!row) {
    return { ok: false, code: "NOT_FOUND" };
  }

  await env.DB.prepare(
    `
    DELETE FROM generated_schedule_occurrence_assignments
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(assignmentId, organizationId)
    .run();

  await refreshRequirementAssignedCount(env, row.requirement_id);

  return { ok: true };
}
