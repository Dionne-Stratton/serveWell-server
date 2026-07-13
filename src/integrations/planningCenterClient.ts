import { getRequiredEnv } from "../env";
import type { Env } from "../types";

const AUTHORIZATION_URL = "https://api.planningcenteronline.com/oauth/authorize";
const TOKEN_URL = "https://api.planningcenteronline.com/oauth/token";
const REVOKE_URL = "https://api.planningcenteronline.com/oauth/revoke";
const USERINFO_URL = "https://api.planningcenteronline.com/oauth/userinfo";
const DEFAULT_SCOPE = "people openid";
const USER_AGENT = "ServeWell Planning Center Integration (support@simplyservewell.com)";

export interface PlanningCenterTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  refresh_token: string;
  scope?: string;
  created_at?: number;
  id_token?: string;
}

export interface PlanningCenterUserInfo {
  sub: string;
  name?: string;
  email?: string;
  organization_id?: number | string;
  organization_name?: string;
}

export function getPlanningCenterRedirectUri(env: Env): string {
  if (env.ENVIRONMENT === "development" && env.PLANNING_CENTER_REDIRECT_URI_LOCAL) {
    return env.PLANNING_CENTER_REDIRECT_URI_LOCAL;
  }

  return getRequiredEnv(env, "PLANNING_CENTER_REDIRECT_URI");
}

export function buildPlanningCenterAuthorizationUrl(input: {
  env: Env;
  state: string;
  codeChallenge: string;
}): string {
  const url = new URL(AUTHORIZATION_URL);
  url.searchParams.set("client_id", getRequiredEnv(input.env, "PLANNING_CENTER_CLIENT_ID"));
  url.searchParams.set("redirect_uri", getPlanningCenterRedirectUri(input.env));
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DEFAULT_SCOPE);
  url.searchParams.set("state", input.state);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");

  return url.toString();
}

export async function exchangePlanningCenterCode(input: {
  env: Env;
  code: string;
  codeVerifier: string;
}): Promise<PlanningCenterTokenResponse> {
  const body = new FormData();
  body.set("grant_type", "authorization_code");
  body.set("code", input.code);
  body.set("code_verifier", input.codeVerifier);
  body.set("client_id", getRequiredEnv(input.env, "PLANNING_CENTER_CLIENT_ID"));
  body.set("client_secret", getRequiredEnv(input.env, "PLANNING_CENTER_CLIENT_SECRET"));
  body.set("redirect_uri", getPlanningCenterRedirectUri(input.env));

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: planningCenterHeaders(),
    body
  });

  return parsePlanningCenterResponse<PlanningCenterTokenResponse>(response);
}

export async function refreshPlanningCenterAccessToken(input: {
  env: Env;
  refreshToken: string;
}): Promise<PlanningCenterTokenResponse> {
  const body = new FormData();
  body.set("grant_type", "refresh_token");
  body.set("refresh_token", input.refreshToken);
  body.set("client_id", getRequiredEnv(input.env, "PLANNING_CENTER_CLIENT_ID"));
  body.set("client_secret", getRequiredEnv(input.env, "PLANNING_CENTER_CLIENT_SECRET"));

  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: planningCenterHeaders(),
    body
  });

  return parsePlanningCenterResponse<PlanningCenterTokenResponse>(response);
}

export async function getPlanningCenterUserInfo(
  accessToken: string
): Promise<PlanningCenterUserInfo> {
  const response = await fetch(USERINFO_URL, {
    headers: planningCenterHeaders(accessToken)
  });

  return parsePlanningCenterResponse<PlanningCenterUserInfo>(response);
}

export async function revokePlanningCenterToken(input: {
  env: Env;
  token: string;
  tokenTypeHint: "access_token" | "refresh_token";
}): Promise<void> {
  const body = new FormData();
  body.set("token", input.token);
  body.set("token_type_hint", input.tokenTypeHint);
  body.set("client_id", getRequiredEnv(input.env, "PLANNING_CENTER_CLIENT_ID"));
  body.set("client_secret", getRequiredEnv(input.env, "PLANNING_CENTER_CLIENT_SECRET"));

  const response = await fetch(REVOKE_URL, {
    method: "POST",
    headers: planningCenterHeaders(),
    body
  });

  if (!response.ok) {
    throw new Error(`Planning Center revoke failed with status ${response.status}.`);
  }
}

function planningCenterHeaders(accessToken?: string): HeadersInit {
  return {
    "User-Agent": USER_AGENT,
    ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {})
  };
}

async function parsePlanningCenterResponse<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => null);

  if (!response.ok || !body) {
    throw new Error(`Planning Center request failed with status ${response.status}.`);
  }

  return body as T;
}
