import { hashPassword } from "./passwords";
import { createPasswordResetPlainToken, sha256Hex } from "./passwordReset";
import {
  createAdminInvite,
  findPendingInviteByOrgAndEmail,
  findValidInviteByTokenHash,
  inviteExpiresAtFromNow,
  markAdminInviteAccepted,
} from "../db/adminInvites";
import {
  createAdminUser,
  findActiveAdminByOrganizationAndEmail
} from "../db/adminUsers";
import { sendAdminInviteEmail } from "../email/sendAdminInvite";
import { getFrontendOrigin } from "../env";
import type { Env } from "../types";
import type { AdminUser } from "../types";

export function displayNameFromEmail(email: string): string {
  const local = email.split("@")[0]?.trim() ?? "";
  if (!local) {
    return "Team member";
  }

  const words = local.replace(/[._+-]+/g, " ").trim();
  if (!words) {
    return "Team member";
  }

  return words
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(" ");
}

export async function sendAdminInviteForOrganization(
  env: Env,
  input: {
    organizationId: number;
    organizationName: string;
    ownerAdmin: AdminUser;
    inviteeEmail: string;
  }
): Promise<{ ok: true } | { ok: false; code: string; message: string }> {
  const email = input.inviteeEmail.trim().toLowerCase();

  if (!email) {
    return { ok: false, code: "VALIDATION_ERROR", message: "Email is required." };
  }

  const existingMember = await findActiveAdminByOrganizationAndEmail(
    env,
    input.organizationId,
    email
  );

  if (existingMember) {
    return {
      ok: false,
      code: "ALREADY_MEMBER",
      message: "That person is already on your team."
    };
  }

  const pending = await findPendingInviteByOrgAndEmail(env, input.organizationId, email);

  if (pending) {
    return {
      ok: false,
      code: "ALREADY_INVITED",
      message: "An invitation was already sent to that email."
    };
  }

  const plainToken = createPasswordResetPlainToken();
  const tokenHash = await sha256Hex(plainToken);

  await createAdminInvite(env, {
    organizationId: input.organizationId,
    email,
    invitedByAdminUserId: input.ownerAdmin.id,
    tokenHash,
    expiresAt: inviteExpiresAtFromNow()
  });

  const origin = getFrontendOrigin(env);
  const inviteUrl = `${origin.replace(/\/$/, "")}/accept-invite?token=${encodeURIComponent(plainToken)}`;

  await sendAdminInviteEmail(env, {
    to: email,
    ownerName: input.ownerAdmin.displayName,
    organizationName: input.organizationName,
    inviteUrl
  });

  return { ok: true };
}

export async function previewAdminInvite(
  env: Env,
  plainToken: string
): Promise<{
  email: string;
  organizationName: string;
  organizationSlug: string;
} | null> {
  const trimmed = plainToken.trim();
  if (!trimmed) {
    return null;
  }

  const tokenHash = await sha256Hex(trimmed);
  const invite = await findValidInviteByTokenHash(env, tokenHash);

  if (!invite) {
    return null;
  }

  return {
    email: invite.email,
    organizationName: invite.organizationName,
    organizationSlug: invite.organizationSlug
  };
}

export interface AcceptAdminInviteResult {
  admin: AdminUser;
  newlyJoined: boolean;
}

export async function acceptAdminInvite(
  env: Env,
  plainToken: string,
  newPassword: string
): Promise<AcceptAdminInviteResult | null> {
  const trimmed = plainToken.trim();
  if (!trimmed) {
    return null;
  }

  const tokenHash = await sha256Hex(trimmed);
  const invite = await findValidInviteByTokenHash(env, tokenHash);

  if (!invite) {
    return null;
  }

  const existing = await findActiveAdminByOrganizationAndEmail(
    env,
    invite.organizationId,
    invite.email
  );

  if (existing) {
    await markAdminInviteAccepted(env, invite.id);
    return { admin: existing, newlyJoined: false };
  }

  const passwordHash = await hashPassword(newPassword);
  const admin = await createAdminUser(env, {
    organizationId: invite.organizationId,
    email: invite.email,
    passwordHash,
    displayName: displayNameFromEmail(invite.email),
    role: "admin"
  });

  await markAdminInviteAccepted(env, invite.id);

  return { admin, newlyJoined: true };
}
