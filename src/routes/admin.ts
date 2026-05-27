import { requireAdmin } from "../auth/adminGuard";
import { signAdminJwt } from "../auth/jwt";
import { verifyPassword } from "../auth/passwords";
import { findActiveAdminByEmail } from "../db/adminUsers";
import { findActiveOrganizationById, mapPublicOrganization } from "../db/organizations";
import { getAdminSubmissionDetail, listAdminSubmissions } from "../db/adminSubmissions";
import { badRequest, json, methodNotAllowed, notFound, serverError, unauthorized } from "../http/responses";
import type { Env } from "../types";

export async function adminRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/admin/login") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return login(request, env);
  }

  if (url.pathname === "/api/admin/me") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return me(request, env);
  }

  if (url.pathname === "/api/admin/submissions") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return submissions(request, env);
  }

  const submissionDetailMatch = url.pathname.match(/^\/api\/admin\/submissions\/(\d+)$/);

  if (submissionDetailMatch) {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    return submissionDetail(request, env, Number(submissionDetailMatch[1]));
  }

  return notFound();
}

async function login(request: Request, env: Env): Promise<Response> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return badRequest("Request body must be valid JSON.", "INVALID_JSON");
  }

  if (!isRecord(body)) {
    return badRequest("Request body must be a JSON object.");
  }

  const email = normalizeRequiredString(body.email);
  const password = normalizeRequiredString(body.password);

  if (!email || !password) {
    return badRequest("Email and password are required.");
  }

  try {
    const admin = await findActiveAdminByEmail(env, email);

    if (!admin || !(await verifyPassword(password, admin.passwordHash))) {
      return json(
        {
          success: false,
          error: {
            message: "Invalid email or password.",
            code: "INVALID_LOGIN"
          }
        },
        { status: 401 }
      );
    }

    const { passwordHash: _passwordHash, ...safeAdmin } = admin;
    const organization = await findActiveOrganizationById(env, safeAdmin.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    const token = await signAdminJwt(safeAdmin, env);

    return json({
      success: true,
      data: {
        token,
        admin: safeAdmin,
        organization: mapPublicOrganization(organization)
      }
    });
  } catch (error) {
    console.error("Failed admin login", error);
    return serverError("Unable to log in.");
  }
}

async function me(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const organization = await findActiveOrganizationById(env, auth.admin!.organizationId);

    if (!organization) {
      return serverError("Admin organization is not available.");
    }

    return json({
      success: true,
      data: {
        admin: auth.admin,
        organization: mapPublicOrganization(organization)
      }
    });
  } catch (error) {
    console.error("Failed admin me lookup", error);
    return serverError("Unable to load admin profile.");
  }
}

async function submissions(request: Request, env: Env): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const url = new URL(request.url);
    const filters = {
      ...parseSubmissionFilters(url.searchParams),
      organizationId: auth.admin!.organizationId
    };
    const submissions = await listAdminSubmissions(env, filters);

    return json({
      success: true,
      data: {
        submissions
      }
    });
  } catch (error) {
    console.error("Failed admin submissions lookup", error);
    return serverError("Unable to load submissions.");
  }
}

async function submissionDetail(
  request: Request,
  env: Env,
  submissionId: number
): Promise<Response> {
  try {
    const auth = await requireAdmin(request, env);

    if (auth.response) {
      return auth.response;
    }

    const detail = await getAdminSubmissionDetail(
      env,
      submissionId,
      auth.admin!.organizationId
    );

    if (!detail) {
      return notFound();
    }

    return json({
      success: true,
      data: detail
    });
  } catch (error) {
    console.error("Failed admin submission detail lookup", error);
    return serverError("Unable to load submission.");
  }
}

function parseSubmissionFilters(searchParams: URLSearchParams) {
  const status = normalizeOptionalString(searchParams.get("status"));
  const archived = normalizeOptionalBoolean(searchParams.get("archived"));
  const servingAreaId = normalizeOptionalPositiveInteger(searchParams.get("servingAreaId"));
  const search = normalizeOptionalString(searchParams.get("search"));

  return {
    status,
    archived,
    servingAreaId,
    search
  };
}

function normalizeOptionalString(value: string | null): string | undefined {
  return value && value.trim().length > 0 ? value.trim() : undefined;
}

function normalizeOptionalBoolean(value: string | null): boolean | undefined {
  if (value === "true") return true;
  if (value === "false") return false;

  return undefined;
}

function normalizeOptionalPositiveInteger(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const numberValue = Number(value);

  return Number.isInteger(numberValue) && numberValue > 0 ? numberValue : undefined;
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
