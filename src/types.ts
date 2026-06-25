export interface Env {
  DB: D1Database;
  OCCURRENCE_RESOURCES?: R2Bucket;
  JWT_SECRET: string;
  FRONTEND_ORIGIN?: string;
  /** Public Worker URL for signed links in emails (defaults to local wrangler port). */
  PUBLIC_API_ORIGIN?: string;
  ENVIRONMENT?: "development" | "staging" | "production";
  PLANNING_CENTER_CLIENT_ID?: string;
  PLANNING_CENTER_CLIENT_SECRET?: string;
  PLANNING_CENTER_REDIRECT_URI?: string;
  PLANNING_CENTER_REDIRECT_URI_LOCAL?: string;
  RESEND_API_KEY?: string;
  RESEND_FROM?: string;
  /** Founder inbox for new organization signup notifications (Resend). */
  FOUNDER_NOTIFY_EMAIL?: string;
}

export interface ApiResponseBody<T = unknown> {
  success: boolean;
  data?: T;
  error?: {
    message: string;
    code: string;
  };
}

import type { AdminRole } from "./validation/adminRoles";

export interface AdminUser {
  id: number;
  organizationId: number;
  email: string;
  displayName: string;
  role: AdminRole;
}
