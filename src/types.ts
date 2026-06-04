export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  FRONTEND_ORIGIN?: string;
  ENVIRONMENT?: "development" | "staging" | "production";
  PLANNING_CENTER_CLIENT_ID?: string;
  PLANNING_CENTER_CLIENT_SECRET?: string;
  PLANNING_CENTER_REDIRECT_URI?: string;
  PLANNING_CENTER_REDIRECT_URI_LOCAL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
}

export interface ApiResponseBody<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

export interface AdminUser {
  id: number;
  organizationId: number;
  email: string;
  displayName: string;
  role: "admin";
}
