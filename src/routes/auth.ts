import { acceptAdminInvite, previewAdminInvite } from "../auth/adminInviteAccept";
import { notifyOwnersOfAdminJoined } from "../notifications/adminJoinedNotifications";
import { notifyFounderOfOrganizationSignup } from "../notifications/founderOrganizationSignup";
import { signAdminJwt } from "../auth/jwt";
import { requestChurchSlugHintForEmail } from "../auth/churchSlugHint";
import { completePasswordReset, requestPasswordResetForEmail } from "../auth/passwordReset";
import {
  createOrganizationWithAdmin,
  getOrganizationSlugAvailability,
  mapOrganizationProfile
} from "../db/organizationRegistration";
import { findActiveAdminById } from "../db/adminUsers";
import { findActiveOrganizationById, mapPublicOrganization } from "../db/organizations";
import { badRequest, json, methodNotAllowed, serverError } from "../http/responses";
import type { Env } from "../types";
import { validateOrganizationRegistration } from "../validation/organizationRegistration";

const PASSWORD_RESET_ACK =
  "If an account exists for that email, we sent password reset instructions.";

const CHURCH_SLUG_HINT_ACK =
  "If an account exists for that email, we sent a reminder with your church name and URL slug.";

export async function authRoutes(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/auth/register") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return registerOrganization(request, env, ctx);
  }

  if (url.pathname === "/api/auth/organization-slug-availability") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return organizationSlugAvailability(request, env);
  }

  if (url.pathname === "/api/auth/login") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return json(
      {
        success: false,
        error: {
          message: "Use POST /api/admin/login for staff sign-in.",
          code: "NOT_IMPLEMENTED"
        }
      },
      { status: 501 }
    );
  }

  if (url.pathname === "/api/auth/forgot-password") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return forgotPassword(request, env);
  }

  if (url.pathname === "/api/auth/church-slug-hint") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return churchSlugHint(request, env);
  }

  if (url.pathname === "/api/auth/reset-password") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return resetPassword(request, env);
  }

  if (url.pathname === "/api/auth/accept-invite") {
    if (request.method === "GET") {
      return previewInvite(request, env);
    }

    if (request.method === "POST") {
      return acceptInvite(request, env, ctx);
    }

    return methodNotAllowed();
  }

  return json(
    { success: false, error: { message: "Not found.", code: "NOT_FOUND" } },
    { status: 404 }
  );
}

async function registerOrganization(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  const validation = validateOrganizationRegistration(body);

  if (!validation.ok) {
    return badRequest(validation.message, validation.code);
  }

  try {
    const created = await createOrganizationWithAdmin(env, validation.value);

    if (!created.ok) {
      if (created.reason === "slug_taken") {
        return badRequest(
          "That URL slug is already taken. Try adding your city or neighborhood (for example, kairos-austin).",
          "ORGANIZATION_SLUG_TAKEN"
        );
      }

      return serverError("Unable to create organization.");
    }

    const admin = await findActiveAdminById(env, created.adminId);

    if (!admin) {
      return serverError("Organization was created but admin sign-in could not be completed.");
    }

    const token = await signAdminJwt(admin, env);

    const signedUpAt = new Date().toISOString();
    ctx.waitUntil(
      notifyFounderOfOrganizationSignup(env, {
        organizationName: created.organization.name,
        organizationSlug: created.organization.slug,
        ownerDisplayName: admin.displayName,
        ownerEmail: admin.email,
        signedUpAt
      })
    );

    return json(
      {
        success: true,
        data: {
          token,
          admin,
          organization: mapOrganizationProfile(created.organization)
        }
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Failed organization registration", error);
    return serverError("Unable to create organization.");
  }
}

async function organizationSlugAvailability(request: Request, env: Env): Promise<Response> {
  const slug = new URL(request.url).searchParams.get("slug");

  try {
    const availability = await getOrganizationSlugAvailability(env, slug);

    return json({
      success: true,
      data: availability
    });
  } catch (error) {
    console.error("Failed organization slug availability check", error);
    return serverError("Unable to check URL slug availability.");
  }
}

async function forgotPassword(request: Request, env: Env): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const organizationSlug = normalizeRequiredString(body.organizationSlug);
  const email = normalizeRequiredString(body.email)?.toLowerCase();

  if (!organizationSlug || !email) {
    return badRequest("Organization URL slug and email are required.");
  }

  try {
    await requestPasswordResetForEmail(env, organizationSlug, email);

    return json({
      success: true,
      data: { message: PASSWORD_RESET_ACK }
    });
  } catch (error) {
    console.error("Failed forgot password", error);
    return serverError("Unable to process password reset request.");
  }
}

async function churchSlugHint(request: Request, env: Env): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const email = normalizeRequiredString(body.email)?.toLowerCase();

  if (!email) {
    return badRequest("Email is required.");
  }

  try {
    await requestChurchSlugHintForEmail(env, email);

    return json({
      success: true,
      data: { message: CHURCH_SLUG_HINT_ACK }
    });
  } catch (error) {
    console.error("Failed church slug hint", error);
    return serverError("Unable to process sign-in reminder request.");
  }
}

