import type { Env } from "../types";

export async function permanentlyDeleteOrganization(
  env: Env,
  organizationId: number
): Promise<boolean> {
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
