import { getJwtSecret } from "./jwt";
import type { Env } from "../types";

const RESOURCE_DOWNLOAD_TTL_MS = 180 * 24 * 60 * 60 * 1000;

export interface OccurrenceResourceDownloadTokenPayload {
  resourceId: number;
  submissionId: number;
  exp: number;
}

export async function signOccurrenceResourceDownloadToken(
  env: Env,
  input: { resourceId: number; submissionId: number }
): Promise<string> {
  const payload: OccurrenceResourceDownloadTokenPayload = {
    resourceId: input.resourceId,
    submissionId: input.submissionId,
    exp: Date.now() + RESOURCE_DOWNLOAD_TTL_MS
  };

  const encoded = base64UrlEncodeJson(payload);
  const signature = await hmacSha256(encoded, getJwtSecret(env));

  return `${encoded}.${signature}`;
}

export async function verifyOccurrenceResourceDownloadToken(
  env: Env,
  token: string
): Promise<OccurrenceResourceDownloadTokenPayload | null> {
  const parts = token.split(".");

  if (parts.length !== 2) {
    return null;
  }

  const [encoded, signature] = parts;
  const expected = await hmacSha256(encoded, getJwtSecret(env));

  if (signature !== expected) {
    return null;
  }

  const payload = parseBase64UrlJson<OccurrenceResourceDownloadTokenPayload>(encoded);

  if (!payload) {
    return null;
  }

  if (
    !Number.isInteger(payload.resourceId) ||
    payload.resourceId < 1 ||
    !Number.isInteger(payload.submissionId) ||
    payload.submissionId < 1 ||
    typeof payload.exp !== "number"
  ) {
    return null;
  }

  if (payload.exp <= Date.now()) {
    return null;
  }

  return payload;
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
