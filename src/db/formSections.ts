import type { Env } from "../types";
import type { ServingArea } from "./servingAreas";

export type FormSectionRecord = {
  id: number;
  organizationId: number;
  formId: number;
  title: string;
  sortOrder: number;
};

interface SectionRow {
  id: number;
  organization_id: number;
  form_id: number;
  title: string;
  sort_order: number;
}

function mapSectionRow(row: SectionRow): FormSectionRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    formId: row.form_id,
    title: row.title,
    sortOrder: row.sort_order
  };
}

export function mapPublicSection(section: FormSectionRecord, servingAreas: PublicSectionArea[]) {
  return {
    id: section.id,
    title: section.title,
    servingAreas
  };
}

export type PublicSectionArea = ServingArea;

export async function listFormSections(
  env: Env,
  organizationId: number,
  formId: number
): Promise<FormSectionRecord[]> {
  const result = await env.DB.prepare(
    `
    SELECT id, organization_id, form_id, title, sort_order
    FROM form_sections
    WHERE organization_id = ? AND form_id = ?
    ORDER BY sort_order ASC, id ASC
    `
  )
    .bind(organizationId, formId)
    .all<SectionRow>();

  return (result.results ?? []).map(mapSectionRow);
}

export async function getFormSectionById(
  env: Env,
  sectionId: number,
  organizationId: number
): Promise<FormSectionRecord | null> {
  const row = await env.DB.prepare(
    `
    SELECT id, organization_id, form_id, title, sort_order
    FROM form_sections
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(sectionId, organizationId)
    .first<SectionRow>();

  return row ? mapSectionRow(row) : null;
}

const MAX_SECTION_TITLE = 120;

export async function createFormSection(
  env: Env,
  organizationId: number,
  formId: number,
  title: string,
  sortOrder?: number
): Promise<FormSectionRecord> {
  const trimmed = title.trim();
  const order =
    typeof sortOrder === "number"
      ? sortOrder
      : await nextSectionSortOrder(env, formId);

  const insert = await env.DB.prepare(
    `
    INSERT INTO form_sections (organization_id, form_id, title, sort_order)
    VALUES (?, ?, ?, ?)
    `
  )
    .bind(organizationId, formId, trimmed, order)
    .run();

  const id = insert.meta.last_row_id;

  if (!id) {
    throw new Error("Section insert did not return an id.");
  }

  const section = await getFormSectionById(env, id, organizationId);

  if (!section) {
    throw new Error("Section not found after insert.");
  }

  return section;
}

async function nextSectionSortOrder(env: Env, formId: number): Promise<number> {
  const row = await env.DB.prepare(
    `SELECT COALESCE(MAX(sort_order), 0) + 10 AS next_order FROM form_sections WHERE form_id = ?`
  )
    .bind(formId)
    .first<{ next_order: number }>();

  return row?.next_order ?? 10;
}

export function validateSectionTitle(title: unknown): { ok: true; value: string } | { ok: false; message: string } {
  if (typeof title !== "string" || !title.trim()) {
    return { ok: false, message: "Section title must be a non-empty string." };
  }
  if (title.trim().length > MAX_SECTION_TITLE) {
    return { ok: false, message: "Section title is too long." };
  }
  return { ok: true, value: title.trim() };
}

export async function updateFormSection(
  env: Env,
  sectionId: number,
  organizationId: number,
  input: { title?: string; sortOrder?: number }
): Promise<FormSectionRecord | null> {
  const existing = await getFormSectionById(env, sectionId, organizationId);

  if (!existing) {
    return null;
  }

  const title = input.title ?? existing.title;
  const sortOrder =
    typeof input.sortOrder === "number" ? input.sortOrder : existing.sortOrder;

  await env.DB.prepare(
    `
    UPDATE form_sections
    SET title = ?, sort_order = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(title, sortOrder, sectionId, organizationId)
    .run();

  return getFormSectionById(env, sectionId, organizationId);
}

export async function deleteFormSection(
  env: Env,
  sectionId: number,
  organizationId: number
): Promise<boolean> {
  const section = await getFormSectionById(env, sectionId, organizationId);

  if (!section) {
    return false;
  }

  const areaCount = await env.DB.prepare(
    `SELECT COUNT(*) AS count FROM serving_areas WHERE section_id = ?`
  )
    .bind(sectionId)
    .first<{ count: number }>();

  if ((areaCount?.count ?? 0) > 0) {
    throw new Error("SECTION_HAS_AREAS");
  }

  const result = await env.DB.prepare(
    `DELETE FROM form_sections WHERE id = ? AND organization_id = ?`
  )
    .bind(sectionId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export function mapAdminSection(section: FormSectionRecord) {
  return {
    id: section.id,
    title: section.title,
    sortOrder: section.sortOrder
  };
}
