import { requireAdmin, type AdminAuthResult } from "./adminGuard";
import { forbidden } from "../http/responses";
import type { Env } from "../types";

export async function requireOwner(request: Request, env: Env): Promise<AdminAuthResult> {
  const auth = await requireAdmin(request, env);

  if (auth.response) {
    return auth;
  }

  if (auth.admin!.role !== "owner") {
    return { response: forbidden("Only the organization owner can perform this action.") };
  }

  return auth;
}
