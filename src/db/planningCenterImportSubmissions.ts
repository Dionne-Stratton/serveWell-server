import type { Env } from "../types";

export interface PlanningCenterImportCustomField {
  fieldDefinitionId: string;
  name: string;
  value: string;
}

export interface CreatePlanningCenterImportSubmissionInput {
  organizationId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  preferredContactMethod: string;
  planningCenterPersonId: string;
  importedByAdminUserId: number;
  importedAt: string;
  importTabId: string;
  importTabName: string;
  importCustomDataJson: string;
}

interface InsertMeta {
  last_row_id?: number;
  lastRowId?: number;
}

export async function findSubmissionByPlanningCenterPersonAndTab(
  env: Env,
  organizationId: number,
  planningCenterPersonId: string,
  planningCenterImportTabId: string
): Promise<{ id: number } | null> {
  const row = await env.DB.prepare(
    `
    SELECT id
    FROM volunteer_submissions
    WHERE organization_id = ?
      AND planning_center_person_id = ?
      AND planning_center_import_tab_id = ?
      AND planning_center_imported_at IS NOT NULL
    LIMIT 1
    `
  )
    .bind(organizationId, planningCenterPersonId, planningCenterImportTabId)
    .first<{ id: number }>();

  return row ?? null;
}

export async function listPlanningCenterImportTabNames(
  env: Env,
  organizationId: number
): Promise<string[]> {
  const result = await env.DB.prepare(
    `
    SELECT DISTINCT planning_center_import_tab_name AS name
    FROM volunteer_submissions
    WHERE organization_id = ?
      AND planning_center_import_tab_name IS NOT NULL
      AND planning_center_imported_at IS NOT NULL
    ORDER BY planning_center_import_tab_name COLLATE NOCASE ASC
    `
  )
    .bind(organizationId)
    .all<{ name: string }>();

  return (result.results ?? [])
    .map((row) => row.name?.trim())
    .filter((name): name is string => Boolean(name));
}

export async function createPlanningCenterImportSubmission(
  env: Env,
  input: CreatePlanningCenterImportSubmissionInput
): Promise<number> {
  const result = await env.DB.prepare(
    `
    INSERT INTO volunteer_submissions (
      organization_id,
      form_id,
      first_name,
      last_name,
      email,
      phone,
      preferred_contact_method,
      overall_frequency,
      open_to_special_events,
      experience_notes,
      additional_notes,
      status,
      planning_center_person_id,
      planning_center_imported_at,
      planning_center_imported_by_admin_user_id,
      planning_center_import_tab_id,
      planning_center_import_tab_name,
      planning_center_import_custom_data_json
    ) VALUES (?, NULL, ?, ?, ?, ?, ?, 'not_sure', 0, NULL, NULL, 'new', ?, ?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.organizationId,
      input.firstName,
      input.lastName,
      input.email,
      input.phone,
      input.preferredContactMethod,
      input.planningCenterPersonId,
      input.importedAt,
      input.importedByAdminUserId,
      input.importTabId,
      input.importTabName,
      input.importCustomDataJson
    )
    .run();

  const meta = result.meta as InsertMeta;
  const submissionId = meta.last_row_id ?? meta.lastRowId;

  if (typeof submissionId !== "number") {
    throw new Error("D1 did not return a submission id.");
  }

  return submissionId;
}
