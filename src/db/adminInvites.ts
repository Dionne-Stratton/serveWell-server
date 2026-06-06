import type { Env } from "../types";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface AdminInviteRecord {
  id: number;
  organizationId: number;
  email: string;
  invitedByAdminUserId: number;
  expiresAt: string;
  acceptedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

interface InviteRow {
  id: number;
  organization_id: number;
  email: string;
  invited_by_admin_user_id: number;
  token_hash: string;
  expires_at: string;
  accepted_at: string | null;
  revoked_at: string | null;
  created_at: string;
}

function mapInviteRow(row: InviteRow): AdminInviteRecord {
  return {
    id: row.id,
    organizationId: row.organization_id,
    email: row.email,
    invitedByAdminUserId: row.invited_by_admin_user_id,
    expiresAt: row.expires_at,
    acceptedAt: row.accepted_at,
    revokedAt: row.revoked_at,
    createdAt: row.created_at
  };
}

export function inviteExpiresAtFromNow(): string {
  return new Date(Date.now() + INVITE_TTL_MS).toISOString();
}

export async function createAdminInvite(
  env: Env,
  input: {
    organizationId: number;
    email: string;
    invitedByAdminUserId: number;
    tokenHash: string;
    expiresAt: string;
  }
): Promise<AdminInviteRecord> {
  await env.DB.prepare(
    `
    INSERT INTO admin_invites (
      organization_id,
      email,
      invited_by_admin_user_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.organizationId,
      input.email,
      input.invitedByAdminUserId,
      input.tokenHash,
      input.expiresAt
    )
    .run();

  const row = await env.DB.prepare(
    `
    SELECT *
    FROM admin_invites
    WHERE organization_id = ? AND lower(email) = lower(?)
    ORDER BY id DESC
    LIMIT 1
    `
  )
    .bind(input.organizationId, input.email)
    .first<InviteRow>();

  if (!row) {
    throw new Error("Admin invite was not persisted.");
  }

  return mapInviteRow(row);
}

export async function findPendingInviteByOrgAndEmail(
  env: Env,
  organizationId: number,
  email: string
): Promise<AdminInviteRecord | null> {
  const row = await env.DB.prepare(
    `
    SELECT *
    FROM admin_invites
    WHERE organization_id = ?
      AND lower(email) = lower(?)
      AND accepted_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    ORDER BY id DESC
    LIMIT 1
    `
  )
    .bind(organizationId, email)
    .first<InviteRow>();

  return row ? mapInviteRow(row) : null;
}

export async function listPendingInvitesForOrganization(
  env: Env,
  organizationId: number
): Promise<AdminInviteRecord[]> {
  const result = await env.DB.prepare(
    `
    SELECT *
    FROM admin_invites
    WHERE organization_id = ?
      AND accepted_at IS NULL
      AND revoked_at IS NULL
      AND expires_at > CURRENT_TIMESTAMP
    ORDER BY created_at DESC
    `
  )
    .bind(organizationId)
    .all<InviteRow>();

  return (result.results ?? []).map(mapInviteRow);
}

export async function findValidInviteByTokenHash(
  env: Env,
  tokenHash: string
): Promise<(AdminInviteRecord & { organizationName: string; organizationSlug: string }) | null> {
  const row = await env.DB.prepare(
    `
    SELECT
      ai.*,
      o.name AS organization_name,
      o.slug AS organization_slug
    FROM admin_invites ai
    INNER JOIN organizations o ON o.id = ai.organization_id
    WHERE ai.token_hash = ?
      AND ai.accepted_at IS NULL
      AND ai.revoked_at IS NULL
      AND ai.expires_at > CURRENT_TIMESTAMP
      AND o.is_active = 1
    LIMIT 1
    `
  )
    .bind(tokenHash)
    .first<
      InviteRow & {
        organization_name: string;
        organization_slug: string;
      }
    >();

  if (!row) {
    return null;
  }

  return {
    ...mapInviteRow(row),
    organizationName: row.organization_name,
    organizationSlug: row.organization_slug
  };
}

export async function markAdminInviteAccepted(
  env: Env,
  inviteId: number
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE admin_invites
    SET accepted_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `
  )
    .bind(inviteId)
    .run();
}

export async function revokeAdminInvite(
  env: Env,
  inviteId: number,
  organizationId: number
): Promise<boolean> {
  const result = await env.DB.prepare(
    `
    UPDATE admin_invites
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND organization_id = ?
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    `
  )
    .bind(inviteId, organizationId)
    .run();

  return (result.meta.changes ?? 0) > 0;
}

export async function revokePendingInvitesForEmailInOrg(
  env: Env,
  organizationId: number,
  email: string
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE admin_invites
    SET revoked_at = CURRENT_TIMESTAMP
    WHERE organization_id = ?
      AND lower(email) = lower(?)
      AND accepted_at IS NULL
      AND revoked_at IS NULL
    `
  )
    .bind(organizationId, email)
    .run();
}
