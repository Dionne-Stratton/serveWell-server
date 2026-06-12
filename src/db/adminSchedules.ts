import type { Env } from "../types";
import type {
  CreateScheduleInput,
  CreateScheduleServingAreaInput,
  UpdateScheduleRhythmInput
} from "../validation/schedules";
import { servingAreaKey } from "../validation/schedules";

export interface AdminScheduleListItem {
  id: number;
  name: string;
  scheduleType: string;
  rhythmCount: number;
  servingAreaCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleServingAreaCatalogForm {
  id: number;
  name: string;
  slug: string;
  servingAreas: Array<{
    id: number;
    name: string;
    category: string;
    isActive: boolean;
  }>;
}

export interface AdminScheduleDetail {
  id: number;
  name: string;
  scheduleType: string;
  createdAt: string;
  updatedAt: string;
  servingAreas: Array<{
    id: number;
    servingAreaId: number | null;
    formId: number | null;
    customName: string | null;
    displayName: string;
  }>;
  rhythms: Array<{
    id: number;
    name: string;
    dayOfWeek: string;
    startTime: string;
    requirements: Array<{
      id: number;
      scheduleServingAreaId: number;
      displayName: string;
      neededCount: number;
    }>;
  }>;
}

export async function listAdminSchedules(
  env: Env,
  organizationId: number
): Promise<AdminScheduleListItem[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      s.id,
      s.name,
      s.schedule_type,
      s.created_at,
      s.updated_at,
      (
        SELECT COUNT(*)
        FROM schedule_rhythms sr
        WHERE sr.schedule_id = s.id
      ) AS rhythm_count,
      (
        SELECT COUNT(*)
        FROM schedule_serving_areas ssa
        WHERE ssa.schedule_id = s.id
      ) AS serving_area_count
    FROM schedules s
    WHERE s.organization_id = ?
    ORDER BY s.created_at DESC, s.id DESC
    `
  )
    .bind(organizationId)
    .all<{
      id: number;
      name: string;
      schedule_type: string;
      created_at: string;
      updated_at: string;
      rhythm_count: number;
      serving_area_count: number;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    scheduleType: row.schedule_type,
    rhythmCount: row.rhythm_count,
    servingAreaCount: row.serving_area_count,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export async function listScheduleServingAreaCatalog(
  env: Env,
  organizationId: number
): Promise<ScheduleServingAreaCatalogForm[]> {
  const formsResult = await env.DB.prepare(
    `
    SELECT id, slug, name
    FROM volunteer_forms
    WHERE organization_id = ?
      AND is_active = 1
    ORDER BY is_default DESC, name ASC, id ASC
    `
  )
    .bind(organizationId)
    .all<{ id: number; slug: string; name: string }>();

  const forms = formsResult.results ?? [];

  if (forms.length === 0) {
    return [];
  }

  const placeholders = forms.map(() => "?").join(", ");
  const areasResult = await env.DB.prepare(
    `
    SELECT
      id,
      form_id,
      name,
      category,
      is_active
    FROM serving_areas
    WHERE organization_id = ?
      AND form_id IN (${placeholders})
      AND is_active = 1
    ORDER BY sort_order ASC, name ASC, id ASC
    `
  )
    .bind(organizationId, ...forms.map((form) => form.id))
    .all<{
      id: number;
      form_id: number;
      name: string;
      category: string;
      is_active: number;
    }>();

  const areasByForm = new Map<number, ScheduleServingAreaCatalogForm["servingAreas"]>();

  for (const area of areasResult.results ?? []) {
    const list = areasByForm.get(area.form_id) ?? [];
    list.push({
      id: area.id,
      name: area.name,
      category: area.category,
      isActive: Boolean(area.is_active)
    });
    areasByForm.set(area.form_id, list);
  }

  return forms.map((form) => ({
    id: form.id,
    name: form.name,
    slug: form.slug,
    servingAreas: areasByForm.get(form.id) ?? []
  }));
}

export async function createAdminSchedule(
  env: Env,
  organizationId: number,
  input: CreateScheduleInput
): Promise<AdminScheduleDetail | null> {
  const linkedIds = input.servingAreas
    .map((row) => row.servingAreaId)
    .filter((id): id is number => id !== null);

  const areaMeta = new Map<number, { name: string; formId: number }>();

  if (linkedIds.length > 0) {
    const placeholders = linkedIds.map(() => "?").join(", ");
    const areasResult = await env.DB.prepare(
      `
      SELECT id, form_id, name
      FROM serving_areas
      WHERE organization_id = ?
        AND id IN (${placeholders})
        AND is_active = 1
      `
    )
      .bind(organizationId, ...linkedIds)
      .all<{ id: number; form_id: number; name: string }>();

    for (const row of areasResult.results ?? []) {
      areaMeta.set(row.id, { name: row.name, formId: row.form_id });
    }

    for (const id of linkedIds) {
      if (!areaMeta.has(id)) {
        return null;
      }
    }
  }

  const scheduleInsert = await env.DB.prepare(
    `
    INSERT INTO schedules (organization_id, name, schedule_type)
    VALUES (?, ?, ?)
    `
  )
    .bind(organizationId, input.name, input.scheduleType)
    .run();

  const scheduleId = scheduleInsert.meta.last_row_id;

  if (!scheduleId) {
    return null;
  }

  const scheduleServingAreaIdByKey = new Map<string, number>();

  for (const row of input.servingAreas) {
    const meta = row.servingAreaId ? areaMeta.get(row.servingAreaId) : null;
    const displayName = meta?.name ?? row.customName ?? "";
    const insert = await env.DB.prepare(
      `
      INSERT INTO schedule_serving_areas (
        schedule_id,
        organization_id,
        serving_area_id,
        form_id,
        custom_name,
        display_name
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        scheduleId,
        organizationId,
        row.servingAreaId,
        meta?.formId ?? null,
        row.customName,
        displayName
      )
      .run();

    const scheduleServingAreaId = insert.meta.last_row_id;
    const key = servingAreaKey(row.servingAreaId, row.customName);

    if (key && scheduleServingAreaId) {
      scheduleServingAreaIdByKey.set(key, scheduleServingAreaId);
    }
  }

