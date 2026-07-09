import type { SchedulePendingVolunteerUpdatePayload } from "../notifications/schedulePendingVolunteerUpdatePayload";
import {
  parseSchedulePendingVolunteerUpdatePayload,
  serializeSchedulePendingVolunteerUpdatePayload
} from "../notifications/schedulePendingVolunteerUpdatePayload";
import type { Env } from "../types";

export interface PendingVolunteerUpdateRow {
  id: number;
  submissionId: number;
  payload: SchedulePendingVolunteerUpdatePayload;
}

export async function markScheduleHasUnsentVolunteerUpdates(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE generated_schedules
    SET has_unsent_volunteer_updates = 1,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND organization_id = ?
      AND status = 'published'
    `
  )
    .bind(generatedScheduleId, organizationId)
    .run();
}

export async function insertPendingVolunteerUpdate(
  env: Env,
  organizationId: number,
  generatedScheduleId: number,
  submissionId: number,
  payload: SchedulePendingVolunteerUpdatePayload
): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO generated_schedule_pending_volunteer_updates (
      organization_id,
      generated_schedule_id,
      submission_id,
      payload
    )
    VALUES (?, ?, ?, ?)
    `
  )
    .bind(
      organizationId,
      generatedScheduleId,
      submissionId,
      serializeSchedulePendingVolunteerUpdatePayload(payload)
    )
    .run();

  await markScheduleHasUnsentVolunteerUpdates(env, organizationId, generatedScheduleId);
}

export async function listPendingVolunteerUpdatesForSchedule(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<PendingVolunteerUpdateRow[]> {
  const result = await env.DB.prepare(
    `
    SELECT id, submission_id, payload
    FROM generated_schedule_pending_volunteer_updates
    WHERE generated_schedule_id = ?
      AND organization_id = ?
    ORDER BY id ASC
    `
  )
    .bind(generatedScheduleId, organizationId)
    .all<{ id: number; submission_id: number; payload: string }>();

  const rows: PendingVolunteerUpdateRow[] = [];

  for (const row of result.results ?? []) {
    const payload = parseSchedulePendingVolunteerUpdatePayload(row.payload);

    if (!payload) {
      continue;
    }

    rows.push({
      id: row.id,
      submissionId: row.submission_id,
      payload
    });
  }

  return rows;
}

export async function clearPendingVolunteerUpdatesForSchedule(
  env: Env,
  organizationId: number,
  generatedScheduleId: number
): Promise<void> {
  await env.DB.prepare(
    `
    DELETE FROM generated_schedule_pending_volunteer_updates
    WHERE generated_schedule_id = ? AND organization_id = ?
    `
  )
    .bind(generatedScheduleId, organizationId)
    .run();

  await env.DB.prepare(
    `
    UPDATE generated_schedules
    SET has_unsent_volunteer_updates = 0,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND organization_id = ?
    `
  )
    .bind(generatedScheduleId, organizationId)
    .run();
}
