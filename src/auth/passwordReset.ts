import { hashPassword } from "./passwords";
import {
  createPasswordResetToken,
  findValidPasswordResetAdminId,
  markPasswordResetTokenUsed
} from "../db/passwordResetTokens";
import {
  findActiveAdminByOrganizationSlugAndEmail,
  updateAdminPasswordHash
} from "../db/adminUsers";
import { sendPasswordResetEmail } from "../email/sendPasswordReset";
import { getFrontendOrigin } from "../env";
import type { Env } from "../types";

export async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function createPasswordResetPlainToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return base64UrlEncode(bytes);
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function requestPasswordResetForEmail(
  env: Env,
  organizationSlug: string,
  email: string
): Promise<void> {
  const normalized = email.trim().toLowerCase();
  const slug = organizationSlug.trim();
  if (!normalized || !slug) {
    return;
  }

  const admin = await findActiveAdminByOrganizationSlugAndEmail(env, slug, normalized);
  if (!admin) {
    return;
  }

  await sendPasswordResetForAdmin(env, admin.id, admin.email, admin.displayName);
}

export async function sendPasswordResetForAdmin(
  env: Env,
  adminUserId: number,
  email: string,
  displayName: string
): Promise<void> {
  const plainToken = createPasswordResetPlainToken();
  const tokenHash = await sha256Hex(plainToken);
  await createPasswordResetToken(env, adminUserId, tokenHash);

  const origin = getFrontendOrigin(env);
  const resetUrl = `${origin.replace(/\/$/, "")}/reset-password?token=${encodeURIComponent(plainToken)}`;

  await sendPasswordResetEmail(env, {
    to: email,
    displayName,
    resetUrl
  });
}

export async function completePasswordReset(
  env: Env,
  plainToken: string,
  newPassword: string
): Promise<boolean> {
  const trimmed = plainToken.trim();
  if (!trimmed) {
    return false;
  }

  const tokenHash = await sha256Hex(trimmed);
  const adminUserId = await findValidPasswordResetAdminId(env, tokenHash);

  if (!adminUserId) {
    return false;
  }

  const passwordHash = await hashPassword(newPassword);
  const updated = await updateAdminPasswordHash(env, adminUserId, passwordHash);

  if (!updated) {
    return false;
  }

  await markPasswordResetTokenUsed(env, tokenHash);
  return true;
}
