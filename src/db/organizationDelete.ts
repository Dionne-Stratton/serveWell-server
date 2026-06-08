import type { Env } from "../types";

/**
 * Removes all staff access for an organization, then deletes the org row.
 * Explicit deletes avoid orphaned admin_users if a new org reuses the same id.
 */
export async function permanentlyDeleteOrganization(
  env: Env,
  organizationId: number
): Promise<boolean> {
  await env.DB.batch([
    env.DB.prepare(
      `
      DELETE FROM admin_invites
      WHERE organization_id = ?
      `
    ).bind(organizationId),
    env.DB.prepare(
      `
      DELETE FROM admin_notes
      WHERE organization_id = ?
      `
    ).bind(organizationId),
    env.DB.prepare(
      `
      DELETE FROM password_reset_tokens
      WHERE admin_user_id IN (
        SELECT id FROM admin_users WHERE organization_id = ?
      )
      `
    ).bind(organizationId),
    env.DB.prepare(
      `
      DELETE FROM admin_users
      WHERE organization_id = ?
      `
    ).bind(organizationId)
  ]);

  const result = await env.DB.prepare(
    `
    DELETE FROM organizations
    WHERE id = ?
    `
  )
    .bind(organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}
