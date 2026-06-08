import type { Env } from "../types";

export interface ActiveSubmissionRef {
  id: number;
  organizationId: number;
  formId: number;
  email: string;
}

export async function findMostRecentActiveSubmissionByFormAndEmail(
  env: Env,
  formId: number,
  email: string
): Promise<ActiveSubmissionRef | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const row = await env.DB.prepare(
    `
    SELECT id, organization_id, form_id, email
    FROM volunteer_submissions
    WHERE form_id = ?
      AND is_archived = 0
      AND email IS NOT NULL
      AND lower(trim(email)) = ?
    ORDER BY created_at DESC, id DESC
    LIMIT 1
    `
  )
    .bind(formId, normalized)
    .first<{
      id: number;
      organization_id: number;
      form_id: number;
      email: string;
    }>();

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    organizationId: row.organization_id,
    formId: row.form_id,
    email: row.email
  };
}

export async function isEmailUsedByOtherActiveSubmission(
  env: Env,
  formId: number,
  email: string,
  excludeSubmissionId: number
): Promise<boolean> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return false;
  }

  const row = await env.DB.prepare(
    `
    SELECT id
    FROM volunteer_submissions
    WHERE form_id = ?
      AND is_archived = 0
      AND id != ?
      AND email IS NOT NULL
      AND lower(trim(email)) = ?
    LIMIT 1
    `
  )
    .bind(formId, excludeSubmissionId, normalized)
    .first<{ id: number }>();

  return Boolean(row);
}
