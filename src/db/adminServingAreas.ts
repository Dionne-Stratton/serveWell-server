import type { Env } from "../types";
import {
  isRecruitmentStatus,
  normalizeRecruitmentStatus,
  recruitmentStatusToIsActive,
  type RecruitmentStatus,
} from "../lib/recruitmentStatus";

const MAX_AREA_TEXT = 2000;
const MAX_AREA_NAME = 120;
const MAX_AREA_SLUG = 80;

export type AdminServingAreaRecord = {
  id: number;
  organizationId: number;
  formId: number;
  sectionId: number | null;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  publicNote: string | null;
  requiresBackgroundCheck: boolean;
  requiresTraining: boolean;
  requiresAuditionOrInterview: boolean;
  recruitmentStatus: RecruitmentStatus;
  isActive: boolean;
  sortOrder: number;
};

interface ServingAreaAdminRow {
  id: number;
  organization_id: number;
  form_id: number;
  section_id: number | null;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  public_note: string | null;
  requires_background_check: number;
  requires_training: number;
  requires_audition_or_interview: number;
  recruitment_status: string;
  is_active: number;
  sort_order: number;
}

export type CreateAdminServingAreaInput = {
  sectionId: number;
  name: string;
  slug?: string;
  description?: string | null;
  publicNote?: string | null;
  requiresBackgroundCheck?: boolean;
  requiresTraining?: boolean;
  requiresAuditionOrInterview?: boolean;
  recruitmentStatus?: RecruitmentStatus;
  isActive?: boolean;
  sortOrder?: number;
};

export type UpdateAdminServingAreaInput = {
  sectionId?: number;
  name?: string;
  description?: string | null;
  publicNote?: string | null;
  requiresBackgroundCheck?: boolean;
  requiresTraining?: boolean;
  requiresAuditionOrInterview?: boolean;
  recruitmentStatus?: RecruitmentStatus;
  isActive?: boolean;
  sortOrder?: number;
};

function mapRow(row: ServingAreaAdminRow): AdminServingAreaRecord {
  const isActive = Boolean(row.is_active);
  const recruitmentStatus = normalizeRecruitmentStatus(row.recruitment_status, isActive);
  return {
    id: row.id,
    organizationId: row.organization_id,
    formId: row.form_id,
    sectionId: row.section_id,
    slug: row.slug,
    name: row.name,
    category: row.category,
    description: row.description,
    publicNote: row.public_note,
    requiresBackgroundCheck: Boolean(row.requires_background_check),
    requiresTraining: Boolean(row.requires_training),
    requiresAuditionOrInterview: Boolean(row.requires_audition_or_interview),
    recruitmentStatus,
    isActive: recruitmentStatusToIsActive(recruitmentStatus),
    sortOrder: row.sort_order
  };
}

export function mapAdminServingArea(area: AdminServingAreaRecord) {
  return {
    id: area.id,
    sectionId: area.sectionId,
    slug: area.slug,
    name: area.name,
    description: area.description,
    publicNote: area.publicNote,
    requiresBackgroundCheck: area.requiresBackgroundCheck,
    requiresTraining: area.requiresTraining,
    requiresAuditionOrInterview: area.requiresAuditionOrInterview,
    recruitmentStatus: area.recruitmentStatus,
    isActive: area.isActive,
    sortOrder: area.sortOrder
  };
}

