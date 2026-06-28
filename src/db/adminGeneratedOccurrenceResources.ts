import type { Env } from "../types";
import type { OccurrenceResourceUploadFile } from "../validation/generatedOccurrenceResources";
import { isOccurrenceResourceUploadFile } from "../validation/generatedOccurrenceResources";

export const MAX_OCCURRENCE_RESOURCE_BYTES = 10 * 1024 * 1024;

export interface GeneratedOccurrenceResource {
  id: number;
  scheduleServingAreaId: number | null;
  servingAreaDisplayName: string | null;
  originalFilename: string;
  displayName: string | null;
  mimeType: string;
  fileSize: number;
  createdAt: string;
  updatedAt: string;
}

interface OccurrenceResourceContext {
  occurrenceId: number;
  allowedServingAreaIds: Set<number>;
}

async function getOccurrenceResourceContext(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number
): Promise<OccurrenceResourceContext | null> {
  const row = await env.DB.prepare(
    `
    SELECT gso.id AS occurrence_id
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
    .first<{ occurrence_id: number }>();

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
    allowedServingAreaIds
  };
}

function assertServingAreaAllowed(
  context: OccurrenceResourceContext,
  scheduleServingAreaId: number | null
): boolean {
  if (scheduleServingAreaId == null) {
    return true;
  }

  return context.allowedServingAreaIds.has(scheduleServingAreaId);
}

function sanitizeFilename(filename: string): string {
  const base = filename.replace(/[/\\]/g, "_").replace(/\.\./g, "_").trim();
  return base.length > 0 ? base.slice(0, 200) : "file";
}

function buildStorageKey(
  organizationId: number,
  occurrenceId: number,
  originalFilename: string
): string {
  const safeName = sanitizeFilename(originalFilename);
  return `org/${organizationId}/occurrence/${occurrenceId}/${crypto.randomUUID()}/${safeName}`;
}

export async function listGeneratedOccurrenceResources(
  env: Env,
  organizationId: number,
  occurrenceId: number
): Promise<GeneratedOccurrenceResource[]> {
  const result = await env.DB.prepare(
    `
    SELECT
      r.id,
      r.schedule_serving_area_id,
      r.original_filename,
      r.display_name,
      r.mime_type,
      r.file_size,
      r.created_at,
      r.updated_at,
      ssa.display_name AS serving_area_display_name
    FROM generated_schedule_occurrence_resources r
    LEFT JOIN schedule_serving_areas ssa ON ssa.id = r.schedule_serving_area_id
    WHERE r.occurrence_id = ? AND r.organization_id = ?
    ORDER BY
      CASE WHEN r.schedule_serving_area_id IS NULL THEN 0 ELSE 1 END,
      ssa.display_name ASC,
      r.created_at ASC,
      r.id ASC
    `
  )
    .bind(occurrenceId, organizationId)
    .all<{
      id: number;
      schedule_serving_area_id: number | null;
      original_filename: string;
      display_name: string | null;
      mime_type: string;
      file_size: number;
      created_at: string;
      updated_at: string;
      serving_area_display_name: string | null;
    }>();

  return (result.results ?? []).map((row) => ({
    id: row.id,
    scheduleServingAreaId: row.schedule_serving_area_id,
    servingAreaDisplayName: row.serving_area_display_name,
    originalFilename: row.original_filename,
    displayName: row.display_name,
    mimeType: row.mime_type,
    fileSize: row.file_size,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  }));
}

export type MutateOccurrenceResourceResult =
  | { status: "ok"; resourceId?: number }
  | { status: "not_found" }
  | { status: "invalid_serving_area" }
  | { status: "resource_not_found" }
  | { status: "file_required" }
  | { status: "file_too_large" }
  | { status: "storage_unavailable" };

export async function createGeneratedOccurrenceResource(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  input: {
    file: OccurrenceResourceUploadFile;
    displayName: string | null;
    scheduleServingAreaId: number | null;
  }
): Promise<MutateOccurrenceResourceResult> {
  if (!env.OCCURRENCE_RESOURCES) {
    return { status: "storage_unavailable" };
  }

  const context = await getOccurrenceResourceContext(
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

  if (!isOccurrenceResourceUploadFile(input.file) || input.file.size < 1) {
    return { status: "file_required" };
  }

  if (input.file.size > MAX_OCCURRENCE_RESOURCE_BYTES) {
    return { status: "file_too_large" };
  }

  const originalFilename = sanitizeFilename(input.file.name || "file");
  const mimeType = input.file.type?.trim() || "application/octet-stream";
  const storageKey = buildStorageKey(organizationId, occurrenceId, originalFilename);

  await env.OCCURRENCE_RESOURCES.put(storageKey, await input.file.arrayBuffer(), {
    httpMetadata: { contentType: mimeType }
  });

  let resourceId = 0;

  try {
    const insertResult = await env.DB.prepare(
      `
      INSERT INTO generated_schedule_occurrence_resources (
        organization_id,
        occurrence_id,
        schedule_serving_area_id,
        original_filename,
        display_name,
        storage_key,
        mime_type,
        file_size
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `
    )
      .bind(
        organizationId,
        occurrenceId,
        input.scheduleServingAreaId,
        originalFilename,
        input.displayName,
        storageKey,
        mimeType,
        input.file.size
      )
      .run();

    resourceId = Number(insertResult.meta.last_row_id);
  } catch (error) {
    await env.OCCURRENCE_RESOURCES.delete(storageKey);
    throw error;
  }

  if (!Number.isInteger(resourceId) || resourceId < 1) {
    throw new Error("Failed to resolve new occurrence resource id.");
  }

  return { status: "ok", resourceId };
}

export async function updateGeneratedOccurrenceResource(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  resourceId: number,
  input: { displayName: string | null; scheduleServingAreaId: number | null }
): Promise<MutateOccurrenceResourceResult> {
  const context = await getOccurrenceResourceContext(
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
    FROM generated_schedule_occurrence_resources
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(resourceId, occurrenceId, organizationId)
    .first<{ id: number }>();

  if (!existing) {
    return { status: "resource_not_found" };
  }

  await env.DB.prepare(
    `
    UPDATE generated_schedule_occurrence_resources
    SET display_name = ?,
        schedule_serving_area_id = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    `
  )
    .bind(input.displayName, input.scheduleServingAreaId, resourceId, occurrenceId, organizationId)
    .run();

  return { status: "ok" };
}

export async function deleteGeneratedOccurrenceResource(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  resourceId: number
): Promise<MutateOccurrenceResourceResult> {
  const context = await getOccurrenceResourceContext(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId
  );

  if (!context) {
    return { status: "not_found" };
  }

  const existing = await env.DB.prepare(
    `
    SELECT id, storage_key
    FROM generated_schedule_occurrence_resources
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(resourceId, occurrenceId, organizationId)
    .first<{ id: number; storage_key: string }>();

  if (!existing) {
    return { status: "resource_not_found" };
  }

  await env.DB.prepare(
    `
    DELETE FROM generated_schedule_occurrence_resources
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    `
  )
    .bind(resourceId, occurrenceId, organizationId)
    .run();

  if (env.OCCURRENCE_RESOURCES) {
    await env.OCCURRENCE_RESOURCES.delete(existing.storage_key);
  }

  return { status: "ok" };
}

export type OccurrenceResourceDownloadResult =
  | {
      status: "ok";
      object: R2ObjectBody;
      originalFilename: string;
      displayName: string | null;
      mimeType: string;
    }
  | { status: "not_found" }
  | { status: "resource_not_found" }
  | { status: "storage_unavailable" };

export async function getGeneratedOccurrenceResourceDownload(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  occurrenceId: number,
  resourceId: number
): Promise<OccurrenceResourceDownloadResult> {
  if (!env.OCCURRENCE_RESOURCES) {
    return { status: "storage_unavailable" };
  }

  const context = await getOccurrenceResourceContext(
    env,
    organizationId,
    generatedScheduleId,
    occurrenceId
  );

  if (!context) {
    return { status: "not_found" };
  }

  const row = await env.DB.prepare(
    `
    SELECT original_filename, display_name, storage_key, mime_type
    FROM generated_schedule_occurrence_resources
    WHERE id = ? AND occurrence_id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(resourceId, occurrenceId, organizationId)
    .first<{
      original_filename: string;
      display_name: string | null;
      storage_key: string;
      mime_type: string;
    }>();

  if (!row) {
    return { status: "resource_not_found" };
  }

  const object = await env.OCCURRENCE_RESOURCES.get(row.storage_key);

  if (!object) {
    return { status: "resource_not_found" };
  }

  return {
    status: "ok",
    object,
    originalFilename: row.original_filename,
    displayName: row.display_name,
    mimeType: row.mime_type
  };
}
