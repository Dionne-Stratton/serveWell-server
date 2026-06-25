import type { Env } from "./types";

export function getRequiredEnv(env: Env, key: keyof Env): string {
  const value = env[key];

  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing required environment variable: ${String(key)}`);
  }

  return value;
}

export function getFrontendOrigin(env: Env): string {
  return env.FRONTEND_ORIGIN || "http://localhost:5173";
}

export function getPublicApiOrigin(env: Env): string {
  if (env.ENVIRONMENT === "development") {
    return "http://127.0.0.1:8787";
  }

  const configured = env.PUBLIC_API_ORIGIN?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  return "https://servewell-server.dionnestratton.workers.dev";
}
