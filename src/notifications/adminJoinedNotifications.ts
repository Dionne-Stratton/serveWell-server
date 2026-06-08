import { listOwnersForAdminJoinedNotification } from "../db/adminNotificationPreferences";
import { sendAdminJoinedNotificationEmail } from "../email/sendAdminJoinedNotification";
import { DEMO_ORGANIZATION_SLUG } from "../constants/demo";
import { getFrontendOrigin } from "../env";
import type { Env } from "../types";

export interface AdminJoinedNotificationContext {
  organizationId: number;
  organizationSlug: string;
  organizationName: string;
  joinedAdminUserId: number;
  joinedAdminDisplayName: string;
  joinedAdminEmail: string;
}

function buildProfileUrl(organizationSlug: string, env: Env): string {
  const origin = getFrontendOrigin(env).replace(/\/$/, "");
  return `${origin}/${organizationSlug}/admin/profile`;
}

export async function notifyOwnersOfAdminJoined(
  env: Env,
  context: AdminJoinedNotificationContext
): Promise<void> {
  if (context.organizationSlug === DEMO_ORGANIZATION_SLUG) {
    return;
  }

  const recipients = await listOwnersForAdminJoinedNotification(
    env,
    context.organizationId,
    context.joinedAdminUserId
  );

  if (recipients.length === 0) {
    return;
  }

  const profileUrl = buildProfileUrl(context.organizationSlug, env);

  await Promise.all(
    recipients.map((recipient) =>
      sendAdminJoinedNotificationEmail(env, {
        to: recipient.email,
        recipientDisplayName: recipient.displayName,
        organizationName: context.organizationName,
        joinedAdminDisplayName: context.joinedAdminDisplayName,
        joinedAdminEmail: context.joinedAdminEmail,
        profileUrl
      }).catch((error) => {
        console.error("Failed admin joined notification email", recipient.email, error);
      })
    )
  );
}
