import type { Env } from "../types";

const MAX_REQ_TEXT = 2000;
const MAX_REQ_LABEL = 200;

export type AdminRequirementRecord = {
  id: number;
  organizationId: number;
  formId: number;
  servingAreaId: number;
  requirementType: string;
  label: string;
  description: string | null;
  dayOfWeek: string | null;
  startTime: string | null;
  endTime: string | null;
  isMandatory: boolean;
  requiresConfirmation: boolean;
  sortOrder: number;
};

interface RequirementRow {
  id: number;
  organization_id: number;
  form_id: number;
  serving_area_id: number;
  requirement_type: string;
  label: string;
  description: string | null;
  day_of_week: string | null;
  start_time: string | null;
  end_time: string | null;
  is_mandatory: number;
  requires_confirmation: number;
  sort_order: number;
}

function mapRow(row: RequirementRow): AdminRequirementRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    formId: row.form_id,
    servingAreaId: row.serving_area_id,
    requirementType: row.requirement_type,
    label: row.label,
    description: row.description,
    dayOfWeek: row.day_of_week,
    startTime: row.start_time,
    endTime: row.end_time,
    isMandatory: Boolean(row.is_mandatory),
    requiresConfirmation: Boolean(row.requires_confirmation),
    sortOrder: row.sort_order
  };
}

export function mapAdminRequirement(req: AdminRequirementRecord) {
  return {
    id: req.id,
    servingAreaId: req.servingAreaId,
    type: req.requirementType,
    label: req.label,
    description: req.description,
    dayOfWeek: req.dayOfWeek,
    startTime: req.startTime,
    endTime: req.endTime,
    isMandatory: req.isMandatory,
    requiresConfirmation: req.requiresConfirmation,
    sortOrder: req.sortOrder
  };
}

export async function listRequirementsForServingAreaIds(
  env: Env,
  organizationId: number,
  formId: number,
  servingAreaIds: number[]
): Promise<Map<number, AdminRequirementRecord[]>> {
  const map = new Map<number, AdminRequirementRecord[]>();

  if (servingAreaIds.length === 0) {
    return map;
  }

  const placeholders = servingAreaIds.map(() => "?").join(", ");
  const result = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      form_id,
      serving_area_id,
      requirement_type,
      label,
      description,
      day_of_week,
      start_time,
      end_time,
      is_mandatory,
      requires_confirmation,
      sort_order
    FROM serving_area_requirements
    WHERE organization_id = ?
      AND form_id = ?
      AND serving_area_id IN (${placeholders})
    ORDER BY sort_order ASC, id ASC
    `
  )
    .bind(organizationId, formId, ...servingAreaIds)
    .all<RequirementRow>();

  for (const row of result.results ?? []) {
    const list = map.get(row.serving_area_id) ?? [];
    list.push(mapRow(row));
    map.set(row.serving_area_id, list);
  }

  return map;
}

export type CreateRequirementInput = {
  requirementType: string;
  label: string;
  description?: string | null;
  dayOfWeek?: string | null;
  startTime?: string | null;
  endTime?: string | null;
  isMandatory?: boolean;
  requiresConfirmation?: boolean;
  sortOrder?: number;
};

export type UpdateRequirementInput = Partial<CreateRequirementInput>;

export function validateCreateRequirementInput(
  body: Record<string, unknown>
): { ok: true; value: CreateRequirementInput } | { ok: false; message: string } {
  if (typeof body.requirementType !== "string" || !body.requirementType.trim()) {
    return { ok: false, message: "requirementType is required." };
  }
  if (typeof body.label !== "string" || !body.label.trim()) {
    return { ok: false, message: "Requirement label is required." };
  }
  if (body.label.trim().length > MAX_REQ_LABEL) {
    return { ok: false, message: "Requirement label is too long." };
  }

  return {
    ok: true,
    value: {
      requirementType: body.requirementType.trim(),
      label: body.label.trim(),
      description: optionalText(body.description),
      dayOfWeek: optionalText(body.dayOfWeek),
      startTime: optionalText(body.startTime),
      endTime: optionalText(body.endTime),
      isMandatory: body.isMandatory === true,
      requiresConfirmation: body.requiresConfirmation === true,
      sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined
    }
  };
}

export function validateUpdateRequirementInput(
  body: Record<string, unknown>
): { ok: true; value: UpdateRequirementInput } | { ok: false; message: string } {
  const value: UpdateRequirementInput = {};
  let hasField = false;

  if (body.requirementType !== undefined) {
    if (typeof body.requirementType !== "string" || !body.requirementType.trim()) {
      return { ok: false, message: "requirementType must be a non-empty string." };
    }
    value.requirementType = body.requirementType.trim();
    hasField = true;
  }

  if (body.label !== undefined) {
    if (typeof body.label !== "string" || !body.label.trim()) {
      return { ok: false, message: "label must be a non-empty string." };
    }
    value.label = body.label.trim();
    hasField = true;
  }

  for (const key of ["description", "dayOfWeek", "startTime", "endTime"] as const) {
    if (body[key] !== undefined) {
      value[key] = optionalText(body[key]);
      hasField = true;
    }
  }

  if (body.isMandatory !== undefined) {
    if (typeof body.isMandatory !== "boolean") {
      return { ok: false, message: "isMandatory must be a boolean." };
    }
    value.isMandatory = body.isMandatory;
    hasField = true;
  }

  if (body.requiresConfirmation !== undefined) {
    if (typeof body.requiresConfirmation !== "boolean") {
      return { ok: false, message: "requiresConfirmation must be a boolean." };
    }
    value.requiresConfirmation = body.requiresConfirmation;
    hasField = true;
  }

  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder !== "number") {
      return { ok: false, message: "sortOrder must be a number." };
    }
    value.sortOrder = body.sortOrder;
    hasField = true;
  }

  if (!hasField) {
    return { ok: false, message: "Provide at least one field to update." };
  }

  return { ok: true, value };
}

function optionalText(value: unknown): string | null | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  if (trimmed.length > MAX_REQ_TEXT) {
    return trimmed.slice(0, MAX_REQ_TEXT);
  }
  return trimmed || null;
}

export async function createAdminRequirement(
  env: Env,
  organizationId: number,
  formId: number,
  servingAreaId: number,
  input: CreateRequirementInput
): Promise<AdminRequirementRecord> {
  const sortOrder =
    input.sortOrder ??
    ((
      await env.DB.prepare(
        `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM serving_area_requirements WHERE serving_area_id = ?`
      )
        .bind(servingAreaId)
        .first<{ next_order: number }>()
    )?.next_order ?? 10);

  const insert = await env.DB.prepare(
    `
    INSERT INTO serving_area_requirements (
      organization_id,
      form_id,
      serving_area_id,
      requirement_type,
      label,
      description,
      day_of_week,
      start_time,
      end_time,
      is_mandatory,
      requires_confirmation,
      sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      organizationId,
      formId,
      servingAreaId,
      input.requirementType,
      input.label,
      input.description ?? null,
      input.dayOfWeek ?? null,
      input.startTime ?? null,
      input.endTime ?? null,
      input.isMandatory ? 1 : 0,
      input.requiresConfirmation ? 1 : 0,
      sortOrder
    )
    .run();

  const id = insert.meta.last_row_id;

  if (!id) {
    throw new Error("Requirement insert failed.");
  }

  const row = await env.DB.prepare(
    `SELECT * FROM serving_area_requirements WHERE id = ? LIMIT 1`
  )
    .bind(id)
    .first<RequirementRow>();

  if (!row) {
    throw new Error("Requirement missing after insert.");
  }

  return mapRow(row);
}

