export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  FRONTEND_ORIGIN?: string;
  ENVIRONMENT?: "development" | "staging" | "production";
}

export interface ApiResponseBody<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}
