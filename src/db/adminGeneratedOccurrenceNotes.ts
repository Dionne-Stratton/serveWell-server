import type { Env } from "../types";

export interface GeneratedOccurrenceNote {
  id: number;
  scheduleServingAreaId: number | null;
  servingAreaDisplayName: string | null;
  note: string;
  createdAt: string;
  updatedAt: string;
}

interface OccurrenceNoteContext {
  occurrenceId: number;
  generatedScheduleId: number;
  scheduleTemplateId: number;
  allowedServingAreaIds: Set<number>;
}

async function getOccurrenceNoteContext(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number
): Promise<OccurrenceNoteContext | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      gso.id AS occurrence_id,
      gso.generated_schedule_id,
      gs.schedule_template_id
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
      occurrence_id: number;
      generated_schedule_id: number;
      schedule_template_id: number;
    }>();

  if (!row) {
    return null;
  }

  const requirementAreas = await env.DB.prepare(
    `
    SELECT DISTINCT schedule_serving_area_id AS id
    FROM generated_schedule_occurrence_requirements
    WHERE occurrence_id = ?
      AND organization_id = ?
      AND schedule_serving_area_id IS NOT NULL
    `
  )
    .bind(occurrenceId, organizationId)
    .all<{ id: number }>();

  const allowedServingAreaIds = new Set<number>();

  for (const area of requirementAreas.results ?? []) {
    allowedServingAreaIds.add(area.id);
  }

  return {
    occurrenceId: row.occurrence_id,
    generatedScheduleId: row.generated_schedule_id,
    scheduleTemplateId: row.schedule_template_id,
    allowedServingAreaIds
  };
}

function assertServingAreaAllowed(
  context: OccurrenceNoteContext,
  scheduleServingAreaId: number | null
): boolean {
  if (scheduleServingAreaId == null) {
    return true;
  }

  return context.allowedServingAreaIds.has(scheduleServingAreaId);
}

export async function listGeneratedOccurrenceNotes(
  env: Env,
  organizationId: number,
  occurrenceId: number
): Promise<GeneratedOccurrenceNote[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      n.id,
      n.schedule_serving_area_id,
      n.note,
      n.created_at,
      n.updated_at,
      ssa.display_name
    FROM generated_schedule_occurrence_notes n
    LEFT JOIN schedule_serving_areas ssa ON ssa.id = n.schedule_serving_area_id
    WHERE n.occurrence_id = ? AND n.organization_id = ?
    ORDER BY
      CASE WHEN n.schedule_serving_area_id IS NULL THEN 0 ELSE 1 END,
      ssa.display_name ASC,
      n.created_at ASC,
      n.id ASC
    `
  )
    .bind(occurrenceId, organizationId)
    .all<{
      id: number;
      schedule_serving_area_id: number | null;
      note: string;
      created_at: string;
      updated_at: string;
      display_name: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    scheduleServingAreaId: row.schedule_serving_area_id,
    servingAreaDisplayName: row.display_name,
    note: row.note,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export type MutateOccurrenceNoteResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "invalid_serving_area" }
  | { status: "note_not_found" };

export async function createGeneratedOccurrenceNote(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  input: { note: string; scheduleServingAreaId: number | null }
): Promise<MutateOccurrenceNoteResult> {
  const context = await getOccurrenceNoteContext(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId
  );

  if (!context) {
    return { status: "not_found" };
  }

  if (!assertServingAreaAllowed(context, input.scheduleServingAreaId)) {
    return { status: "invalid_serving_area" };
  }

  await env.DB.prepare(
    `
    INSERT INTO generated_schedule_occurrence_notes (
      organization_id,
      occurrence_id,
      schedule_serving_area_id,
      note
    )
    VALUES (?, ?, ?, ?)
    `
  )
    .bind(
      organizationId,
      occurrenceId,
      input.scheduleServingAreaId,
      input.note
    )
    .run();

  return { status: "ok" };
}

export async function updateGeneratedOccurrenceNote(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  noteId: number,
  input: { note: string; scheduleServingAreaId: number | null }
): Promise<MutateOccurrenceNoteResult> {
  const context = await getOccurrenceNoteContext(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId
  );

  if (!context) {
    return { status: "not_found" };
  }

  if (!assertServingAreaAllowed(context, input.scheduleServingAreaId)) {
    return { status: "invalid_serving_area" };
  }

  const existing = await env.DB.prepare(
    `
    SELECT id
    FROM generated_schedule_occurrence_notes
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(noteId, occurrenceId, organizationId)
    .first<{ id: number }>();

  if (!existing) {
    return { status: "note_not_found" };
  }

  await env.DB.prepare(
    `
    UPDATE generated_schedule_occurrence_notes
    SET note = ?,
        schedule_serving_area_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    `
  )
    .bind(input.note, input.scheduleServingAreaId, noteId, occurrenceId, organizationId)
    .run();

  return { status: "ok" };
}

export async function deleteGeneratedOccurrenceNote(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  noteId: number
): Promise<MutateOccurrenceNoteResult> {
  const context = await getOccurrenceNoteContext(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId
  );

  if (!context) {
    return { status: "not_found" };
  }

  const result = await env.DB.prepare(
    `
    DELETE FROM generated_schedule_occurrence_notes
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    `
  )
    .bind(noteId, occurrenceId, organizationId)
    .run();

  if (!result.meta.changes) {
    return { status: "note_not_found" };
  }

  return { status: "ok" };
}
