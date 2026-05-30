import type { Env } from "../types";

const MAX_FORM_TEXT = 4000;
const MAX_FORM_NAME = 120;

export type AdminFormRecord = {
  id: number;
  organizationId: number;
  slug: string;
  name: string;
  description: string | null;
  introText: string | null;
  successMessage: string | null;
  templateKey: string;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

interface FormRow {
  id: number;
  organization_id: number;
  slug: string;
  name: string;
  description: string | null;
  intro_text: string | null;
  success_message: string | null;
  template_key: string;
  is_default: number;
  is_active: number;
  created_at: string;
  updated_at: string;
}

export type UpdateAdminFormInput = {
  name?: string;
  description?: string | null;
  introText?: string | null;
  successMessage?: string | null;
  isActive?: boolean;
};

function mapFormRow(row: FormRow): AdminFormRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    introText: row.intro_text,
    successMessage: row.success_message,
    templateKey: row.template_key,
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export function mapAdminForm(form: AdminFormRecord) {
  return {
    id: form.id,
    slug: form.slug,
    name: form.name,
    description: form.description,
    introText: form.introText,
    successMessage: form.successMessage,
    templateKey: form.templateKey,
    isDefault: form.isDefault,
    isActive: form.isActive,
    createdAt: form.createdAt,
    updatedAt: form.updatedAt
  };
}

export async function listAdminForms(
  env: Env,
  organizationId: number
): Promise<AdminFormRecord[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      slug,
      name,
      description,
      intro_text,
      success_message,
      template_key,
      is_default,
      is_active,
      created_at,
      updated_at
    FROM volunteer_forms
    WHERE organization_id = ?
    ORDER BY is_default DESC, id ASC
    `
  )
    .bind(organizationId)
    .all<FormRow>();

  return (result.results ?? []).map(mapFormRow);
}

export async function getAdminFormById(
  env: Env,
  formId: number,
  organizationId: number
): Promise<AdminFormRecord | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      id,
      organization_id,
      slug,
      name,
      description,
      intro_text,
      success_message,
      template_key,
      is_default,
      is_active,
      created_at,
      updated_at
    FROM volunteer_forms
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(formId, organizationId)
    .first<FormRow>();

  return row ? mapFormRow(row) : null;
}

export function validateUpdateAdminFormInput(
  body: Record<string, unknown>
): { ok: true; value: UpdateAdminFormInput } | { ok: false; message: string } {
  const value: UpdateAdminFormInput = {};
  let hasField = false;

  if (body.name !== undefined) {
    if (typeof body.name !== "string" || !body.name.trim()) {
      return { ok: false, message: "Form name must be a non-empty string." };
    }
    if (body.name.trim().length > MAX_FORM_NAME) {
      return { ok: false, message: "Form name is too long." };
    }
    value.name = body.name.trim();
    hasField = true;
  }

  if (body.description !== undefined) {
    if (body.description !== null && typeof body.description !== "string") {
      return { ok: false, message: "Description must be a string or null." };
    }
    const description =
      body.description === null ? null : String(body.description).trim() || null;
    if (description && description.length > MAX_FORM_TEXT) {
      return { ok: false, message: "Description is too long." };
    }
    value.description = description;
    hasField = true;
  }

  if (body.introText !== undefined) {
    if (body.introText !== null && typeof body.introText !== "string") {
      return { ok: false, message: "Intro text must be a string or null." };
    }
    const introText =
      body.introText === null ? null : String(body.introText).trim() || null;
    if (introText && introText.length > MAX_FORM_TEXT) {
      return { ok: false, message: "Intro text is too long." };
    }
    value.introText = introText;
    hasField = true;
  }

  if (body.successMessage !== undefined) {
    if (body.successMessage !== null && typeof body.successMessage !== "string") {
      return { ok: false, message: "Success message must be a string or null." };
    }
    const successMessage =
      body.successMessage === null
        ? null
        : String(body.successMessage).trim() || null;
    if (successMessage && successMessage.length > MAX_FORM_TEXT) {
      return { ok: false, message: "Success message is too long." };
    }
    value.successMessage = successMessage;
    hasField = true;
  }

  if (body.isActive !== undefined) {
    if (typeof body.isActive !== "boolean") {
      return { ok: false, message: "isActive must be a boolean." };
    }
    value.isActive = body.isActive;
    hasField = true;
  }

  if (!hasField) {
    return { ok: false, message: "Provide at least one field to update." };
  }

  return { ok: true, value };
}

export async function updateAdminForm(
  env: Env,
  formId: number,
  organizationId: number,
  input: UpdateAdminFormInput
): Promise<AdminFormRecord | null> {
  const existing = await getAdminFormById(env, formId, organizationId);

  if (!existing) {
    return null;
  }

  const name = input.name ?? existing.name;
  const description =
    input.description !== undefined ? input.description : existing.description;
  const introText =
    input.introText !== undefined ? input.introText : existing.introText;
  const successMessage =
    input.successMessage !== undefined ? input.successMessage : existing.successMessage;
  const isActive =
    typeof input.isActive === "boolean" ? input.isActive : existing.isActive;

  await env.DB.prepare(
    `
    UPDATE volunteer_forms
    SET
      name = ?,
      description = ?,
      intro_text = ?,
      success_message = ?,
      is_active = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(
      name,
      description,
      introText,
      successMessage,
      isActive ? 1 : 0,
      formId,
      organizationId
    )
    .run();

  return getAdminFormById(env, formId, organizationId);
}
