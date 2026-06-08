import { createPasswordResetPlainToken, sha256Hex } from "../auth/passwordReset";
import {
  createVolunteerSubmissionEditToken,
  volunteerEditTokenExpiresAtFromNow
} from "../db/volunteerSubmissionEditTokens";
import { findMostRecentActiveSubmissionByFormAndEmail } from "../db/volunteerSubmissionLookup";
import { sendVolunteerSubmissionUpdateLinkEmail } from "../email/sendVolunteerSubmissionUpdateLink";
import { getFrontendOrigin } from "../env";
import type { Env } from "../types";

export const VOLUNTEER_UPDATE_LINK_ACK =
  "If we found a matching submission, we sent an update link.";

export async function requestVolunteerSubmissionUpdateLink(
  env: Env,
  input: {
    organizationSlug: string;
    organizationName: string;
    formId: number;
    email: string;
    sendEmail: boolean;
  }
): Promise<void> {
  const normalized = input.email.trim().toLowerCase();
  if (!normalized || !input.sendEmail) {
    return;
  }

  const submission = await findMostRecentActiveSubmissionByFormAndEmail(
    env,
    input.formId,
    normalized
  );

  if (!submission) {
    return;
  }

  const plainToken = createPasswordResetPlainToken();
  const tokenHash = await sha256Hex(plainToken);

  await createVolunteerSubmissionEditToken(
    env,
    submission.id,
    tokenHash,
    volunteerEditTokenExpiresAtFromNow()
  );

  const origin = getFrontendOrigin(env).replace(/\/$/, "");
  const updateUrl = `${origin}/${input.organizationSlug}/volunteer/update?token=${encodeURIComponent(plainToken)}`;

  try {
    await sendVolunteerSubmissionUpdateLinkEmail(env, {
      to: normalized,
      organizationName: input.organizationName,
      updateUrl
    });
  } catch (error) {
    console.error("Failed to send volunteer submission update link", error);
  }
}
