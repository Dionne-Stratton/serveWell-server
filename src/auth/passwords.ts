export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  try {
    const [prefix, ...parts] = storedHash.split("$");

  if (prefix === "sha256") {
    const [salt, expectedHash] = parts;

    if (!salt || !expectedHash) {
      return false;
    }

    return (await sha256(`${salt}:${password}`)) === expectedHash;
  }

  if (prefix === "pbkdf2_sha256") {
    const [iterationsValue, salt, expectedHash] = parts;

    if (!iterationsValue || !salt || !expectedHash) {
      return false;
    }

    const iterations = Number(iterationsValue);

    if (!Number.isInteger(iterations) || iterations <= 0) {
      return false;
    }

    return (await pbkdf2Sha256(password, salt, iterations)) === expectedHash;
  }

  return false;
  } catch {
    return false;
  }
}

const PBKDF2_ITERATIONS = 10_000;

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
