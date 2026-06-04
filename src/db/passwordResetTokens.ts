import type { Env } from "../types";

const TOKEN_TTL_MS = 60 * 60 * 1000;

export async function createPasswordResetToken(
  env: Env,
  adminUserId: number,
  tokenHash: string
): Promise<void> {
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();

  await env.DB.prepare(
    `
    UPDATE password_reset_tokens
    SET used_at = CURRENT_TIMESTAMP
    WHERE admin_user_id = ? AND used_at IS NULL
    `
  )
    .bind(adminUserId)
    .run();

  await env.DB.prepare(
    `
    INSERT INTO password_reset_tokens (admin_user_id, token_hash, expires_at)
    VALUES (?, ?, ?)
    `
  )
    .bind(adminUserId, tokenHash, expiresAt)
    .run();
}

export async function findValidPasswordResetAdminId(
  env: Env,
  tokenHash: string
): Promise<number | null> {
  const row = await env.DB.prepare(
    `
    SELECT admin_user_id
    FROM password_reset_tokens
    WHERE token_hash = ?
      AND used_at IS NULL
      AND expires_at > datetime('now')
    ORDER BY id DESC
    LIMIT 1
    `
  )
    .bind(tokenHash)
    .first<{ admin_user_id: number }>();

  return row?.admin_user_id ?? null;
}

export async function markPasswordResetTokenUsed(
  env: Env,
  tokenHash: string
): Promise<void> {
  await env.DB.prepare(
    `
    UPDATE password_reset_tokens
    SET used_at = CURRENT_TIMESTAMP
    WHERE token_hash = ?
    `
  )
    .bind(tokenHash)
    .run();
}
