import { sendFounderOrganizationSignupEmail } from "../email/sendFounderOrganizationSignup";
import type { Env } from "../types";

export interface FounderOrganizationSignupContext {
  organizationName: string;
  organizationSlug: string;
  ownerDisplayName: string;
  ownerEmail: string;
  signedUpAt: string;
}

export async function notifyFounderOfOrganizationSignup(
  env: Env,
  context: FounderOrganizationSignupContext
): Promise<void> {
  const to = env.FOUNDER_NOTIFY_EMAIL?.trim();

  if (!to) {
    console.info(
      "[ServeWell] Founder signup notification skipped (FOUNDER_NOTIFY_EMAIL not set).",
      context.organizationSlug
    );
    return;
  }

  try {
    await sendFounderOrganizationSignupEmail(env, {
      to,
      organizationName: context.organizationName,
      organizationSlug: context.organizationSlug,
      ownerDisplayName: context.ownerDisplayName,
      ownerEmail: context.ownerEmail,
      signedUpAt: context.signedUpAt
    });
  } catch (error) {
    console.error(
      "Founder organization signup notification failed",
      context.organizationSlug,
      error
    );
  }
}
