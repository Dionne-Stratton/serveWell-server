import { methodNotAllowed, notFound, json } from "../http/responses";
import type { Env } from "../types";

export async function volunteerRoutes(
  request: Request,
  _env: Env,
  _ctx: ExecutionContext
): Promise<Response> {
  const url = new URL(request.url);

  if (url.pathname === "/api/volunteers") {
    if (request.method === "GET") {
      return json(
        {
          success: false,
          error: {
            message: "Volunteer list route placeholder. Business logic has not been implemented yet.",
            code: "NOT_IMPLEMENTED"
          }
        },
        { status: 501 }
      );
    }

    if (request.method === "POST") {
      return json(
        {
          success: false,
          error: {
            message: "Volunteer intake route placeholder. Business logic has not been implemented yet.",
            code: "NOT_IMPLEMENTED"
          }
        },
        { status: 501 }
      );
    }

    return methodNotAllowed();
  }

  return notFound();
}
