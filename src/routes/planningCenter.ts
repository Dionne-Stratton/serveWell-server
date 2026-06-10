import { requireAdmin } from "../auth/adminGuard";
import { requireOwner } from "../auth/adminOwnerGuard";
import { getFrontendOrigin } from "../env";
import { findActiveOrganizationById } from "../db/organizations";
import {
  consumePlanningCenterOAuthState,
  createPlanningCenterOAuthState,
  disconnectPlanningCenterIntegration,
  getPlanningCenterIntegration,
  getPlanningCenterIntegrationSettings,
  mapPublicPlanningCenterIntegration,
  upsertConnectedPlanningCenterIntegration
} from "../db/planningCenterIntegrations";
import {
  buildPlanningCenterAuthorizationUrl,
  exchangePlanningCenterCode,
  getPlanningCenterUserInfo,
  revokePlanningCenterToken
} from "../integrations/planningCenterClient";
import { getPlanningCenterAccessToken } from "../integrations/planningCenterAccess";
import { ensureOrganizationPlanningCenterFormTabsOnConnect } from "../integrations/planningCenterFormTabs";
import {
  createCodeChallenge,
  createRandomUrlSafeString,
  decryptPlanningCenterSecret,
  encryptPlanningCenterSecret
} from "../integrations/planningCenterCrypto";
import { json, methodNotAllowed, notFound, serverError } from "../http/responses";
import { tryPlanningCenterImportRoute } from "./planningCenterImport";
import type { Env } from "../types";

export async function planningCenterRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  const importRouteResponse = await tryPlanningCenterImportRoute(request, env, url.pathname);

  if (importRouteResponse) {
    return importRouteResponse;
  }

  if (url.pathname === "/api/admin/integrations/planning-center") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return getStatus(request, env);
  }

  if (url.pathname === "/api/admin/integrations/planning-center/connect") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return connect(request, env);
  }

  if (url.pathname === "/api/admin/integrations/planning-center/disconnect") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return disconnect(request, env);
  }

  if (url.pathname === "/api/planning-center/callback") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return callback(request, env);
  }

  return notFound();
}

async function getStatus(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organizationId = auth.admin!.organizationId;
    const integration = await getPlanningCenterIntegration(env, organizationId);
    const publicIntegration = mapPublicPlanningCenterIntegration(integration);

    if (integration?.status === "connected") {
      publicIntegration.tokenUsable = Boolean(
        await getPlanningCenterAccessToken(env, organizationId)
      );
    }

    return json({
      success: true,
      data: {
        integration: publicIntegration
      }
    });
  } catch (error) {
    console.error("Failed Planning Center status lookup", error);
    return serverError("Unable to load Planning Center status.");
  }
}