export async function listAdminServingAreasForForm(
  env: Env,
  organizationId: number,
  formId: number
): Promise<AdminServingAreaRecord[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      form_id,
      section_id,
      slug,
      name,
      category,
      description,
      public_note,
      requires_background_check,
      requires_training,
      requires_audition_or_interview,
      recruitment_status,
      is_active,
      sort_order
    FROM serving_areas
    WHERE organization_id = ? AND form_id = ?
    ORDER BY sort_order ASC, name ASC, id ASC
    `
  )
    .bind(organizationId, formId)
    .all<ServingAreaAdminRow>();

  return (result.results ?? []).map(mapRow);
}

export async function getAdminServingAreaById(
  env: Env,
  servingAreaId: number,
  organizationId: number
): Promise<AdminServingAreaRecord | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      form_id,
      section_id,
      slug,
      name,
      category,
      description,
      public_note,
      requires_background_check,
      requires_training,
      requires_audition_or_interview,
      recruitment_status,
      is_active,
      sort_order
    FROM serving_areas
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(servingAreaId, organizationId)
    .first<ServingAreaAdminRow>();

  return row ? mapRow(row) : null;
}

function slugifyName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_AREA_SLUG) || "area";
}

export function validateCreateAdminServingAreaInput(
  body: Record<string, unknown>
): { ok: true; value: CreateAdminServingAreaInput } | { ok: false; message: string } {
  if (typeof body.sectionId !== "number" || !Number.isInteger(body.sectionId)) {
    return { ok: false, message: "sectionId is required." };
  }

  if (typeof body.name !== "string" || !body.name.trim()) {
    return { ok: false, message: "Serving area name is required." };
  }

  if (body.name.trim().length > MAX_AREA_NAME) {
    return { ok: false, message: "Serving area name is too long." };
  }

  let slug: string | undefined;

  if (body.slug !== undefined) {
    if (typeof body.slug !== "string" || !body.slug.trim()) {
      return { ok: false, message: "Slug must be a non-empty string." };
    }
    slug = body.slug.trim().toLowerCase();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
      return { ok: false, message: "Slug must use lowercase letters, numbers, and hyphens." };
    }
  }

  const value: CreateAdminServingAreaInput = {
    sectionId: body.sectionId,
    name: body.name.trim(),
    slug,
    description: normalizeOptionalText(body.description),
    publicNote: normalizeOptionalText(body.publicNote),
    requiresBackgroundCheck: body.requiresBackgroundCheck === true,
    requiresTraining: body.requiresTraining === true,
    requiresAuditionOrInterview: body.requiresAuditionOrInterview === true,
    recruitmentStatus:
      body.recruitmentStatus !== undefined && isRecruitmentStatus(body.recruitmentStatus)
        ? body.recruitmentStatus
        : body.isActive === false
          ? "closed"
          : "open",
    isActive: body.isActive !== false,
    sortOrder: typeof body.sortOrder === "number" ? body.sortOrder : undefined
  };

  if (body.recruitmentStatus !== undefined && !isRecruitmentStatus(body.recruitmentStatus)) {
    return { ok: false, message: "recruitmentStatus must be open, needed, urgent, or closed." };
  }

  value.recruitmentStatus = value.recruitmentStatus ?? "open";
  value.isActive = recruitmentStatusToIsActive(value.recruitmentStatus);

  return { ok: true, value };
}

export function validateUpdateAdminServingAreaInput(
  body: Record<string, unknown>
): { ok: true; value: UpdateAdminServingAreaInput } | { ok: false; message: string } {
  const value: UpdateAdminServingAreaInput = {};
  let hasField = false;

  if (body.sectionId !== undefined) {
    if (typeof body.sectionId !== "number" || !Number.isInteger(body.sectionId)) {
      return { ok: false, message: "sectionId must be an integer." };
    }
    value.sectionId = body.sectionId;
    hasField = true;
  }

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return { ok: false, message: "Name must be a non-empty string." };
    }
    value.name = body.name.trim();
    hasField = true;
  }

  for (const [key, field] of [
    ["description", "description"],
    ["publicNote", "publicNote"]
  ] as const) {
    if (body[key] !== undefined) {
      const normalized = normalizeOptionalText(body[key]);
      if (normalized && normalized.length > MAX_AREA_TEXT) {
        return { ok: false, message: `${field} is too long.` };
      }
      value[field] = normalized;
      hasField = true;
    }
  }

  for (const [key, field] of [
    ["requiresBackgroundCheck", "requiresBackgroundCheck"],
    ["requiresTraining", "requiresTraining"],
    ["requiresAuditionOrInterview", "requiresAuditionOrInterview"],
    ["isActive", "isActive"]
  ] as const) {
    if (body[key] !== undefined) {
      if (typeof body[key] !== "boolean") {
        return { ok: false, message: `${key} must be a boolean.` };
      }
      value[field] = body[key] as boolean;
      hasField = true;
    }
  }

  if (body.recruitmentStatus !== undefined) {
    if (!isRecruitmentStatus(body.recruitmentStatus)) {
      return {
        ok: false,
        message: "recruitmentStatus must be open, needed, urgent, or closed."
      };
    }
    value.recruitmentStatus = body.recruitmentStatus;
    hasField = true;
  }

  if (value.recruitmentStatus !== undefined) {
    value.isActive = recruitmentStatusToIsActive(value.recruitmentStatus);
  } else if (value.isActive !== undefined && value.recruitmentStatus === undefined) {
    value.recruitmentStatus = value.isActive ? "open" : "closed";
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

function normalizeOptionalText(value: unknown): string | null | undefined {
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
  return trimmed || null;
}

export async function createAdminServingArea(
  env: Env,
  organizationId: number,
  formId: number,
  input: CreateAdminServingAreaInput
): Promise<AdminServingAreaRecord> {
  const baseSlug = input.slug ?? slugifyName(input.name);
  let slug = baseSlug;
  let attempt = 0;

  while (attempt < 20) {
    const existing = await env.DB.prepare(
      `SELECT id FROM serving_areas WHERE form_id = ? AND slug = ? LIMIT 1`
    )
      .bind(formId, slug)
      .first<{ id: number }>();

    if (!existing) {
      break;
    }

    attempt += 1;
    slug = `${baseSlug}-${attempt}`;
  }

  const sortOrder =
    input.sortOrder ??
    ((
      await env.DB.prepare(
        `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM serving_areas WHERE form_id = ? AND section_id = ?`
      )
        .bind(formId, input.sectionId)
        .first<{ next_order: number }>()
    )?.next_order ?? 10);

  const recruitmentStatus = input.recruitmentStatus ?? "open";
  const isActive = recruitmentStatusToIsActive(recruitmentStatus);

  const insert = await env.DB.prepare(
    `
    INSERT INTO serving_areas (
      organization_id,
      form_id,
      section_id,
      slug,
      name,
      category,
      description,
      public_note,
      requires_background_check,
      requires_training,
      requires_audition_or_interview,
      recruitment_status,
      is_active,
      sort_order
    ) VALUES (?, ?, ?, ?, ?, 'custom', ?, ?, ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      organizationId,
      formId,
      input.sectionId,
      slug,
      input.name,
      input.description ?? null,
      input.publicNote ?? null,
      input.requiresBackgroundCheck ? 1 : 0,
      input.requiresTraining ? 1 : 0,
      input.requiresAuditionOrInterview ? 1 : 0,
      recruitmentStatus,
      isActive ? 1 : 0,
      sortOrder
    )
    .run();

  const id = insert.meta.last_row_id;

  if (!id) {
    throw new Error("Serving area insert failed.");
  }

  const area = await getAdminServingAreaById(env, id, organizationId);

  if (!area) {
    throw new Error("Serving area missing after insert.");
  }

  return area;
}

