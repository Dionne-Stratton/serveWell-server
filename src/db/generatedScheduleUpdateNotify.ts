import type { Env } from "../types";

export interface PublishedScheduleHeader {
  generatedScheduleId: number;
  organizationId: number;
  scheduleName: string;
  organizationSlug: string;
}

export interface OccurrenceEmailMeta {
  occurrenceId: number;
  occurrenceDate: string;
  occurrenceName: string;
  startTime: string;
}

export interface VolunteerContact {
  submissionId: number;
  firstName: string;
  email: string | null;
}

export interface AssignmentRemovalSnapshot {
  submissionId: number;
  requirementId: number;
  scheduleServingAreaId: number | null;
  servingAreaName: string;
  occurrence: OccurrenceEmailMeta;
}

export interface PriorScheduleAssignment {
  requirementId: number;
  occurrenceId: number;
  occurrenceDate: string;
  occurrenceName: string;
  startTime: string;
  scheduleServingAreaId: number | null;
  servingAreaName: string;
}

export async function getPublishedScheduleHeader(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<PublishedScheduleHeader | null> {
  const row = await env.DB.prepare(
    `
    SELECT gs.id, gs.name, gs.organization_id, o.slug AS organization_slug
    FROM generated_schedules gs
    INNER JOIN organizations o ON o.id = gs.organization_id
    WHERE gs.id = ? AND gs.organization_id = ? AND gs.status = 'published'
    LIMIT 1
    `
  )
    .bind(generatedScheduleId, organizationId)
    .first<{
      id: number;
      name: string;
      organization_id: number;
      organization_slug: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    generatedScheduleId: row.id,
    organizationId: row.organization_id,
    scheduleName: row.name,
    organizationSlug: row.organization_slug
  };
}

export async function getOccurrenceEmailMeta(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number
): Promise<OccurrenceEmailMeta | null> {
  const row = await env.DB.prepare(
    `
    SELECT gso.id, gso.occurrence_date, gso.name, gso.start_time
    FROM generated_schedule_occurrences gso
    INNER JOIN generated_schedules gs ON gs.id = gso.generated_schedule_id
    WHERE gso.id = ?
      AND gso.generated_schedule_id = ?
      AND gso.organization_id = ?
      AND gs.organization_id = ?
    LIMIT 1
    `
  )
    .bind(occurrenceId, generatedScheduleId, organizationId, organizationId)
    .first<{
      id: number;
      occurrence_date: string;
      name: string;
      start_time: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    occurrenceId: row.id,
    occurrenceDate: row.occurrence_date,
    occurrenceName: row.name,
    startTime: row.start_time
  };
}

export async function listAffectedSubmissionIdsForScope(
  env: Env,
  occurrenceId: number,
  scheduleServingAreaId: number | null
): Promise<number[]> {
  if (scheduleServingAreaId == null) {
    const result = await env.DB.prepare(
      `
      SELECT DISTINCT submission_id AS id
      FROM generated_schedule_occurrence_assignments
      WHERE occurrence_id = ?
      `
    )
      .bind(occurrenceId)
      .all<{ id: number }>();

    return (result.results ?? []).map((row) => row.id);
  }

  const result = await env.DB.prepare(
    `
    SELECT DISTINCT a.submission_id AS id
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN generated_schedule_occurrence_requirements greq ON greq.id = a.requirement_id
    WHERE a.occurrence_id = ?
      AND greq.schedule_serving_area_id = ?
    `
  )
    .bind(occurrenceId, scheduleServingAreaId)
    .all<{ id: number }>();

  return (result.results ?? []).map((row) => row.id);
}

export async function getVolunteerContact(
  env: Env,
  organizationId: number,
  submissionId: number
): Promise<VolunteerContact | null> {
  const row = await env.DB.prepare(
    `
    SELECT id, first_name, email
    FROM volunteer_submissions
    WHERE id = ? AND organization_id = ? AND is_archived = 0
    LIMIT 1
    `
  )
    .bind(submissionId, organizationId)
    .first<{ id: number; first_name: string; email: string | null }>();

  if (!row) {
    return null;
  }

  return {
    submissionId: row.id,
    firstName: row.first_name,
    email: row.email
  };
}

export async function loadAssignmentRemovalSnapshot(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  assignmentId: number
): Promise<AssignmentRemovalSnapshot | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      a.submission_id,
      a.requirement_id,
      greq.schedule_serving_area_id,
      greq.display_name AS serving_area_name,
      gso.occurrence_date,
      gso.name AS occurrence_name,
      gso.start_time,
      gso.id AS occurrence_id
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN generated_schedule_occurrence_requirements greq ON greq.id = a.requirement_id
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
    .first<{
      submission_id: number;
      requirement_id: number;
      schedule_serving_area_id: number | null;
      serving_area_name: string;
      occurrence_date: string;
      occurrence_name: string;
      start_time: string;
      occurrence_id: number;
    }>();

  if (!row) {
    return null;
  }

  return {
    submissionId: row.submission_id,
    requirementId: row.requirement_id,
    scheduleServingAreaId: row.schedule_serving_area_id,
    servingAreaName: row.serving_area_name,
    occurrence: {
      occurrenceId: row.occurrence_id,
      occurrenceDate: row.occurrence_date,
      occurrenceName: row.occurrence_name,
      startTime: row.start_time
    }
  };
}

