import type { ApiResponseBody } from "../types";

export function json<T>(body: ApiResponseBody<T>, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");

  return Response.json(body, {
    ...init,
    headers
  });
}

export function notFound(): Response {
  return json(
    { success: false, error: { message: "Not found.", code: "NOT_FOUND" } },
    { status: 404 }
  );
}

export function methodNotAllowed(): Response {
  return json(
    { success: false, error: { message: "Method not allowed.", code: "METHOD_NOT_ALLOWED" } },
    { status: 405 }
  );
}

export function badRequest(message: string, code = "VALIDATION_ERROR"): Response {
  return json(
    { success: false, error: { message, code } },
    { status: 400 }
  );
}

export function unauthorized(message = "Unauthorized."): Response {
  return json(
    { success: false, error: { message, code: "UNAUTHORIZED" } },
    { status: 401 }
  );
}

export function forbidden(message = "Forbidden."): Response {
  return json(
    { success: false, error: { message, code: "FORBIDDEN" } },
    { status: 403 }
  );
}

export function serverError(message = "Something went wrong."): Response {
  return json(
    { success: false, error: { message, code: "INTERNAL_SERVER_ERROR" } },
    { status: 500 }
  );
}
