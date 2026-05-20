import { getRequiredEnv } from "../env";
import type { AdminUser, Env } from "../types";

export function getJwtSecret(env: Env): string {
  return getRequiredEnv(env, "JWT_SECRET");
}

interface JwtHeader {
  alg: "HS256";
  typ: "JWT";
}

interface AdminJwtPayload {
  sub: string;
  email: string;
  displayName: string;
  role: "admin";
  iat: number;
  exp: number;
}

export async function signAdminJwt(admin: AdminUser, env: Env): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload: AdminJwtPayload = {
    sub: String(admin.id),
    email: admin.email,
    displayName: admin.displayName,
    role: admin.role,
    iat: issuedAt,
    exp: issuedAt + 60 * 60 * 8
  };

  return signJwt({ alg: "HS256", typ: "JWT" }, payload, getJwtSecret(env));
}

export async function verifyAdminJwt(token: string, env: Env): Promise<AdminUser | null> {
  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [encodedHeader, encodedPayload, signature] = parts;
  const expectedSignature = await hmacSha256(`${encodedHeader}.${encodedPayload}`, getJwtSecret(env));

  if (signature !== expectedSignature) {
    return null;
  }

  const header = parseBase64UrlJson<JwtHeader>(encodedHeader);
  const payload = parseBase64UrlJson<AdminJwtPayload>(encodedPayload);

  if (!header || header.alg !== "HS256" || header.typ !== "JWT" || !payload) {
    return null;
  }

  if (payload.exp <= Math.floor(Date.now() / 1000)) {
    return null;
  }

  if (payload.role !== "admin") {
    return null;
  }

  const id = Number(payload.sub);

  if (!Number.isInteger(id) || id <= 0) {
    return null;
  }

  return {
    id,
    email: payload.email,
    displayName: payload.displayName,
    role: payload.role
  };
}

export function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");

  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }

  return authorization.slice("Bearer ".length).trim() || null;
}

async function signJwt(header: JwtHeader, payload: AdminJwtPayload, secret: string): Promise<string> {
  const encodedHeader = base64UrlEncodeJson(header);
  const encodedPayload = base64UrlEncodeJson(payload);
  const signature = await hmacSha256(`${encodedHeader}.${encodedPayload}`, secret);

  return `${encodedHeader}.${encodedPayload}.${signature}`;
}

async function hmacSha256(value: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));

  return base64UrlEncodeBytes(new Uint8Array(signature));
}

function base64UrlEncodeJson(value: unknown): string {
  return base64UrlEncodeBytes(new TextEncoder().encode(JSON.stringify(value)));
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function parseBase64UrlJson<T>(value: string): T | null {
  try {
    return JSON.parse(new TextDecoder().decode(base64UrlDecodeBytes(value))) as T;
  } catch {
    return null;
  }
}

function base64UrlDecodeBytes(value: string): Uint8Array {
  const base64 = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(
    Math.ceil(value.length / 4) * 4,
    "="
  );
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes;
}