export async function listPriorScheduleAssignmentsForSubmission(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  submissionId: number
): Promise<PriorScheduleAssignment[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      greq.id AS requirement_id,
      gso.id AS occurrence_id,
      gso.occurrence_date,
      gso.name AS occurrence_name,
      gso.start_time,
      greq.schedule_serving_area_id,
      greq.display_name AS serving_area_name
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN generated_schedule_occurrence_requirements greq ON greq.id = a.requirement_id
    INNER JOIN generated_schedule_occurrences gso ON gso.id = a.occurrence_id
    INNER JOIN generated_schedules gs ON gs.id = gso.generated_schedule_id
    WHERE a.submission_id = ?
      AND gs.id = ?
      AND a.organization_id = ?
      AND gs.organization_id = ?
    ORDER BY gso.occurrence_date ASC, gso.id ASC
    `
  )
    .bind(submissionId, generatedScheduleId, organizationId, organizationId)
    .all<{
      requirement_id: number;
      occurrence_id: number;
      occurrence_date: string;
      occurrence_name: string;
      start_time: string;
      schedule_serving_area_id: number | null;
      serving_area_name: string;
    }>();

  return (result.results ?? []).map((row) => ({
    requirementId: row.requirement_id,
    occurrenceId: row.occurrence_id,
    occurrenceDate: row.occurrence_date,
    occurrenceName: row.occurrence_name,
    startTime: row.start_time,
    scheduleServingAreaId: row.schedule_serving_area_id,
    servingAreaName: row.serving_area_name
  }));
}

export async function getVolunteerAssignmentOnOccurrence(
  env: Env,
  occurrenceId: number,
  submissionId: number
): Promise<{ servingAreaName: string } | null> {
  const row = await env.DB.prepare(
    `
    SELECT greq.display_name AS serving_area_name
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN generated_schedule_occurrence_requirements greq ON greq.id = a.requirement_id
    WHERE a.occurrence_id = ? AND a.submission_id = ?
    LIMIT 1
    `
  )
    .bind(occurrenceId, submissionId)
    .first<{ serving_area_name: string }>();

  if (!row) {
    return null;
  }

  return { servingAreaName: row.serving_area_name };
}

export async function getServingAreaDisplayName(
  env: Env,
  organizationId: number,
  scheduleServingAreaId: number
): Promise<string | null> {
  const row = await env.DB.prepare(
    `
    SELECT display_name
    FROM schedule_serving_areas
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(scheduleServingAreaId, organizationId)
    .first<{ display_name: string }>();

  return row?.display_name ?? null;
}

export interface OccurrenceNoteSnapshot {
  scheduleServingAreaId: number | null;
  note: string;
}

export async function loadOccurrenceNoteSnapshot(
  env: Env,
  organizationId: number,
  occurrenceId: number,
  noteId: number
): Promise<OccurrenceNoteSnapshot | null> {
  const row = await env.DB.prepare(
    `
    SELECT schedule_serving_area_id, note
    FROM generated_schedule_occurrence_notes
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(noteId, occurrenceId, organizationId)
    .first<{ schedule_serving_area_id: number | null; note: string }>();

  if (!row) {
    return null;
  }

  return {
    scheduleServingAreaId: row.schedule_serving_area_id,
    note: row.note
  };
}

export interface OccurrenceResourceSnapshot {
  id: number;
  scheduleServingAreaId: number | null;
  displayName: string | null;
  originalFilename: string;
}

export async function loadOccurrenceResourceSnapshot(
  env: Env,
  organizationId: number,
  occurrenceId: number,
  resourceId: number
): Promise<OccurrenceResourceSnapshot | null> {
  const row = await env.DB.prepare(
    `
    SELECT id, schedule_serving_area_id, display_name, original_filename
    FROM generated_schedule_occurrence_resources
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(resourceId, occurrenceId, organizationId)
    .first<{
      id: number;
      schedule_serving_area_id: number | null;
      display_name: string | null;
      original_filename: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    scheduleServingAreaId: row.schedule_serving_area_id,
    displayName: row.display_name,
    originalFilename: row.original_filename
  };
}

export function resourceDisplayLabel(snapshot: {
  displayName: string | null;
  originalFilename: string;
}): string {
  return snapshot.displayName?.trim() || snapshot.originalFilename;
}

export async function scopeWithDisplayName(
  env: Env,
  organizationId: number,
  scheduleServingAreaId: number | null
): Promise<{ scheduleServingAreaId: number | null; servingAreaDisplayName: string | null }> {
  if (scheduleServingAreaId == null) {
    return { scheduleServingAreaId: null, servingAreaDisplayName: null };
  }

  return {
    scheduleServingAreaId,
    servingAreaDisplayName: await getServingAreaDisplayName(
      env,
      organizationId,
      scheduleServingAreaId
    )
  };
}
