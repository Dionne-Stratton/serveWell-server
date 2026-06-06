import {
  decryptPlanningCenterSecret,
  encryptPlanningCenterSecret
} from "./planningCenterCrypto";
import { refreshPlanningCenterAccessToken } from "./planningCenterClient";
import {
  getPlanningCenterIntegration,
  updatePlanningCenterAccessTokens
} from "../db/planningCenterIntegrations";
import type { Env } from "../types";

/** Refresh slightly before expiry so push/connect handlers do not race the clock. */
const ACCESS_TOKEN_REFRESH_LEEWAY_MS = 2 * 60 * 1000;

export async function getPlanningCenterAccessToken(
  env: Env,
  organizationId: number
): Promise<string | null> {
  const integration = await getPlanningCenterIntegration(env, organizationId);

  if (!integration || integration.status !== "connected" || !integration.accessTokenEncrypted) {
    return null;
  }

  if (!accessTokenNeedsRefresh(integration.accessTokenExpiresAt)) {
    try {
      return await decryptPlanningCenterSecret(integration.accessTokenEncrypted, env);
    } catch (error) {
      console.error("Failed to decrypt Planning Center access token", error);
      return null;
    }
  }

  if (!integration.refreshTokenEncrypted) {
    return null;
  }

  try {
    const refreshToken = await decryptPlanningCenterSecret(
      integration.refreshTokenEncrypted,
      env
    );
    const token = await refreshPlanningCenterAccessToken({ env, refreshToken });
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();
    const accessTokenEncrypted = await encryptPlanningCenterSecret(token.access_token, env);
    const refreshTokenEncrypted = token.refresh_token
      ? await encryptPlanningCenterSecret(token.refresh_token, env)
      : undefined;

    await updatePlanningCenterAccessTokens(env, organizationId, {
      accessTokenEncrypted,
      refreshTokenEncrypted,
      accessTokenExpiresAt: expiresAt
    });

    return token.access_token;
  } catch (error) {
    console.error("Failed to refresh Planning Center access token", error);
    return null;
  }
}

function accessTokenNeedsRefresh(accessTokenExpiresAt: string | null): boolean {
  if (!accessTokenExpiresAt) {
    return false;
  }

  const expiresAtMs = Date.parse(accessTokenExpiresAt);

  if (Number.isNaN(expiresAtMs)) {
    return false;
  }

  return expiresAtMs <= Date.now() + ACCESS_TOKEN_REFRESH_LEEWAY_MS;
}
