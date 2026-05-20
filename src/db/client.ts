import type { Env } from "../types";

export function getDb(env: Env): D1Database {
  return env.DB;
}
