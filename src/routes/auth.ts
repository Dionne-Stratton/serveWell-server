import { signAdminJwt } from "../auth/jwt";
import {
  createOrganizationWithAdmin,
  mapOrganizationProfile
} from "../db/organizationRegistration";
import { findActiveAdminById } from "../db/adminUsers";
import { badRequest, json, methodNotAllowed, serverError } from "../http/responses";
import type { Env } from "../types";
import { validateOrganizationRegistration } from "../validation/organizationRegistration";

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
