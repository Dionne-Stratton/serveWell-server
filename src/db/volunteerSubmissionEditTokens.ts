import type { Env } from "../types";

const EDIT_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export interface VolunteerSubmissionEditTokenRecord {
  id: number;
  submissionId: number;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}

interface TokenRow {
  id: number;
  submission_id: number;
  token_hash: string;
  expires_at: string;
  consumed_at: string | null;
  created_at: string;
}

function mapTokenRow(row: TokenRow): VolunteerSubmissionEditTokenRecord {
  return {
    id: row.id,
    submissionId: row.submission_id,
    expiresAt: row.expires_at,
    consumedAt: row.consumed_at,
    createdAt: row.created_at
  };
}

export function volunteerEditTokenExpiresAtFromNow(): string {
  return new Date(Date.now() + EDIT_TOKEN_TTL_MS).toISOString();
}

export async function revokeActiveEditTokensForSubmission(
  env: Env,
  submissionId: number
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE volunteer_submission_edit_tokens
    SET consumed_at = CURRENT_TIMESTAMP
    WHERE submission_id = ?
      AND consumed_at IS NULL
    `
  )
    .bind(submissionId)
    .run();
}

export async function createVolunteerSubmissionEditToken(
  env: Env,
  submissionId: number,
  tokenHash: string,
  expiresAt: string
): Promise<void> {
  await revokeActiveEditTokensForSubmission(env, submissionId);

  await env.DB.prepare(
    `
    INSERT INTO volunteer_submission_edit_tokens (
      submission_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?)
    `
  )
    .bind(submissionId, tokenHash, expiresAt)
    .run();
}

export async function findValidVolunteerEditTokenByHash(
  env: Env,
  tokenHash: string
): Promise<
  (VolunteerSubmissionEditTokenRecord & {
    organizationId: number;
    organizationSlug: string;
    formId: number;
  }) | null
> {
  const row = await env.DB.prepare(
    `
    SELECT
      t.*,
      vs.organization_id,
      vs.form_id,
      o.slug AS organization_slug
    FROM volunteer_submission_edit_tokens t
    INNER JOIN volunteer_submissions vs ON vs.id = t.submission_id
    INNER JOIN organizations o ON o.id = vs.organization_id
    WHERE t.token_hash = ?
      AND t.consumed_at IS NULL
      AND t.expires_at > CURRENT_TIMESTAMP
      AND vs.is_archived = 0
      AND o.is_active = 1
    LIMIT 1
    `
  )
    .bind(tokenHash)
    .first<
      TokenRow & {
        organization_id: number;
        form_id: number;
        organization_slug: string;
      }
    >();

  if (!row) {
    return null;
  }

  return {
    ...mapTokenRow(row),
    organizationId: row.organization_id,
    organizationSlug: row.organization_slug,
    formId: row.form_id
  };
}

export async function consumeVolunteerSubmissionEditToken(
  env: Env,
  tokenId: number
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE volunteer_submission_edit_tokens
    SET consumed_at = CURRENT_TIMESTAMP
    WHERE id = ?
      AND consumed_at IS NULL
    `
  )
    .bind(tokenId)
    .run();
}
