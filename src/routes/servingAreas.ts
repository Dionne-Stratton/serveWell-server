import { listServingAreas } from "../db/servingAreas";
import { json, methodNotAllowed, notFound, serverError } from "../http/responses";
import type { Env } from "../types";

export async function servingAreaRoutes(
  request: Request,
  env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/serving-areas") {
    if (request.method !== "GET") {
      return methodNotAllowed();
    }

    try {
      const servingAreas = await listServingAreas(env);
      return json({ success: true, data: { servingAreas } });
    } catch (error) {
      console.error("Failed to list serving areas", error);
      return serverError("Unable to load serving areas.");
    }
  }

  return notFound();
}
