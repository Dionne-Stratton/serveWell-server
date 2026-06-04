import { signAdminJwt } from "../auth/jwt";
import { completePasswordReset, requestPasswordResetForEmail } from "../auth/passwordReset";
import {
  createOrganizationWithAdmin,
  mapOrganizationProfile
} from "../db/organizationRegistration";
import { findActiveAdminById } from "../db/adminUsers";
import { badRequest, json, methodNotAllowed, serverError } from "../http/responses";
import type { Env } from "../types";
import { validateOrganizationRegistration } from "../validation/organizationRegistration";

const PASSWORD_RESET_ACK =
  "If an account exists for that email, we sent password reset instructions.";

export async function authRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/auth/register") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return registerOrganization(request, env);
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

  if (url.pathname === "/api/auth/reset-password") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return resetPassword(request, env);
  }

  return json(
    { success: false, error: { message: "Not found.", code: "NOT_FOUND" } },
    { status: 404 }
  );
}

async function registerOrganization(request: Request, env: Env): Promise<Response> {
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
          "An organization with that URL slug already exists.",
          "ORGANIZATION_SLUG_TAKEN"
        );
      }

      return badRequest(
        "An account with that admin email already exists.",
        "ADMIN_EMAIL_TAKEN"
      );
    }

    const admin = await findActiveAdminById(env, created.adminId);

    if (!admin) {
      return serverError("Organization was created but admin sign-in could not be completed.");
    }

    const token = await signAdminJwt(admin, env);

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

  const email = normalizeRequiredString(body.email)?.toLowerCase();

  if (!email) {
    return badRequest("Email is required.");
  }

  try {
    await requestPasswordResetForEmail(env, email);

    return json({
      success: true,
      data: { message: PASSWORD_RESET_ACK }
    });
  } catch (error) {
    console.error("Failed forgot password", error);
    return serverError("Unable to process password reset request.");
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

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
