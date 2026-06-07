import { listAdminsForSubmissionNotification } from "../db/adminNotificationPreferences";
import { sendSubmissionNotificationEmail } from "../email/sendSubmissionNotification";
import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import { getFrontendOrigin } from "../env";
import { submissionStatusLabel } from "../lib/submissionStatusLabels";
import type { Env } from "../types";

export interface SubmissionNotificationContext {
  organizationId: number;
  organizationSlug: string;
  organizationName: string;
  submissionId: number;
}

async function loadVolunteerName(
  env: Env,
  organizationId: number,
  submissionId: number
): Promise<string | null> {
  const row = await env.DB.prepare(
    `
    SELECT first_name, last_name
    FROM volunteer_submissions
    WHERE id = ? AND organization_id = ?
    LIMIT 1
    `
  )
    .bind(submissionId, organizationId)
    .first<{ first_name: string; last_name: string }>();

  if (!row) {
    return null;
  }

  const name = `${row.first_name} ${row.last_name}`.trim();
  return name || null;
}

function buildSubmissionDetailUrl(organizationSlug: string, submissionId: number, env: Env): string {
  const origin = getFrontendOrigin(env).replace(/\/$/, "");
  return `${origin}/${organizationSlug}/admin/volunteers/${submissionId}`;
}

export async function notifyAdminsOfNewPublicSubmission(
  env: Env,
  context: SubmissionNotificationContext
): Promise<void> {
  if (context.organizationSlug === DEMO_ORGANIZATION_SLUG) {
    return;
  }

  const volunteerName = await loadVolunteerName(
    env,
    context.organizationId,
    context.submissionId
  );

  if (!volunteerName) {
    return;
  }

  const recipients = await listAdminsForSubmissionNotification(
    env,
    context.organizationId,
    "new_submissions"
  );

  if (recipients.length === 0) {
    return;
  }

  const detailUrl = buildSubmissionDetailUrl(context.organizationSlug, context.submissionId, env);
  const statusLabel = submissionStatusLabel("new");

  await Promise.all(
    recipients.map((recipient) =>
      sendSubmissionNotificationEmail(env, {
        to: recipient.email,
        recipientDisplayName: recipient.displayName,
        organizationName: context.organizationName,
        volunteerName,
        event: "new_submission",
        statusLabel,
        detailUrl
      }).catch((error) => {
        console.error("Failed new submission notification email", recipient.email, error);
      })
    )
  );
}

export async function notifyAdminsOfReadyToSchedule(
  env: Env,
  context: SubmissionNotificationContext,
  excludeAdminUserId: number
): Promise<void> {
  if (context.organizationSlug === DEMO_ORGANIZATION_SLUG) {
    return;
  }

  const volunteerName = await loadVolunteerName(
    env,
    context.organizationId,
    context.submissionId
  );

  if (!volunteerName) {
    return;
  }

  const recipients = await listAdminsForSubmissionNotification(
    env,
    context.organizationId,
    "ready_to_schedule",
    excludeAdminUserId
  );

  if (recipients.length === 0) {
    return;
  }

  const detailUrl = buildSubmissionDetailUrl(context.organizationSlug, context.submissionId, env);
  const statusLabel = submissionStatusLabel("approved_ready_to_schedule");

  await Promise.all(
    recipients.map((recipient) =>
      sendSubmissionNotificationEmail(env, {
        to: recipient.email,
        recipientDisplayName: recipient.displayName,
        organizationName: context.organizationName,
        volunteerName,
        event: "ready_to_schedule",
        statusLabel,
        detailUrl
      }).catch((error) => {
        console.error("Failed ready-to-schedule notification email", recipient.email, error);
      })
    )
  );
}
