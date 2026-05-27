import { corsHeaders, handleCorsPreflight } from "./middleware/cors";
import { routeRequest } from "./routes";
import type { Env } from "./types";

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const preflight = handleCorsPreflight(request);

    if (preflight) {
      return preflight;
    }

    const response = await routeRequest(request, env, ctx);
    const headers = new Headers(response.headers);

    for (const [key, value] of Object.entries(corsHeaders())) {
      headers.set(key, value);
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers
    });
  }
};
