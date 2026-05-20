import { getFrontendOrigin } from "../env";
import type { Env } from "../types";

export function corsHeaders(env: Env): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": getFrontendOrigin(env),
    "Access-Control-Allow-Methods": "GET,POST,PUT,PATCH,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400"
  };
}

export function handleCorsPreflight(request: Request, env: Env): Response | null {
  if (request.method !== "OPTIONS") {
    return null;
  }

  return new Response(null, {
    status: 204,
    headers: corsHeaders(env)
  });
}
