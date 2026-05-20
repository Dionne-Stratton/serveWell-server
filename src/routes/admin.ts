import { getBearerToken, signAdminJwt, verifyAdminJwt } from "../auth/jwt";
import { verifyPassword } from "../auth/passwords";
import { findActiveAdminByEmail, findActiveAdminById } from "../db/adminUsers";
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
    const token = await signAdminJwt(safeAdmin, env);

    return json({
      success: true,
      data: {
        token,
        admin: safeAdmin
      }
    });
  } catch (error) {
    console.error("Failed admin login", error);
    return serverError("Unable to log in.");
  }
}

async function me(request: Request, env: Env): Promise<Response> {
  const token = getBearerToken(request);

  if (!token) {
    return unauthorized();
  }

  try {
    const tokenAdmin = await verifyAdminJwt(token, env);

    if (!tokenAdmin) {
      return unauthorized();
    }

    const admin = await findActiveAdminById(env, tokenAdmin.id);

    if (!admin) {
      return unauthorized();
    }

    return json({
      success: true,
      data: {
        admin
      }
    });
  } catch (error) {
    console.error("Failed admin me lookup", error);
    return serverError("Unable to load admin profile.");
  }
}

function normalizeRequiredString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