async function connect(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireOwner(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organization = await findActiveOrganizationById(env, auth.admin!.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    const codeVerifier = createRandomUrlSafeString(64);
    const codeChallenge = await createCodeChallenge(codeVerifier);
    const state = createRandomUrlSafeString(32);
    const redirectPath = `/${organization.slug}/admin`;

    await createPlanningCenterOAuthState(env, {
      state,
      organizationId: auth.admin!.organizationId,
      adminUserId: auth.admin!.id,
      codeVerifier,
      redirectPath,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
    });

    const authorizationUrl = buildPlanningCenterAuthorizationUrl({
      env,
      state,
      codeChallenge
    });

    return json({
      success: true,
      data: {
        authorizationUrl
      }
    });
  } catch (error) {
    console.error("Failed to start Planning Center OAuth", error);
    return serverError("Unable to start Planning Center connection.");
  }
}

async function callback(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");
  const frontendOrigin = getFrontendOrigin(env);

  if (error) {
    return redirectToFrontend(frontendOrigin, "/login", {
      planningCenter: "error",
      reason: error
    });
  }

  if (!code || !state) {
    return redirectToFrontend(frontendOrigin, "/login", {
      planningCenter: "error",
      reason: "missing_code_or_state"
    });
  }

  try {
    const oauthState = await consumePlanningCenterOAuthState(env, state);

    if (!oauthState) {
      return redirectToFrontend(frontendOrigin, "/login", {
        planningCenter: "error",
        reason: "invalid_state"
      });
    }

    const token = await exchangePlanningCenterCode({
      env,
      code,
      codeVerifier: oauthState.codeVerifier
    });
    const userInfo = await getPlanningCenterUserInfo(token.access_token);
    const expiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    const priorSettings = await getPlanningCenterIntegrationSettings(
      env,
      oauthState.organizationId
    );
    const { formTabs, hasError: formTabsSetupError } =
      await ensureOrganizationPlanningCenterFormTabsOnConnect(
        env,
        oauthState.organizationId,
        token.access_token,
        priorSettings
      );

    const firstTabError = Object.values(formTabs).find((tab) => tab.status === "error");

    await upsertConnectedPlanningCenterIntegration(env, {
      organizationId: oauthState.organizationId,
      adminUserId: oauthState.adminUserId,
      accessTokenEncrypted: await encryptPlanningCenterSecret(token.access_token, env),
      refreshTokenEncrypted: await encryptPlanningCenterSecret(token.refresh_token, env),
      tokenType: token.token_type,
      scope: token.scope ?? null,
      accessTokenExpiresAt: expiresAt,
      externalOrganizationId: normalizeOptionalString(userInfo.organization_id),
      externalOrganizationName: userInfo.organization_name ?? null,
      settingsJson: JSON.stringify({
        userInfo: {
          sub: userInfo.sub,
          name: userInfo.name ?? null,
          email: userInfo.email ?? null
        },
        formTabs
      }),
      lastError: formTabsSetupError ? firstTabError?.error ?? null : null
    });

    const redirectParams: Record<string, string> = {
      planningCenter: "connected"
    };

    if (formTabsSetupError) {
      redirectParams.fieldsSetup = "error";
    }

    return redirectToFrontend(frontendOrigin, oauthState.redirectPath ?? "/login", redirectParams);
  } catch (callbackError) {
    console.error("Failed Planning Center OAuth callback", callbackError);
    return redirectToFrontend(frontendOrigin, "/login", {
      planningCenter: "error",
      reason: "callback_failed"
    });
  }
}

async function disconnect(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireOwner(request, env);

    if (auth.response) {
      return auth.response;
    }

    const integration = await getPlanningCenterIntegration(env, auth.admin!.organizationId);

    if (!integration) {
      return json({
        success: true,
        data: {
          integration: mapPublicPlanningCenterIntegration(null)
        }
      });
    }

    if (integration.refreshTokenEncrypted) {
      try {
        await revokePlanningCenterToken({
          env,
          token: await decryptPlanningCenterSecret(integration.refreshTokenEncrypted, env),
          tokenTypeHint: "refresh_token"
        });
      } catch (revokeError) {
        console.error("Failed to revoke Planning Center refresh token", revokeError);
      }
    }

    const updated = await disconnectPlanningCenterIntegration(
      env,
      auth.admin!.organizationId
    );

    return json({
      success: true,
      data: {
        integration: mapPublicPlanningCenterIntegration(updated)
      }
    });
  } catch (error) {
    console.error("Failed to disconnect Planning Center", error);
    return serverError("Unable to disconnect Planning Center.");
  }
}

function redirectToFrontend(
  origin: string,
  path: string,
  params: Record<string, string>
): Response {
  const redirectUrl = new URL(path, origin);

  for (const [key, value] of Object.entries(params)) {
    redirectUrl.searchParams.set(key, value);
  }

  return Response.redirect(redirectUrl.toString(), 302);
}

function normalizeOptionalString(value: unknown): string | null {
  if (typeof value === "number") {
    return String(value);
  }

  return typeof value === "string" && value.trim() ? value.trim() : null;
}
