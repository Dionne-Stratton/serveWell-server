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
  return json({ ok: false, error: "Not found" }, { status: 404 });
}

export function methodNotAllowed(): Response {
  return json({ ok: false, error: "Method not allowed" }, { status: 405 });
}
