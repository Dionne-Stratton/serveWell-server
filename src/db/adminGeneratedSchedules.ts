import type { Env } from "../types";
import {
  listOccurrenceDatesForDayOfWeek
} from "../lib/scheduleOccurrenceDates";
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
  displayName: string;
  neededCount: number;
  assignedCount: number;
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
    const requirementsResult = await env.DB.prepare(
      `
      SELECT id, display_name, needed_count, assigned_count
      FROM generated_schedule_occurrence_requirements
      WHERE occurrence_id = ?
      ORDER BY display_name ASC, id ASC
      `
    )
      .bind(row.id)
      .all<{
        id: number;
        display_name: string;
        needed_count: number;
        assigned_count: number;
      }>();

    occurrences.push({
      id: row.id,
      occurrenceDate: row.occurrence_date,
      name: row.name,
      startTime: row.start_time,
      templateRhythmId: row.template_rhythm_id,
      requirements: (requirementsResult.results ?? []).map((req) => ({
        id: req.id,
        displayName: req.display_name,
        neededCount: req.needed_count,
        assignedCount: req.assigned_count
      }))
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
      SELECT srr.id, srr.needed_count, ssa.display_name
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
          template_rhythm_requirement_id
        )
        VALUES (?, ?, ?, ?, 0, ?)
        `
      )
        .bind(
          occurrenceId,
          organizationId,
          requirement.display_name,
          requirement.needed_count,
          requirement.id
        )
        .run();
    }
  }

  return getGeneratedScheduleDetail(env, organizationId, generatedScheduleId);
}