  for (let rhythmIndex = 0; rhythmIndex < input.rhythms.length; rhythmIndex += 1) {
    const rhythm = input.rhythms[rhythmIndex];
    const rhythmInsert = await env.DB.prepare(
      `
      INSERT INTO schedule_rhythms (
        schedule_id,
        organization_id,
        name,
        day_of_week,
        start_time,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        scheduleId,
        organizationId,
        rhythm.name,
        rhythm.dayOfWeek,
        rhythm.startTime,
        rhythmIndex
      )
      .run();

    const rhythmId = rhythmInsert.meta.last_row_id;

    if (!rhythmId) {
      continue;
    }

    for (const requirement of rhythm.requirements) {
      const key = servingAreaKey(requirement.servingAreaId, requirement.customName);
      const scheduleServingAreaId = key ? scheduleServingAreaIdByKey.get(key) : undefined;

      if (!scheduleServingAreaId) {
        continue;
      }

      await env.DB.prepare(
        `
        INSERT INTO schedule_rhythm_requirements (
          rhythm_id,
          schedule_serving_area_id,
          organization_id,
          needed_count
        )
        VALUES (?, ?, ?, ?)
        `
      )
        .bind(rhythmId, scheduleServingAreaId, organizationId, requirement.neededCount)
        .run();
    }
  }

  return getAdminScheduleDetail(env, organizationId, scheduleId);
}

export async function getAdminScheduleDetail(
  env: Env,
  organizationId: number,
  scheduleId: number
): Promise<AdminScheduleDetail | null> {
  const schedule = await env.DB.prepare(
    `
    SELECT id, name, schedule_type, created_at, updated_at
    FROM schedules
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(scheduleId, organizationId)
    .first<{
      id: number;
      name: string;
      schedule_type: string;
      created_at: string;
      updated_at: string;
    }>();

  if (!schedule) {
    return null;
  }

  const [servingAreas, rhythms] = await Promise.all([
    listScheduleServingAreas(env, scheduleId),
    listScheduleRhythmsWithRequirements(env, scheduleId)
  ]);

  return {
    id: schedule.id,
    name: schedule.name,
    scheduleType: schedule.schedule_type,
    createdAt: schedule.created_at,
    updatedAt: schedule.updated_at,
    servingAreas,
    rhythms
  };
}

async function listScheduleServingAreas(env: Env, scheduleId: number) {
  const result = await env.DB.prepare(
    `
    SELECT id, serving_area_id, form_id, custom_name, display_name
    FROM schedule_serving_areas
    WHERE schedule_id = ?
    ORDER BY display_name ASC, id ASC
    `
  )
    .bind(scheduleId)
    .all<{
      id: number;
      serving_area_id: number | null;
      form_id: number | null;
      custom_name: string | null;
      display_name: string;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    servingAreaId: row.serving_area_id,
    formId: row.form_id,
    customName: row.custom_name,
    displayName: row.display_name
  }));
}

