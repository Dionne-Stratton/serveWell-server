import type { Env } from "../types";

export const PLANNING_CENTER_PROVIDER = "planning_center";
const DISPLAY_NAME = "Planning Center";

interface IntegrationRow {
  id: number;
  organization_id: number;
  provider: string;
  status: "not_connected" | "connected" | "disabled" | "error";
  display_name: string;
  external_organization_id: string | null;
  external_organization_name: string | null;
  connected_by_admin_user_id: number | null;
  token_type: string | null;
  scope: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  access_token_expires_at: string | null;
  settings_json: string | null;
  last_connected_at: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

interface OAuthStateRow {
  id: number;
  provider: string;
  state: string;
  organization_id: number;
  admin_user_id: number;
  code_verifier: string;
  redirect_path: string | null;
  expires_at: string;
  consumed_at: string | null;
}

export interface PlanningCenterIntegration {
  id: number;
  organizationId: number;
  provider: "planning_center";
  status: "not_connected" | "connected" | "disabled" | "error";
  displayName: string;
  externalOrganizationId: string | null;
  externalOrganizationName: string | null;
  connectedByAdminUserId: number | null;
  tokenType: string | null;
  scope: string | null;
  accessTokenEncrypted: string | null;
  refreshTokenEncrypted: string | null;
  accessTokenExpiresAt: string | null;
  lastConnectedAt: string | null;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PlanningCenterOAuthState {
  id: number;
  organizationId: number;
  adminUserId: number;
  codeVerifier: string;
  redirectPath: string | null;
  expiresAt: string;
}

export async function getPlanningCenterIntegration(
  env: Env,
  organizationId: number
): Promise<PlanningCenterIntegration | null> {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM organization_integrations
    WHERE organization_id = ? AND provider = ?
  `
  )
    .bind(organizationId, PLANNING_CENTER_PROVIDER)
    .first<IntegrationRow>();

  return row ? mapIntegration(row) : null;
}

export async function createPlanningCenterOAuthState(
  env: Env,
  input: {
    state: string;
    organizationId: number;
    adminUserId: number;
    codeVerifier: string;
    redirectPath: string;
    expiresAt: string;
  }
): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO oauth_states (
      provider,
      state,
      organization_id,
      admin_user_id,
      code_verifier,
      redirect_path,
      expires_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `
  )
    .bind(
      PLANNING_CENTER_PROVIDER,
      input.state,
      input.organizationId,
      input.adminUserId,
      input.codeVerifier,
      input.redirectPath,
      input.expiresAt
    )
    .run();
}

export async function consumePlanningCenterOAuthState(
  env: Env,
  state: string
): Promise<PlanningCenterOAuthState | null> {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM oauth_states
    WHERE provider = ?
      AND state = ?
      AND consumed_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
  `
  )
    .bind(PLANNING_CENTER_PROVIDER, state)
    .first<OAuthStateRow>();

  if (!row) {
    return null;
  }

  await env.DB.prepare(
    `
    UPDATE oauth_states
    SET consumed_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `
  )
    .bind(row.id)
    .run();

  return {
    id: row.id,
    organizationId: row.organization_id,
    adminUserId: row.admin_user_id,
    codeVerifier: row.code_verifier,
    redirectPath: row.redirect_path,
    expiresAt: row.expires_at
  };
}

export async function updatePlanningCenterIntegrationSettings(
  env: Env,
  organizationId: number,
  settings: Record<string, unknown>
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE organization_integrations
    SET settings_json = ?, updated_at = CURRENT_TIMESTAMP
    WHERE organization_id = ? AND provider = ?
  `
  )
    .bind(JSON.stringify(settings), organizationId, PLANNING_CENTER_PROVIDER)
    .run();
}

