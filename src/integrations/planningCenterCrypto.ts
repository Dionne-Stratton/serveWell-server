import { getRequiredEnv } from "../env";
import type { Env } from "../types";

const TEXT_ENCODING = new TextEncoder();
const TEXT_DECODING = new TextDecoder();

export function createRandomUrlSafeString(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  return base64UrlEncodeBytes(bytes);
}

export async function createCodeChallenge(codeVerifier: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    TEXT_ENCODING.encode(codeVerifier)
  );

  return base64UrlEncodeBytes(new Uint8Array(digest));
}

export async function encryptPlanningCenterSecret(value: string, env: Env): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(env);
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    TEXT_ENCODING.encode(value)
  );

  return `${base64UrlEncodeBytes(iv)}.${base64UrlEncodeBytes(new Uint8Array(encrypted))}`;
}

export async function decryptPlanningCenterSecret(value: string, env: Env): Promise<string> {
  const [encodedIv, encodedEncrypted] = value.split(".");

  if (!encodedIv || !encodedEncrypted) {
    throw new Error("Invalid encrypted Planning Center secret format.");
  }

  const key = await getEncryptionKey(env);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlDecodeBytes(encodedIv) },
    key,
    base64UrlDecodeBytes(encodedEncrypted)
  );

  return TEXT_DECODING.decode(decrypted);
}

async function getEncryptionKey(env: Env): Promise<CryptoKey> {
  const secret = getRequiredEnv(env, "JWT_SECRET");
  const digest = await crypto.subtle.digest("SHA-256", TEXT_ENCODING.encode(secret));

  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

function base64UrlEncodeBytes(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
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
