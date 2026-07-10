import type { Env } from "../types";
import { volunteerHasAvailabilityForRhythm } from "./availabilityForRhythm";
import { calendarMonthKey } from "../scheduling/volunteerSchedulingEligibility";
import {
  isDateInBlackout,
  loadVolunteerSchedulingProfiles,
  type VolunteerSchedulingProfile
} from "../scheduling/volunteerSchedulingProfiles";

export interface OccurrenceRequirementSchedulingContext {
  requirementId: number;
  occurrenceId: number;
  generatedScheduleId: number;
  organizationId: number;
  scheduleServingAreaId: number | null;
  servingAreaId: number | null;
  occurrenceDate: string;
  rhythmDayOfWeek: string;
  scheduleStartDate: string;
  scheduleEndDate: string;
  neededCount: number;
  assignedCount: number;
}

export async function loadOccurrenceRequirementSchedulingContext(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  requirementId: number
): Promise<OccurrenceRequirementSchedulingContext | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      greq.id AS requirement_id,
      greq.occurrence_id,
      greq.schedule_serving_area_id,
      greq.needed_count,
      greq.assigned_count,
      gso.generated_schedule_id,
      gso.occurrence_date,
      sr.day_of_week AS rhythm_day_of_week,
      gs.start_date AS schedule_start_date,
      gs.end_date AS schedule_end_date,
      ssa.serving_area_id
    FROM generated_schedule_occurrence_requirements greq
    INNER JOIN generated_schedule_occurrences gso ON gso.id = greq.occurrence_id
    INNER JOIN generated_schedules gs ON gs.id = gso.generated_schedule_id
    INNER JOIN schedule_rhythms sr ON sr.id = gso.template_rhythm_id
    LEFT JOIN schedule_serving_areas ssa ON ssa.id = greq.schedule_serving_area_id
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
      occurrence_date: string;
      rhythm_day_of_week: string;
      schedule_start_date: string;
      schedule_end_date: string;
      serving_area_id: number | null;
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
    servingAreaId: row.serving_area_id,
    occurrenceDate: row.occurrence_date,
    rhythmDayOfWeek: row.rhythm_day_of_week,
    scheduleStartDate: row.schedule_start_date,
    scheduleEndDate: row.schedule_end_date,
    neededCount: row.needed_count,
    assignedCount: row.assigned_count
  };
}

export async function countScheduleAssignmentsBySubmission(
  env: Env,
  generatedScheduleId: number,
  submissionIds: number[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();

  if (submissionIds.length === 0) {
    return counts;
  }

  const placeholders = submissionIds.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `
    SELECT a.submission_id, COUNT(*) AS assignment_count
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN generated_schedule_occurrences gso ON gso.id = a.occurrence_id
    WHERE gso.generated_schedule_id = ?
      AND a.submission_id IN (${placeholders})
    GROUP BY a.submission_id
    `
  )
    .bind(generatedScheduleId, ...submissionIds)
    .all<{ submission_id: number; assignment_count: number }>();

  for (const row of result.results ?? []) {
    counts.set(row.submission_id, row.assignment_count);
  }

  return counts;
}

export async function countMonthAssignmentsInScheduleBySubmission(
  env: Env,
  generatedScheduleId: number,
  occurrenceDate: string,
  submissionIds: number[]
): Promise<Map<number, number>> {
  const counts = new Map<number, number>();
  const monthKey = calendarMonthKey(occurrenceDate);

  if (submissionIds.length === 0) {
    return counts;
  }

  const placeholders = submissionIds.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `
    SELECT a.submission_id, COUNT(*) AS assignment_count
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN generated_schedule_occurrences gso ON gso.id = a.occurrence_id
    WHERE gso.generated_schedule_id = ?
      AND substr(gso.occurrence_date, 1, 7) = ?
      AND a.submission_id IN (${placeholders})
    GROUP BY a.submission_id
    `
  )
    .bind(generatedScheduleId, monthKey, ...submissionIds)
    .all<{ submission_id: number; assignment_count: number }>();

  for (const row of result.results ?? []) {
    counts.set(row.submission_id, row.assignment_count);
  }

  return counts;
}

export async function loadSchedulingProfilesBySubmissionId(
  env: Env,
  organizationId: number,
  submissionIds: number[]
): Promise<Map<number, VolunteerSchedulingProfile>> {
  const all = await loadVolunteerSchedulingProfiles(env, organizationId);
  const filtered = new Map<number, VolunteerSchedulingProfile>();

  for (const id of submissionIds) {
    const profile = all.get(id);

    if (profile) {
      filtered.set(id, profile);
    }
  }

  return filtered;
}

export function volunteerIsBlackoutOnOccurrence(
  profile: VolunteerSchedulingProfile,
  occurrenceDate: string
): boolean {
  return isDateInBlackout(profile.blackoutRanges, occurrenceDate);
}

export function volunteerIsAvailableForOccurrenceRhythm(
  profile: VolunteerSchedulingProfile,
  rhythmDayOfWeek: string
): boolean {
  return volunteerHasAvailabilityForRhythm(profile.availabilityKeys, rhythmDayOfWeek);
}

/** Other staffing rows on the same event (not the current requirement). */
export async function loadOtherOccurrenceRoleNamesBySubmission(
  env: Env,
  occurrenceId: number,
  excludeRequirementId: number,
  submissionIds: number[]
): Promise<Map<number, string[]>> {
  const bySubmission = new Map<number, string[]>();

  if (submissionIds.length === 0) {
    return bySubmission;
  }

  const placeholders = submissionIds.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `
    SELECT a.submission_id, greq.display_name
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN generated_schedule_occurrence_requirements greq ON greq.id = a.requirement_id
    WHERE a.occurrence_id = ?
      AND a.requirement_id != ?
      AND a.submission_id IN (${placeholders})
    ORDER BY greq.display_name ASC, greq.id ASC
    `
  )
    .bind(occurrenceId, excludeRequirementId, ...submissionIds)
    .all<{ submission_id: number; display_name: string }>();

  for (const row of result.results ?? []) {
    const list = bySubmission.get(row.submission_id) ?? [];
    list.push(row.display_name);
    bySubmission.set(row.submission_id, list);
  }

  return bySubmission;
}

export async function volunteerHasOtherRoleOnOccurrence(
  env: Env,
  occurrenceId: number,
  excludeRequirementId: number,
  submissionId: number
): Promise<boolean> {
  const row = await env.DB.prepare(
    `
    SELECT id
    FROM generated_schedule_occurrence_assignments
    WHERE occurrence_id = ?
      AND requirement_id != ?
      AND submission_id = ?
    LIMIT 1
    `
  )
    .bind(occurrenceId, excludeRequirementId, submissionId)
    .first<{ id: number }>();

  return Boolean(row);
}