async function listScheduleRhythmsWithRequirements(env: Env, scheduleId: number) {
  const rhythmsResult = await env.DB.prepare(
    `
    SELECT id, name, day_of_week, start_time
    FROM schedule_rhythms
    WHERE schedule_id = ?
    ORDER BY sort_order ASC, id ASC
    `
  )
    .bind(scheduleId)
    .all<{
      id: number;
      name: string;
      day_of_week: string;
      start_time: string;
    }>();

  const rhythms = rhythmsResult.results ?? [];

  if (rhythms.length === 0) {
    return [];
  }

  const rhythmIds = rhythms.map((row) => row.id);
  const placeholders = rhythmIds.map(() => "?").join(", ");
  const requirementsResult = await env.DB.prepare(
    `
    SELECT
      srr.id,
      srr.rhythm_id,
      srr.schedule_serving_area_id,
      srr.needed_count,
      ssa.display_name
    FROM schedule_rhythm_requirements srr
    INNER JOIN schedule_serving_areas ssa
      ON ssa.id = srr.schedule_serving_area_id
    WHERE srr.rhythm_id IN (${placeholders})
    ORDER BY ssa.display_name ASC, srr.id ASC
    `
  )
    .bind(...rhythmIds)
    .all<{
      id: number;
      rhythm_id: number;
      schedule_serving_area_id: number;
      needed_count: number;
      display_name: string;
    }>();

  const requirementsByRhythm = new Map<
    number,
    AdminScheduleDetail["rhythms"][number]["requirements"]
  >();

  for (const row of requirementsResult.results ?? []) {
    const list = requirementsByRhythm.get(row.rhythm_id) ?? [];
    list.push({
      id: row.id,
      scheduleServingAreaId: row.schedule_serving_area_id,
      displayName: row.display_name,
      neededCount: row.needed_count
    });
    requirementsByRhythm.set(row.rhythm_id, list);
  }

  return rhythms.map((row) => ({
    id: row.id,
    name: row.name,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    requirements: requirementsByRhythm.get(row.id) ?? []
  }));
}

