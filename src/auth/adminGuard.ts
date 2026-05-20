import { findActiveAdminById } from "../db/adminUsers";
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

  const tokenAdmin = await verifyAdminJwt(token, env);

  if (!tokenAdmin) {
    return { response: unauthorized() };
  }

  const admin = await findActiveAdminById(env, tokenAdmin.id);

  if (!admin) {
    return { response: unauthorized() };
  }

  return { admin };
}
