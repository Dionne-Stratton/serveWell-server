import { getRequiredEnv } from "../env";
import type { Env } from "../types";

export function getJwtSecret(env: Env): string {
  return getRequiredEnv(env, "JWT_SECRET");
}

export async function verifyJwt(_token: string, env: Env): Promise<unknown> {
  getJwtSecret(env);

  throw new Error("JWT verification is not implemented yet.");
}