export async function updateAdminScheduleName(
  env: Env,
  organizationId: number,
  scheduleId: number,
  name: string
): Promise<AdminScheduleDetail | null> {
  const result = await env.DB.prepare(
    `
    UPDATE schedules
    SET name = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(name, scheduleId, organizationId)
    .run();

  if (!result.meta.changes) {
    return null;
  }

  return getAdminScheduleDetail(env, organizationId, scheduleId);
}

export type ReplaceScheduleServingAreasResult =
  | { status: "ok"; detail: AdminScheduleDetail }
  | { status: "not_found" }
  | { status: "in_use"; displayNames: string[] }
  | { status: "invalid_areas" };

export async function replaceAdminScheduleServingAreas(
  env: Env,
  organizationId: number,
  scheduleId: number,
  servingAreas: CreateScheduleServingAreaInput[]
): Promise<ReplaceScheduleServingAreasResult> {
  const existing = await getAdminScheduleDetail(env, organizationId, scheduleId);

  if (!existing) {
    return { status: "not_found" };
  }

  const linkedIds = servingAreas
    .map((row) => row.servingAreaId)
    .filter((id): id is number => id !== null);

  const areaMeta = new Map<number, { name: string; formId: number }>();

  if (linkedIds.length > 0) {
    const placeholders = linkedIds.map(() => "?").join(", ");
    const areasResult = await env.DB.prepare(
      `
      SELECT id, form_id, name
      FROM serving_areas
      WHERE organization_id = ?
        AND id IN (${placeholders})
        AND is_active = 1
      `
    )
      .bind(organizationId, ...linkedIds)
      .all<{ id: number; form_id: number; name: string }>();

    for (const row of areasResult.results ?? []) {
      areaMeta.set(row.id, { name: row.name, formId: row.form_id });
    }

    for (const id of linkedIds) {
      if (!areaMeta.has(id)) {
        return { status: "invalid_areas" };
      }
    }
  }

  const currentByKey = new Map<string, { id: number; displayName: string }>();

  for (const row of existing.servingAreas) {
    const key = servingAreaKey(row.servingAreaId, row.customName);

    if (key) {
      currentByKey.set(key, { id: row.id, displayName: row.displayName });
    }
  }

  const newKeys = new Set<string>();

  for (const row of servingAreas) {
    const key = servingAreaKey(row.servingAreaId, row.customName);

    if (key) {
      newKeys.add(key);
    }
  }

  const idsToRemove: number[] = [];
  const inUseNames: string[] = [];

  for (const [key, meta] of currentByKey) {
    if (!newKeys.has(key)) {
      idsToRemove.push(meta.id);
    }
  }

  if (idsToRemove.length > 0) {
    const placeholders = idsToRemove.map(() => "?").join(", ");
    const usageResult = await env.DB.prepare(
      `
      SELECT DISTINCT schedule_serving_area_id
      FROM schedule_rhythm_requirements
      WHERE schedule_serving_area_id IN (${placeholders})
      `
    )
      .bind(...idsToRemove)
      .all<{ schedule_serving_area_id: number }>();

    const inUseIds = new Set(
      (usageResult.results ?? []).map((row) => row.schedule_serving_area_id)
    );

    for (const id of idsToRemove) {
      if (inUseIds.has(id)) {
        const match = existing.servingAreas.find((row) => row.id === id);
        inUseNames.push(match?.displayName ?? "Serving area");
      }
    }

    if (inUseNames.length > 0) {
      return { status: "in_use", displayNames: inUseNames };
    }
  }

  for (const id of idsToRemove) {
    await env.DB.prepare(
      `
      DELETE FROM schedule_serving_areas
      WHERE id = ? AND schedule_id = ? AND organization_id = ?
      `
    )
      .bind(id, scheduleId, organizationId)
      .run();
  }

  for (const row of servingAreas) {
    const key = servingAreaKey(row.servingAreaId, row.customName);

    if (!key || currentByKey.has(key)) {
      continue;
    }

    const meta = row.servingAreaId ? areaMeta.get(row.servingAreaId) : null;
    const displayName = meta?.name ?? row.customName ?? "";

    await env.DB.prepare(
      `
      INSERT INTO schedule_serving_areas (
        schedule_id,
        organization_id,
        serving_area_id,
        form_id,
        custom_name,
        display_name
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        scheduleId,
        organizationId,
        row.servingAreaId,
        meta?.formId ?? null,
        row.customName,
        displayName
      )
      .run();
  }

  await env.DB.prepare(
    `
    UPDATE schedules
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(scheduleId, organizationId)
    .run();

  const detail = await getAdminScheduleDetail(env, organizationId, scheduleId);

  return detail ? { status: "ok", detail } : { status: "not_found" };
}

export async function replaceAdminScheduleRhythms(
  env: Env,
  organizationId: number,
  scheduleId: number,
  rhythms: UpdateScheduleRhythmInput[]
): Promise<AdminScheduleDetail | null> {
  const schedule = await env.DB.prepare(
    `
    SELECT id FROM schedules WHERE id = ? AND organization_id = ? LIMIT 1
    `
  )
    .bind(scheduleId, organizationId)
    .first<{ id: number }>();

  if (!schedule) {
    return null;
  }

  await env.DB.prepare(
    `
    DELETE FROM schedule_rhythms
    WHERE schedule_id = ? AND organization_id = ?
    `
  )
    .bind(scheduleId, organizationId)
    .run();

  for (let rhythmIndex = 0; rhythmIndex < rhythms.length; rhythmIndex += 1) {
    const rhythm = rhythms[rhythmIndex];
    const rhythmInsert = await env.DB.prepare(
      `
      INSERT INTO schedule_rhythms (
        schedule_id,
        organization_id,
        name,
        day_of_week,
        start_time,
        sort_order
      )
      VALUES (?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        scheduleId,
        organizationId,
        rhythm.name,
        rhythm.dayOfWeek,
        rhythm.startTime,
        rhythmIndex
      )
      .run();

    const rhythmId = rhythmInsert.meta.last_row_id;

    if (!rhythmId) {
      continue;
    }

    for (const requirement of rhythm.requirements) {
      await env.DB.prepare(
        `
        INSERT INTO schedule_rhythm_requirements (
          rhythm_id,
          schedule_serving_area_id,
          organization_id,
          needed_count
        )
        VALUES (?, ?, ?, ?)
        `
      )
        .bind(
          rhythmId,
          requirement.scheduleServingAreaId,
          organizationId,
          requirement.neededCount
        )
        .run();
    }
  }

  await env.DB.prepare(
    `
    UPDATE schedules
    SET updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(scheduleId, organizationId)
    .run();

  return getAdminScheduleDetail(env, organizationId, scheduleId);
}

export async function deleteAdminSchedule(
  env: Env,
  organizationId: number,
  scheduleId: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `
    DELETE FROM schedules
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(scheduleId, organizationId)
    .run();

  return Boolean(result.meta.changes);
}
