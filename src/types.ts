export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  FRONTEND_ORIGIN?: string;
  ENVIRONMENT?: "development" | "staging" | "production";
}

export interface ApiResponseBody<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}
