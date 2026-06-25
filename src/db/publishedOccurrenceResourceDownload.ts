import type { Env } from "../types";
import type { OccurrenceResourceDownloadResult } from "./adminGeneratedOccurrenceResources";

export async function getPublishedOccurrenceResourceForVolunteer(
  env: Env,
  resourceId: number,
  submissionId: number
): Promise<OccurrenceResourceDownloadResult | { status: "forbidden" }> {
  if (!env.OCCURRENCE_RESOURCES) {
    return { status: "storage_unavailable" };
  }

  const row = await env.DB.prepare(
    `
    SELECT
      r.original_filename,
      r.display_name,
      r.storage_key,
      r.mime_type,
      r.schedule_serving_area_id,
      r.occurrence_id
    FROM generated_schedule_occurrence_resources r
    INNER JOIN generated_schedule_occurrences gso ON gso.id = r.occurrence_id
    INNER JOIN generated_schedules gs ON gs.id = gso.generated_schedule_id
    WHERE r.id = ?
      AND gs.status = 'published'
      AND EXISTS (
        SELECT 1
        FROM generated_schedule_occurrence_assignments a
        INNER JOIN generated_schedule_occurrence_requirements greq ON greq.id = a.requirement_id
        WHERE a.occurrence_id = r.occurrence_id
          AND a.submission_id = ?
          AND (
            r.schedule_serving_area_id IS NULL
            OR greq.schedule_serving_area_id = r.schedule_serving_area_id
          )
      )
    LIMIT 1
    `
  )
    .bind(resourceId, submissionId)
    .first<{
      original_filename: string;
      display_name: string | null;
      storage_key: string;
      mime_type: string;
      schedule_serving_area_id: number | null;
      occurrence_id: number;
    }>();

  if (!row) {
    return { status: "forbidden" };
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
