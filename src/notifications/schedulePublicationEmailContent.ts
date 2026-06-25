import { createPasswordResetPlainToken, sha256Hex } from "../auth/passwordReset";
import {
  createOccurrenceResourceAccessToken,
  occurrenceResourceAccessTokenExpiresAtFromNow
} from "../db/occurrenceResourceAccessTokens";
import { getPublicApiOrigin } from "../env";
import type { Env } from "../types";
import type { PublishEmailResourceItem } from "../db/generatedSchedulePublishEmailData";

export interface SchedulePublicationResourceLink {
  label: string;
  downloadUrl: string;
}

export async function buildResourceDownloadLinks(
  env: Env,
  organizationId: number,
  submissionId: number,
  items: PublishEmailResourceItem[]
): Promise<SchedulePublicationResourceLink[]> {
  const origin = getPublicApiOrigin(env);
  const expiresAt = occurrenceResourceAccessTokenExpiresAtFromNow();
  const links: SchedulePublicationResourceLink[] = [];

  for (const item of items) {
    const plainToken = createPasswordResetPlainToken();
    const tokenHash = await sha256Hex(plainToken);

    await createOccurrenceResourceAccessToken(env, {
      organizationId,
      resourceId: item.id,
      submissionId,
      tokenHash,
      expiresAt
    });

    links.push({
      label: item.label,
      downloadUrl: `${origin}/api/public/schedule-resources/download/${encodeURIComponent(plainToken)}`
    });
  }

  return links;
}
