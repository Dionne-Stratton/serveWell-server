import { findActiveAdminById, getAdminSessionVersion } from "../db/adminUsers";
import { unauthorized } from "../http/responses";
import { getBearerToken, verifyAdminJwt } from "./jwt";
import type { AdminUser, Env } from "../types";

export interface AdminAuthResult {
  admin?: AdminUser;
  response?: Response;
}

export async function requireAdmin(request: Request, env: Env): Promise<AdminAuthResult> {
  const token = getBearerToken(request);

  if (!token) {
    return { response: unauthorized() };
  }

  const verified = await verifyAdminJwt(token, env);

  if (!verified) {
    return { response: unauthorized() };
  }

  const admin = await findActiveAdminById(env, verified.admin.id);

  if (!admin) {
    return { response: unauthorized() };
  }

  const currentSessionVersion = await getAdminSessionVersion(env, admin.id);

  if (currentSessionVersion !== verified.sessionVersion) {
    return { response: unauthorized() };
  }

  return { admin };
}
