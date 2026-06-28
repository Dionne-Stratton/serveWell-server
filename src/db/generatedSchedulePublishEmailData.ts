import type { Env } from "../types";

export interface GeneratedSchedulePublishHeader {
  generatedScheduleId: number;
  organizationId: number;
  scheduleName: string;
  startDate: string;
  endDate: string;
  organizationSlug: string;
}

export interface GeneratedSchedulePublishAssignmentRow {
  submissionId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  requirementId: number;
  occurrenceId: number;
  occurrenceDate: string;
  occurrenceName: string;
  startTime: string;
  servingAreaName: string;
  scheduleServingAreaId: number | null;
}

interface OccurrenceNotesBucket {
  general: string[];
  byArea: Map<number, string[]>;
}

interface OccurrenceResourcesBucket {
  general: PublishEmailResourceItem[];
  byArea: Map<number, PublishEmailResourceItem[]>;
}

export interface PublishEmailResourceItem {
  id: number;
  label: string;
}

export interface GeneratedSchedulePublishEmailData {
  header: GeneratedSchedulePublishHeader;
  assignments: GeneratedSchedulePublishAssignmentRow[];
  notesByOccurrence: Map<number, OccurrenceNotesBucket>;
  resourcesByOccurrence: Map<number, OccurrenceResourcesBucket>;
}

function emptyNotesBucket(): OccurrenceNotesBucket {
  return { general: [], byArea: new Map() };
}

function emptyResourcesBucket(): OccurrenceResourcesBucket {
  return { general: [], byArea: new Map() };
}

export async function loadGeneratedSchedulePublishEmailData(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<GeneratedSchedulePublishEmailData | null> {
  const headerRow = await env.DB.prepare(
    `
    SELECT
      gs.id,
      gs.organization_id,
      gs.name,
      gs.start_date,
      gs.end_date,
      o.slug AS organization_slug
    FROM generated_schedules gs
    INNER JOIN organizations o ON o.id = gs.organization_id
    WHERE gs.id = ? AND gs.organization_id = ?
    LIMIT 1
    `
  )
    .bind(generatedScheduleId, organizationId)
    .first<{
      id: number;
      organization_id: number;
      name: string;
      start_date: string;
      end_date: string;
      organization_slug: string;
    }>();

  if (!headerRow) {
    return null;
  }

  const assignmentResult = await env.DB.prepare(
    `
    SELECT
      vs.id AS submission_id,
      vs.first_name,
      vs.last_name,
      vs.email,
      gso.id AS occurrence_id,
      gso.occurrence_date,
      gso.name AS occurrence_name,
      gso.start_time,
      greq.id AS requirement_id,
      greq.schedule_serving_area_id,
      greq.display_name AS serving_area_name
    FROM generated_schedule_occurrence_assignments a
    INNER JOIN volunteer_submissions vs ON vs.id = a.submission_id
    INNER JOIN generated_schedule_occurrence_requirements greq ON greq.id = a.requirement_id
    INNER JOIN generated_schedule_occurrences gso ON gso.id = a.occurrence_id
    INNER JOIN generated_schedules gs ON gs.id = gso.generated_schedule_id
    WHERE gs.id = ?
      AND gs.organization_id = ?
      AND vs.organization_id = ?
    ORDER BY gso.occurrence_date ASC, gso.sort_order ASC, gso.id ASC, greq.display_name ASC, a.id ASC
    `
  )
    .bind(generatedScheduleId, organizationId, organizationId)
    .all<{
      submission_id: number;
      first_name: string;
      last_name: string;
      email: string | null;
      occurrence_id: number;
      occurrence_date: string;
      occurrence_name: string;
      start_time: string;
      requirement_id: number;
      schedule_serving_area_id: number | null;
      serving_area_name: string;
    }>();

  const notesResult = await env.DB.prepare(
    `
    SELECT n.occurrence_id, n.schedule_serving_area_id, n.note
    FROM generated_schedule_occurrence_notes n
    INNER JOIN generated_schedule_occurrences gso ON gso.id = n.occurrence_id
    WHERE gso.generated_schedule_id = ?
      AND n.organization_id = ?
    ORDER BY n.id ASC
    `
  )
    .bind(generatedScheduleId, organizationId)
    .all<{
      occurrence_id: number;
      schedule_serving_area_id: number | null;
      note: string;
    }>();

  const resourcesResult = await env.DB.prepare(
    `
    SELECT
      r.id,
      r.occurrence_id,
      r.schedule_serving_area_id,
      r.display_name,
      r.original_filename
    FROM generated_schedule_occurrence_resources r
    INNER JOIN generated_schedule_occurrences gso ON gso.id = r.occurrence_id
    WHERE gso.generated_schedule_id = ?
      AND r.organization_id = ?
    ORDER BY r.id ASC
    `
  )
    .bind(generatedScheduleId, organizationId)
    .all<{
      id: number;
      occurrence_id: number;
      schedule_serving_area_id: number | null;
      display_name: string | null;
      original_filename: string;
    }>();

  const notesByOccurrence = new Map<number, OccurrenceNotesBucket>();
  const resourcesByOccurrence = new Map<number, OccurrenceResourcesBucket>();

  for (const row of notesResult.results ?? []) {
    const bucket = notesByOccurrence.get(row.occurrence_id) ?? emptyNotesBucket();
    const text = row.note.trim();

    if (!text) {
      continue;
    }

    if (!row.schedule_serving_area_id) {
      bucket.general.push(text);
    } else {
      const list = bucket.byArea.get(row.schedule_serving_area_id) ?? [];
      list.push(text);
      bucket.byArea.set(row.schedule_serving_area_id, list);
    }

    notesByOccurrence.set(row.occurrence_id, bucket);
  }

  for (const row of resourcesResult.results ?? []) {
    const bucket = resourcesByOccurrence.get(row.occurrence_id) ?? emptyResourcesBucket();
    const label = row.display_name?.trim() || row.original_filename;
    const item: PublishEmailResourceItem = { id: row.id, label };

    if (!row.schedule_serving_area_id) {
      bucket.general.push(item);
    } else {
      const list = bucket.byArea.get(row.schedule_serving_area_id) ?? [];
      list.push(item);
      bucket.byArea.set(row.schedule_serving_area_id, list);
    }

    resourcesByOccurrence.set(row.occurrence_id, bucket);
  }

  const assignments: GeneratedSchedulePublishAssignmentRow[] = (
    assignmentResult.results ?? []
  ).map((row) => ({
    submissionId: row.submission_id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    requirementId: row.requirement_id,
    occurrenceId: row.occurrence_id,
    occurrenceDate: row.occurrence_date,
    occurrenceName: row.occurrence_name,
    startTime: row.start_time,
    servingAreaName: row.serving_area_name,
    scheduleServingAreaId: row.schedule_serving_area_id
  }));

  return {
    header: {
      generatedScheduleId: headerRow.id,
      organizationId: headerRow.organization_id,
      scheduleName: headerRow.name,
      startDate: headerRow.start_date,
      endDate: headerRow.end_date,
      organizationSlug: headerRow.organization_slug
    },
    assignments,
    notesByOccurrence,
    resourcesByOccurrence
  };
}
