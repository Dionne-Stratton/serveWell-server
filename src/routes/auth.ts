import { methodNotAllowed, notFound, json } from "../http/responses";
import type { Env } from "../types";

export async function authRoutes(
  request: Request,
  _env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/auth/login") {
    if (request.method !== "POST") {
      return methodNotAllowed();
    }

    return json(
      {
        ok: false,
        error: "Login route placeholder. Business logic has not been implemented yet."
      },
      { status: 501 }
    );
  }

  return notFound();
}
