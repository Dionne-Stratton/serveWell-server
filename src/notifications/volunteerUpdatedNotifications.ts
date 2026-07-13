import { listAdminsForVolunteerUpdatedNotification } from "../db/adminNotificationPreferences";
import { sendSubmissionNotificationEmail } from "../email/sendSubmissionNotification";
import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import { getFrontendOrigin } from "../env";
import type { Env } from "../types";

export interface VolunteerUpdatedNotificationContext {
  organizationId: number;
  organizationSlug: string;
  organizationName: string;
  submissionId: number;
  volunteerName: string;
}

function buildSubmissionDetailUrl(organizationSlug: string, submissionId: number, env: Env): string {
  const origin = getFrontendOrigin(env).replace(/\/$/, "");
  return `${origin}/${organizationSlug}/admin/volunteers/${submissionId}`;
}

export async function notifyAdminsOfVolunteerSelfUpdate(
  env: Env,
  context: VolunteerUpdatedNotificationContext
): Promise<void> {
  if (context.organizationSlug === DEMO_ORGANIZATION_SLUG) {
    return;
  }

  const recipients = await listAdminsForVolunteerUpdatedNotification(
    env,
    context.organizationId,
    context.submissionId
  );

  if (recipients.length === 0) {
    return;
  }

  const detailUrl = buildSubmissionDetailUrl(context.organizationSlug, context.submissionId, env);

  await Promise.all(
    recipients.map((recipient) =>
      sendSubmissionNotificationEmail(env, {
        to: recipient.email,
        recipientDisplayName: recipient.displayName,
        organizationName: context.organizationName,
        volunteerName: context.volunteerName,
        event: "volunteer_updated",
        statusLabel: "Volunteer self-edit",
        detailUrl
      }).catch((error) => {
        console.error("Failed volunteer updated notification email", recipient.email, error);
      })
    )
  );
}