export async function updateAdminServingArea(
  env: Env,
  servingAreaId: number,
  organizationId: number,
  input: UpdateAdminServingAreaInput
): Promise<AdminServingAreaRecord | null> {
  const existing = await getAdminServingAreaById(env, servingAreaId, organizationId);

  if (!existing) {
    return null;
  }

  const recruitmentStatus =
    input.recruitmentStatus ??
    (input.isActive !== undefined
      ? input.isActive
        ? existing.recruitmentStatus === "closed"
          ? "open"
          : existing.recruitmentStatus
        : "closed"
      : existing.recruitmentStatus);
  const isActive = recruitmentStatusToIsActive(recruitmentStatus);

  await env.DB.prepare(
    `
    UPDATE serving_areas
    SET
      section_id = ?,
      name = ?,
      description = ?,
      public_note = ?,
      requires_background_check = ?,
      requires_training = ?,
      requires_audition_or_interview = ?,
      recruitment_status = ?,
      is_active = ?,
      sort_order = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(
      input.sectionId ?? existing.sectionId,
      input.name ?? existing.name,
      input.description !== undefined ? input.description : existing.description,
      input.publicNote !== undefined ? input.publicNote : existing.publicNote,
      (input.requiresBackgroundCheck ?? existing.requiresBackgroundCheck) ? 1 : 0,
      (input.requiresTraining ?? existing.requiresTraining) ? 1 : 0,
      (input.requiresAuditionOrInterview ?? existing.requiresAuditionOrInterview) ? 1 : 0,
      recruitmentStatus,
      isActive ? 1 : 0,
      input.sortOrder ?? existing.sortOrder,
      servingAreaId,
      organizationId
    )
    .run();

  return getAdminServingAreaById(env, servingAreaId, organizationId);
}

export async function deleteAdminServingArea(
  env: Env,
  servingAreaId: number,
  organizationId: number
): Promise<boolean> {
  const area = await getAdminServingAreaById(env, servingAreaId, organizationId);

  if (!area) {
    return false;
  }

  await env.DB.prepare(
    `
    UPDATE volunteer_interests
    SET serving_area_name = ?, serving_area_id = NULL
    WHERE serving_area_id = ?
    `
  )
    .bind(area.name, servingAreaId)
    .run();

  await env.DB.prepare(
    `DELETE FROM volunteer_requirement_confirmations WHERE serving_area_id = ?`
  )
    .bind(servingAreaId)
    .run();

  const result = await env.DB.prepare(
    `DELETE FROM serving_areas WHERE id = ? AND organization_id = ?`
  )
    .bind(servingAreaId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