export async function updateAdminRequirement(
  env: Env,
  requirementId: number,
  organizationId: number,
  input: UpdateRequirementInput
): Promise<AdminRequirementRecord | null> {
  const existing = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      form_id,
      serving_area_id,
      requirement_type,
      label,
      description,
      day_of_week,
      start_time,
      end_time,
      is_mandatory,
      requires_confirmation,
      sort_order
    FROM serving_area_requirements
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(requirementId, organizationId)
    .first<RequirementRow>();

  if (!existing) {
    return null;
  }

  const current = mapRow(existing);

  await env.DB.prepare(
    `
    UPDATE serving_area_requirements
    SET
      requirement_type = ?,
      label = ?,
      description = ?,
      day_of_week = ?,
      start_time = ?,
      end_time = ?,
      is_mandatory = ?,
      requires_confirmation = ?,
      sort_order = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(
      input.requirementType ?? current.requirementType,
      input.label ?? current.label,
      input.description !== undefined ? input.description : current.description,
      input.dayOfWeek !== undefined ? input.dayOfWeek : current.dayOfWeek,
      input.startTime !== undefined ? input.startTime : current.startTime,
      input.endTime !== undefined ? input.endTime : current.endTime,
      (input.isMandatory ?? current.isMandatory) ? 1 : 0,
      (input.requiresConfirmation ?? current.requiresConfirmation) ? 1 : 0,
      input.sortOrder ?? current.sortOrder,
      requirementId,
      organizationId
    )
    .run();

  const row = await env.DB.prepare(
    `SELECT * FROM serving_area_requirements WHERE id = ? LIMIT 1`
  )
    .bind(requirementId)
    .first<RequirementRow>();

  return row ? mapRow(row) : null;
}

export async function deleteAdminRequirement(
  env: Env,
  requirementId: number,
  organizationId: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `DELETE FROM serving_area_requirements WHERE id = ? AND organization_id = ?`
  )
    .bind(requirementId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function getAdminRequirementById(
  env: Env,
  requirementId: number,
  organizationId: number
): Promise<AdminRequirementRecord | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      form_id,
      serving_area_id,
      requirement_type,
      label,
      description,
      day_of_week,
      start_time,
      end_time,
      is_mandatory,
      requires_confirmation,
      sort_order
    FROM serving_area_requirements
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(requirementId, organizationId)
    .first<RequirementRow>();

  return row ? mapRow(row) : null;
}
