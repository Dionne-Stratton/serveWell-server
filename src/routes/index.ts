import { authRoutes } from "./auth";
import { volunteerRoutes } from "./volunteers";
import { json, notFound } from "../http/responses";
import type { Env } from "../types";

export async function routeRequest(
  request: Request,
  env: Env,
  ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/health" && request.method === "GET") {
    return json({
      ok: true,
      data: {
        service: "servewell-server",
        status: "healthy",
        environment: env.ENVIRONMENT || "development"
      }
    });
  }

  if (url.pathname === "/api" && request.method === "GET") {
    return json({
      ok: true,
      data: {
        name: "ServeWell API",
        version: "0.1.0"
      }
    });
  }

  if (url.pathname.startsWith("/api/auth")) {
    return authRoutes(request, env, ctx);
  }

  if (url.pathname.startsWith("/api/volunteers")) {
    return volunteerRoutes(request, env, ctx);
  }

  return notFound();
}
