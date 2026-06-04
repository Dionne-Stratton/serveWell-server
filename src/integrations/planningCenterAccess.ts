import { decryptPlanningCenterSecret } from "./planningCenterCrypto";
import { getPlanningCenterIntegration } from "../db/planningCenterIntegrations";
import type { Env } from "../types";

export async function getPlanningCenterAccessToken(
  env: Env,
  organizationId: number
): Promise<string | null> {
  const integration = await getPlanningCenterIntegration(env, organizationId);

  if (!integration || integration.status !== "connected" || !integration.accessTokenEncrypted) {
    return null;
  }

  if (integration.accessTokenExpiresAt) {
    const expiresAt = Date.parse(integration.accessTokenExpiresAt);

    if (!Number.isNaN(expiresAt) && expiresAt <= Date.now()) {
      return null;
    }
  }

  return decryptPlanningCenterSecret(integration.accessTokenEncrypted, env);
}