export async function getPlanningCenterIntegrationSettings(
  env: Env,
  organizationId: number
): Promise<Record<string, unknown> | null> {
  const row = await env.DB.prepare(
    `
    SELECT settings_json
    FROM organization_integrations
    WHERE organization_id = ? AND provider = ?
  `
  )
    .bind(organizationId, PLANNING_CENTER_PROVIDER)
    .first<{ settings_json: string | null }>();

  if (!row?.settings_json) {
    return null;
  }

  try {
    return JSON.parse(row.settings_json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function upsertConnectedPlanningCenterIntegration(
  env: Env,
  input: {
    organizationId: number;
    adminUserId: number;
    accessTokenEncrypted: string;
    refreshTokenEncrypted: string;
    tokenType: string;
    scope: string | null;
    accessTokenExpiresAt: string;
    externalOrganizationId: string | null;
    externalOrganizationName: string | null;
    settingsJson: string;
    lastError?: string | null;
  }
): Promise<PlanningCenterIntegration> {
  await env.DB.prepare(
    `
    INSERT INTO organization_integrations (
      organization_id,
      provider,
      status,
      display_name,
      external_organization_id,
      external_organization_name,
      connected_by_admin_user_id,
      token_type,
      scope,
      access_token_encrypted,
      refresh_token_encrypted,
      access_token_expires_at,
      settings_json,
      last_connected_at,
      last_error,
      updated_at
    )
    VALUES (?, ?, 'connected', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(organization_id, provider) DO UPDATE SET
      status = 'connected',
      display_name = excluded.display_name,
      external_organization_id = excluded.external_organization_id,
      external_organization_name = excluded.external_organization_name,
      connected_by_admin_user_id = excluded.connected_by_admin_user_id,
      token_type = excluded.token_type,
      scope = excluded.scope,
      access_token_encrypted = excluded.access_token_encrypted,
      refresh_token_encrypted = excluded.refresh_token_encrypted,
      access_token_expires_at = excluded.access_token_expires_at,
      settings_json = excluded.settings_json,
      last_connected_at = CURRENT_TIMESTAMP,
      last_error = excluded.last_error,
      updated_at = CURRENT_TIMESTAMP
  `
  )
    .bind(
      input.organizationId,
      PLANNING_CENTER_PROVIDER,
      DISPLAY_NAME,
      input.externalOrganizationId,
      input.externalOrganizationName,
      input.adminUserId,
      input.tokenType,
      input.scope,
      input.accessTokenEncrypted,
      input.refreshTokenEncrypted,
      input.accessTokenExpiresAt,
      input.settingsJson,
      input.lastError ?? null
    )
    .run();

  const integration = await getPlanningCenterIntegration(env, input.organizationId);

  if (!integration) {
    throw new Error("Planning Center integration was not persisted.");
  }

  return integration;
}

export async function updatePlanningCenterAccessTokens(
  env: Env,
  organizationId: number,
  input: {
    accessTokenEncrypted: string;
    refreshTokenEncrypted?: string;
    accessTokenExpiresAt: string;
  }
): Promise<void> {
  if (input.refreshTokenEncrypted) {
    await env.DB.prepare(
      `
      UPDATE organization_integrations
      SET
        access_token_encrypted = ?,
        refresh_token_encrypted = ?,
        access_token_expires_at = ?,
        status = 'connected',
        last_error = NULL,
        updated_at = CURRENT_TIMESTAMP
      WHERE organization_id = ? AND provider = ?
      `
    )
      .bind(
        input.accessTokenEncrypted,
        input.refreshTokenEncrypted,
        input.accessTokenExpiresAt,
        organizationId,
        PLANNING_CENTER_PROVIDER
      )
      .run();

    return;
  }

  await env.DB.prepare(
    `
    UPDATE organization_integrations
    SET
      access_token_encrypted = ?,
      access_token_expires_at = ?,
      status = 'connected',
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE organization_id = ? AND provider = ?
    `
  )
    .bind(
      input.accessTokenEncrypted,
      input.accessTokenExpiresAt,
      organizationId,
      PLANNING_CENTER_PROVIDER
    )
    .run();
}

export async function disconnectPlanningCenterIntegration(
  env: Env,
  organizationId: number
): Promise<PlanningCenterIntegration | null> {
  await env.DB.prepare(
    `
    UPDATE organization_integrations
    SET
      status = 'disabled',
      access_token_encrypted = NULL,
      refresh_token_encrypted = NULL,
      access_token_expires_at = NULL,
      last_error = NULL,
      updated_at = CURRENT_TIMESTAMP
    WHERE organization_id = ? AND provider = ?
  `
  )
    .bind(organizationId, PLANNING_CENTER_PROVIDER)
    .run();

  return getPlanningCenterIntegration(env, organizationId);
}

export function mapPublicPlanningCenterIntegration(
  integration: PlanningCenterIntegration | null
) {
  if (!integration) {
    return {
      provider: PLANNING_CENTER_PROVIDER,
      status: "not_connected",
      displayName: DISPLAY_NAME,
      externalOrganizationName: null,
      lastConnectedAt: null,
      tokenUsable: false
    };
  }

  return {
    provider: integration.provider,
    status: integration.status,
    displayName: integration.displayName,
    externalOrganizationId: integration.externalOrganizationId,
    externalOrganizationName: integration.externalOrganizationName,
    scope: integration.scope,
    accessTokenExpiresAt: integration.accessTokenExpiresAt,
    lastConnectedAt: integration.lastConnectedAt,
    lastError: integration.lastError,
    tokenUsable: false
  };
}

function mapIntegration(row: IntegrationRow): PlanningCenterIntegration {
  return {
    id: row.id,
    organizationId: row.organization_id,
    provider: "planning_center",
    status: row.status,
    displayName: row.display_name,
    externalOrganizationId: row.external_organization_id,
    externalOrganizationName: row.external_organization_name,
    connectedByAdminUserId: row.connected_by_admin_user_id,
    tokenType: row.token_type,
    scope: row.scope,
    accessTokenEncrypted: row.access_token_encrypted,
    refreshTokenEncrypted: row.refresh_token_encrypted,
    accessTokenExpiresAt: row.access_token_expires_at,
    lastConnectedAt: row.last_connected_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