async function resetPassword(request: Request, env: Env): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const token = normalizeRequiredString(body.token);
  const newPassword = normalizeRequiredString(body.newPassword);

  if (!token) {
    return badRequest("Reset token is required.");
  }

  if (!newPassword || newPassword.length < 8) {
    return badRequest("Password must be at least 8 characters.");
  }

  try {
    const ok = await completePasswordReset(env, token, newPassword);

    if (!ok) {
      return badRequest(
        "This reset link is invalid or has expired. Request a new one.",
        "INVALID_RESET_TOKEN"
      );
    }

    return json({
      success: true,
      data: { message: "Your password was updated. You can sign in now." }
    });
  } catch (error) {
    console.error("Failed reset password", error);
    return serverError("Unable to reset password.");
  }
}

async function previewInvite(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();

  if (!token) {
    return badRequest("Invite token is required.");
  }

  try {
    const preview = await previewAdminInvite(env, token);

    if (!preview) {
      return badRequest(
        "This invitation link is invalid or has expired.",
        "INVALID_INVITE_TOKEN"
      );
    }

    return json({
      success: true,
      data: { invite: preview }
    });
  } catch (error) {
    console.error("Failed invite preview", error);
    return serverError("Unable to load invitation.");
  }
}

async function acceptInvite(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const token = normalizeRequiredString(body.token);
  const newPassword = normalizeRequiredString(body.newPassword);
  const confirmPassword = normalizeRequiredString(body.confirmPassword);

  if (!token) {
    return badRequest("Invite token is required.");
  }

  if (!newPassword || newPassword.length < 8) {
    return badRequest("Password must be at least 8 characters.");
  }

  if (newPassword !== confirmPassword) {
    return badRequest("Passwords do not match.");
  }

  try {
    const accepted = await acceptAdminInvite(env, token, newPassword);

    if (!accepted) {
      return badRequest(
        "This invitation link is invalid or has expired.",
        "INVALID_INVITE_TOKEN"
      );
    }

    const { admin, newlyJoined } = accepted;

    const organization = await findActiveOrganizationById(env, admin.organizationId);

    if (!organization) {
      return serverError("Organization is not available.");
    }

    if (newlyJoined) {
      ctx.waitUntil(
        notifyOwnersOfAdminJoined(env, {
          organizationId: organization.id,
          organizationSlug: organization.slug,
          organizationName: organization.name,
          joinedAdminUserId: admin.id,
          joinedAdminDisplayName: admin.displayName,
          joinedAdminEmail: admin.email
        })
      );
    }

    const jwt = await signAdminJwt(admin, env);

    return json({
      success: true,
      data: {
        token: jwt,
        admin,
        organization: mapPublicOrganization(organization)
      }
    });
  } catch (error) {
    console.error("Failed accept invite", error);
    return serverError("Unable to accept invitation.");
  }
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
