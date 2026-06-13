import type { Env } from "../types";
import {
  listOccurrenceDatesForDayOfWeek
} from "../lib/scheduleOccurrenceDates";
import type { OccurrenceVolunteerAssignment } from "./adminGeneratedOccurrenceAssignments";
import { loadOccurrenceAssignmentsByRequirement } from "./adminGeneratedOccurrenceAssignments";
import type { OccurrenceStaffingRequirementInput } from "../validation/generatedOccurrenceStaffing";
import type { ValidatedGeneratedScheduleRange } from "../validation/generatedSchedules";

export interface GeneratedScheduleListItem {
  id: number;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  scheduleTemplateId: number;
  templateName: string;
  templateScheduleType: string;
  occurrenceCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface GeneratedScheduleOccurrenceRequirement {
  id: number;
  scheduleServingAreaId: number | null;
  displayName: string;
  neededCount: number;
  assignedCount: number;
  assignments: OccurrenceVolunteerAssignment[];
}

export interface TemplateServingAreaOption {
  id: number;
  displayName: string;
}

export interface GeneratedScheduleOccurrenceDetail {
  id: number;
  generatedScheduleId: number;
  scheduleTemplateId: number;
  occurrenceDate: string;
  name: string;
  startTime: string;
  templateRhythmId: number;
  requirements: GeneratedScheduleOccurrenceRequirement[];
  templateServingAreas: TemplateServingAreaOption[];
}

export interface GeneratedScheduleOccurrence {
  id: number;
  occurrenceDate: string;
  name: string;
  startTime: string;
  templateRhythmId: number;
  requirements: GeneratedScheduleOccurrenceRequirement[];
}

export interface GeneratedScheduleDetail {
  id: number;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  scheduleTemplateId: number;
  templateName: string;
  templateScheduleType: string;
  createdAt: string;
  updatedAt: string;
  occurrences: GeneratedScheduleOccurrence[];
}

export async function listGeneratedSchedules(
  env: Env,
  organizationId: number
): Promise<GeneratedScheduleListItem[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      gs.id,
      gs.name,
      gs.status,
      gs.start_date,
      gs.end_date,
      gs.schedule_template_id,
      gs.created_at,
      gs.updated_at,
      s.name AS template_name,
      s.schedule_type AS template_schedule_type,
      (
        SELECT COUNT(*)
        FROM generated_schedule_occurrences gso
        WHERE gso.generated_schedule_id = gs.id
      ) AS occurrence_count
    FROM generated_schedules gs
    INNER JOIN schedules s ON s.id = gs.schedule_template_id
    WHERE gs.organization_id = ?
    ORDER BY gs.start_date ASC, gs.id ASC
    `
  )
    .bind(organizationId)
    .all<{
      id: number;
      name: string;
      status: string;
      start_date: string;
      end_date: string;
      schedule_template_id: number;
      created_at: string;
      updated_at: string;
      template_name: string;
      template_schedule_type: string;
      occurrence_count: number;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    scheduleTemplateId: row.schedule_template_id,
    templateName: row.template_name,
    templateScheduleType: row.template_schedule_type,
    occurrenceCount: row.occurrence_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function getGeneratedScheduleDetail(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<GeneratedScheduleDetail | null> {
  const header = await env.DB.prepare(
    `
    SELECT
      gs.id,
      gs.name,
      gs.status,
      gs.start_date,
      gs.end_date,
      gs.schedule_template_id,
      gs.created_at,
      gs.updated_at,
      s.name AS template_name,
      s.schedule_type AS template_schedule_type
    FROM generated_schedules gs
    INNER JOIN schedules s ON s.id = gs.schedule_template_id
    WHERE gs.id = ? AND gs.organization_id = ?
    LIMIT 1
    `
  )
    .bind(generatedScheduleId, organizationId)
    .first<{
      id: number;
      name: string;
      status: string;
      start_date: string;
      end_date: string;
      schedule_template_id: number;
      created_at: string;
      updated_at: string;
      template_name: string;
      template_schedule_type: string;
    }>();

  if (!header) {
    return null;
  }

  const occurrencesResult = await env.DB.prepare(
    `
    SELECT id, occurrence_date, name, start_time, template_rhythm_id, sort_order
    FROM generated_schedule_occurrences
    WHERE generated_schedule_id = ?
    ORDER BY occurrence_date ASC, sort_order ASC, id ASC
    `
  )
    .bind(generatedScheduleId)
    .all<{
      id: number;
      occurrence_date: string;
      name: string;
      start_time: string;
      template_rhythm_id: number;
      sort_order: number;
    }>();

  const occurrences: GeneratedScheduleOccurrence[] = [];

  for (const row of occurrencesResult.results ?? []) {
    const requirements = await loadOccurrenceRequirements(env, row.id);

    occurrences.push({
      id: row.id,
      occurrenceDate: row.occurrence_date,
      name: row.name,
      startTime: row.start_time,
      templateRhythmId: row.template_rhythm_id,
      requirements
    });
  }

  return {
    id: header.id,
    name: header.name,
    status: header.status,
    startDate: header.start_date,
    endDate: header.end_date,
    scheduleTemplateId: header.schedule_template_id,
    templateName: header.template_name,
    templateScheduleType: header.template_schedule_type,
    createdAt: header.created_at,
    updatedAt: header.updated_at,
    occurrences
  };
}

interface TemplateRhythmRow {
  id: number;
  name: string;
  day_of_week: string;
  start_time: string;
  sort_order: number;
}

interface RhythmRequirementRow {
  id: number;
  needed_count: number;
  display_name: string;
  schedule_serving_area_id: number;
}

export async function createGeneratedScheduleFromTemplate(
  env: Env,
  organizationId: number,
  range: ValidatedGeneratedScheduleRange
): Promise<GeneratedScheduleDetail | null> {
  const template = await env.DB.prepare(
    `
    SELECT id, name, schedule_type
    FROM schedules
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(range.scheduleTemplateId, organizationId)
    .first<{
      id: number;
      name: string;
      schedule_type: string;
    }>();

  if (!template) {
    return null;
  }

  const rhythmsResult = await env.DB.prepare(
    `
    SELECT id, name, day_of_week, start_time, sort_order
    FROM schedule_rhythms
    WHERE schedule_id = ?
    ORDER BY sort_order ASC, id ASC
    `
  )
    .bind(template.id)
    .all<TemplateRhythmRow>();

  const rhythms = rhythmsResult.results ?? [];

  if (rhythms.length === 0) {
    throw new Error("NO_RHYTHMS");
  }

  const plannedOccurrences: Array<{
    rhythm: TemplateRhythmRow;
    occurrenceDate: string;
    sortOrder: number;
  }> = [];

  for (const rhythm of rhythms) {
    const dates = listOccurrenceDatesForDayOfWeek(
      range.startDate,
      range.endDate,
      rhythm.day_of_week
    );

    for (const occurrenceDate of dates) {
      plannedOccurrences.push({
        rhythm,
        occurrenceDate,
        sortOrder: rhythm.sort_order
      });
    }
  }

  if (plannedOccurrences.length === 0) {
    throw new Error("NO_OCCURRENCES");
  }

  plannedOccurrences.sort((a, b) => {
    if (a.occurrenceDate !== b.occurrenceDate) {
      return a.occurrenceDate < b.occurrenceDate ? -1 : 1;
    }

    return a.sortOrder - b.sortOrder;
  });

  const requirementsByRhythm = new Map<number, RhythmRequirementRow[]>();

  for (const rhythm of rhythms) {
    const reqResult = await env.DB.prepare(
      `
      SELECT srr.id, srr.needed_count, ssa.display_name, srr.schedule_serving_area_id
      FROM schedule_rhythm_requirements srr
      INNER JOIN schedule_serving_areas ssa ON ssa.id = srr.schedule_serving_area_id
      WHERE srr.rhythm_id = ?
      ORDER BY ssa.display_name ASC, srr.id ASC
      `
    )
      .bind(rhythm.id)
      .all<RhythmRequirementRow>();

    requirementsByRhythm.set(rhythm.id, reqResult.results ?? []);
  }

  const name = range.name.trim();

  const insertSchedule = await env.DB.prepare(
    `
    INSERT INTO generated_schedules (
      organization_id,
      schedule_template_id,
      name,
      status,
      start_date,
      end_date
    )
    VALUES (?, ?, ?, 'draft', ?, ?)
    `
  )
    .bind(
      organizationId,
      template.id,
      name,
      range.startDate,
      range.endDate
    )
    .run();

  const generatedScheduleId = insertSchedule.meta.last_row_id;

  if (!generatedScheduleId) {
    return null;
  }

  let sortIndex = 0;

  for (const planned of plannedOccurrences) {
    const occurrenceInsert = await env.DB.prepare(
      `
      INSERT INTO generated_schedule_occurrences (
        generated_schedule_id,
        organization_id,
        template_rhythm_id,
        occurrence_date,
        name,
        start_time,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        generatedScheduleId,
        organizationId,
        planned.rhythm.id,
        planned.occurrenceDate,
        planned.rhythm.name,
        planned.rhythm.start_time,
        sortIndex
      )
      .run();

    sortIndex += 1;

    const occurrenceId = occurrenceInsert.meta.last_row_id;

    if (!occurrenceId) {
      continue;
    }

    const requirements = requirementsByRhythm.get(planned.rhythm.id) ?? [];

    for (const requirement of requirements) {
      await env.DB.prepare(
        `
        INSERT INTO generated_schedule_occurrence_requirements (
          occurrence_id,
          organization_id,
          display_name,
          needed_count,
          assigned_count,
          template_rhythm_requirement_id,
          schedule_serving_area_id
        )
        VALUES (?, ?, ?, ?, 0, ?, ?)
        `
      )
        .bind(
          occurrenceId,
          organizationId,
          requirement.display_name,
          requirement.needed_count,
          requirement.id,
          requirement.schedule_serving_area_id
        )
        .run();
    }
  }

  return getGeneratedScheduleDetail(env, organizationId, generatedScheduleId);
}

async function listTemplateServingAreaOptions(
  env: Env,
  organizationId: number,
  scheduleTemplateId: number
): Promise<TemplateServingAreaOption[]> {
  const result = await env.DB.prepare(
    `
    SELECT id, display_name
    FROM schedule_serving_areas
    WHERE schedule_id = ? AND organization_id = ?
    ORDER BY display_name ASC, id ASC
    `
  )
    .bind(scheduleTemplateId, organizationId)
    .all<{ id: number; display_name: string }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    displayName: row.display_name
  }));
}

async function loadOccurrenceRequirements(
  env: Env,
  occurrenceId: number
): Promise<GeneratedScheduleOccurrenceRequirement[]> {
  const requirementsResult = await env.DB.prepare(
    `
    SELECT id, schedule_serving_area_id, display_name, needed_count, assigned_count
    FROM generated_schedule_occurrence_requirements
    WHERE occurrence_id = ?
    ORDER BY display_name ASC, id ASC
    `
  )
    .bind(occurrenceId)
    .all<{
      id: number;
      schedule_serving_area_id: number | null;
      display_name: string;
      needed_count: number;
      assigned_count: number;
    }>();

  const assignmentsByRequirement = await loadOccurrenceAssignmentsByRequirement(env, occurrenceId);

  return (requirementsResult.results ?? []).map((req) => {
    const assignments = assignmentsByRequirement.get(req.id) ?? [];
    const assignedCount = assignments.length;

    return {
      id: req.id,
      scheduleServingAreaId: req.schedule_serving_area_id,
      displayName: req.display_name,
      neededCount: req.needed_count,
      assignedCount,
      assignments
    };
  });
}

export async function getGeneratedScheduleOccurrenceDetail(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number
): Promise<GeneratedScheduleOccurrenceDetail | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      gso.id,
      gso.generated_schedule_id,
      gso.occurrence_date,
      gso.name,
      gso.start_time,
      gso.template_rhythm_id,
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
      id: number;
      generated_schedule_id: number;
      occurrence_date: string;
      name: string;
      start_time: string;
      template_rhythm_id: number;
      schedule_template_id: number;
    }>();

  if (!row) {
    return null;
  }

  const [requirements, templateServingAreas] = await Promise.all([
    loadOccurrenceRequirements(env, row.id),
    listTemplateServingAreaOptions(env, organizationId, row.schedule_template_id)
  ]);

  return {
    id: row.id,
    generatedScheduleId: row.generated_schedule_id,
    scheduleTemplateId: row.schedule_template_id,
    occurrenceDate: row.occurrence_date,
    name: row.name,
    startTime: row.start_time,
    templateRhythmId: row.template_rhythm_id,
    requirements,
    templateServingAreas
  };
}

export type ReplaceOccurrenceStaffingResult =
  | { ok: true; occurrence: GeneratedScheduleOccurrenceDetail }
  | { ok: false; code: "NOT_FOUND" | "INVALID_SERVING_AREA" | "INVALID_REQUIREMENT_ID" | "NEEDED_BELOW_ASSIGNED" };

export async function replaceGeneratedScheduleOccurrenceStaffing(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  requirementsInput: OccurrenceStaffingRequirementInput[]
): Promise<ReplaceOccurrenceStaffingResult> {
  const occurrence = await getGeneratedScheduleOccurrenceDetail(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId
  );

  if (!occurrence) {
    return { ok: false, code: "NOT_FOUND" };
  }

  const allowedAreaIds = new Set(occurrence.templateServingAreas.map((area) => area.id));
  const displayNameByAreaId = new Map(
    occurrence.templateServingAreas.map((area) => [area.id, area.displayName])
  );

  for (const req of requirementsInput) {
    if (!allowedAreaIds.has(req.scheduleServingAreaId)) {
      return { ok: false, code: "INVALID_SERVING_AREA" };
    }
  }

  const existingById = new Map(occurrence.requirements.map((req) => [req.id, req]));
  const payloadIds = new Set<number>();

  for (const req of requirementsInput) {
    if (req.id !== undefined) {
      const existing = existingById.get(req.id);

      if (!existing) {
        return { ok: false, code: "INVALID_REQUIREMENT_ID" };
      }

      if (req.neededCount < existing.assignedCount) {
        return { ok: false, code: "NEEDED_BELOW_ASSIGNED" };
      }

      payloadIds.add(req.id);
    }
  }

  const toDelete = occurrence.requirements.filter((req) => !payloadIds.has(req.id));

  const statements = [];

  for (const req of toDelete) {
    statements.push(
      env.DB.prepare(
        `
        DELETE FROM generated_schedule_occurrence_requirements
        WHERE id = ? AND occurrence_id = ? AND organization_id = ?
        `
      ).bind(req.id, occurrenceId, organizationId)
    );
  }

  for (const req of requirementsInput) {
    const displayName = displayNameByAreaId.get(req.scheduleServingAreaId) ?? "Serving area";

    if (req.id !== undefined) {
      statements.push(
        env.DB.prepare(
          `
          UPDATE generated_schedule_occurrence_requirements
          SET
            schedule_serving_area_id = ?,
            display_name = ?,
            needed_count = ?
          WHERE id = ? AND occurrence_id = ? AND organization_id = ?
          `
        ).bind(
          req.scheduleServingAreaId,
          displayName,
          req.neededCount,
          req.id,
          occurrenceId,
          organizationId
        )
      );
    } else {
      statements.push(
        env.DB.prepare(
          `
          INSERT INTO generated_schedule_occurrence_requirements (
            occurrence_id,
            organization_id,
            display_name,
            needed_count,
            assigned_count,
            template_rhythm_requirement_id,
            schedule_serving_area_id
          )
          VALUES (?, ?, ?, ?, 0, NULL, ?)
          `
        ).bind(
          occurrenceId,
          organizationId,
          displayName,
          req.neededCount,
          req.scheduleServingAreaId
        )
      );
    }
  }

  if (statements.length > 0) {
    await env.DB.batch(statements);
  }

  await env.DB.prepare(
    `
    UPDATE generated_schedule_occurrences
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(occurrenceId, organizationId)
    .run();

  const updated = await getGeneratedScheduleOccurrenceDetail(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId
  );

  if (!updated) {
    return { ok: false, code: "NOT_FOUND" };
  }

  return { ok: true, occurrence: updated };
}

export async function deleteGeneratedSchedule(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `
    DELETE FROM generated_schedules
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(generatedScheduleId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
