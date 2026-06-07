import { listActiveOrganizationsForAdminEmail } from "../db/adminUsers";
import { sendChurchSlugHintEmail } from "../email/sendChurchSlugHint";
import { getFrontendOrigin } from "../env";
import type { Env } from "../types";

export async function requestChurchSlugHintForEmail(env: Env, email: string): Promise<void> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) {
    return;
  }

  const organizations = await listActiveOrganizationsForAdminEmail(env, normalized);
  if (organizations.length === 0) {
    return;
  }

  const origin = getFrontendOrigin(env).replace(/\/$/, "");
  const signInBase = `${origin}/login`;

  const displayName = await resolveDisplayNameForHint(env, normalized);

  await sendChurchSlugHintEmail(env, {
    to: normalized,
    displayName,
    organizations: organizations.map((org) => ({
      name: org.name,
      slug: org.slug,
      signInUrl: signInBase
    }))
  });
}

async function resolveDisplayNameForHint(env: Env, email: string): Promise<string> {
  const row = await env.DB.prepare(
    `
    SELECT display_name
    FROM admin_users
    WHERE lower(email) = lower(?)
      AND is_active = 1
    ORDER BY id ASC
    LIMIT 1
    `
  )
    .bind(email)
    .first<{ display_name: string }>();

  return row?.display_name?.trim() ?? "";
}
