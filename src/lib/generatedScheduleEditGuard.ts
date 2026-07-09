import { badRequest, notFound } from "../http/responses";
import type { Env } from "../types";

/** Blocks mutations when a generated schedule is archived. */
export async function rejectIfGeneratedScheduleArchived(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<Response | null> {
  const row = await env.DB.prepare(
    `
    SELECT status
    FROM generated_schedules
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(generatedScheduleId, organizationId)
    .first<{ status: string }>();

  if (!row) {
    return notFound();
  }

  if (row.status === "archived") {
    return badRequest("Archived schedules are read-only.", "SCHEDULE_ARCHIVED");
  }

  return null;
}
