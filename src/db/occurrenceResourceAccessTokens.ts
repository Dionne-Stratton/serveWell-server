import type { Env } from "../types";

const ACCESS_TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export function occurrenceResourceAccessTokenExpiresAtFromNow(): string {
  return new Date(Date.now() + ACCESS_TOKEN_TTL_MS).toISOString();
}

export async function createOccurrenceResourceAccessToken(
  env: Env,
  input: {
    organizationId: number;
    resourceId: number;
    submissionId: number;
    tokenHash: string;
    expiresAt: string;
  }
): Promise<void> {
  await env.DB.prepare(
    `
    INSERT INTO generated_occurrence_resource_access_tokens (
      organization_id,
      resource_id,
      submission_id,
      token_hash,
      expires_at
    )
    VALUES (?, ?, ?, ?, ?)
    `
  )
    .bind(
      input.organizationId,
      input.resourceId,
      input.submissionId,
      input.tokenHash,
      input.expiresAt
    )
    .run();
}

export async function findValidOccurrenceResourceAccessToken(
  env: Env,
  tokenHash: string
): Promise<{
  organizationId: number;
  resourceId: number;
  submissionId: number;
} | null> {
  const row = await env.DB.prepare(
    `
    SELECT organization_id, resource_id, submission_id
    FROM generated_occurrence_resource_access_tokens
    WHERE token_hash = ?
      AND expires_at > CURRENT_TIMESTAMP
    LIMIT 1
    `
  )
    .bind(tokenHash)
    .first<{
      organization_id: number;
      resource_id: number;
      submission_id: number;
    }>();

  if (!row) {
    return null;
  }

  return {
    organizationId: row.organization_id,
    resourceId: row.resource_id,
    submissionId: row.submission_id
  };
}
