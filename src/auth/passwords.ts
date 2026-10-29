// Workers production Web Crypto caps PBKDF2 at 100,000 iterations (local
// workerd/Node do not). Raising this blindly breaks signup and password resets.
// This is below OWASP's 600,000 recommendation; see README's auth limitations.
const PBKDF2_ITERATIONS = 100_000;
const SHA256_BASE64 = /^[A-Za-z0-9+/]{43}=$/;

export function passwordNeedsRehash(storedHash: string): boolean {
  const [prefix, iterations] = storedHash.split("$");
  return prefix === "sha256" ||
    (prefix === "pbkdf2_sha256" && Number(iterations) < PBKDF2_ITERATIONS);
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [prefix, ...parts] = storedHash.split("$");

    if (prefix === "sha256") {
      const [salt, expectedHash] = parts;

      if (parts.length !== 2 || !salt || !SHA256_BASE64.test(expectedHash ?? "")) {
        return false;
      }

      return equalHashes(await sha256(`${salt}:${password}`), expectedHash);
    }

    if (prefix === "pbkdf2_sha256") {
      const [iterationsValue, salt, expectedHash] = parts;

      if (parts.length !== 3 || !iterationsValue || !salt || !SHA256_BASE64.test(expectedHash ?? "")) {
        return false;
      }

      const iterations = Number(iterationsValue);

      if (!/^[1-9][0-9]*$/.test(iterationsValue) ||
          !Number.isSafeInteger(iterations) || iterations > PBKDF2_ITERATIONS) {
        return false;
      }

      return equalHashes(await pbkdf2Sha256(password, salt, iterations), expectedHash);
    }

    return false;
  } catch {
    return false;
  }
}

// Compare all characters of the fixed-size digests, without an early exit.
function equalHashes(actual: string, expected: string): boolean {
  let difference = actual.length ^ expected.length;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual.charCodeAt(index) ^ expected.charCodeAt(index);
  }
  return difference === 0;
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomSalt();
  const hash = await pbkdf2Sha256(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2_sha256$${PBKDF2_ITERATIONS}$${salt}$${hash}`;
}

function randomSalt(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return base64EncodeBytes(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return base64EncodeBytes(new Uint8Array(digest));
}

async function pbkdf2Sha256(password: string, salt: string, iterations: number): Promise<string> {
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new TextEncoder().encode(salt),
      iterations
    },
    keyMaterial,
    256
  );

  return base64EncodeBytes(new Uint8Array(bits));
}

function base64EncodeBytes(bytes: Uint8Array): string {
  let binary = "";

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}
