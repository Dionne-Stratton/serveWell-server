import assert from "node:assert/strict";
import { pbkdf2Sync, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRequire } from "node:module";
import { after, test } from "node:test";

// Compile the actual Worker modules, including the login route, for Node's
// built-in test runner. No new runtime or test dependencies are needed.
const output = mkdtempSync(join(tmpdir(), "servewell-auth-"));
after(() => rmSync(output, { recursive: true, force: true }));
execFileSync(process.execPath, ["node_modules/typescript/bin/tsc", "--noEmit", "false",
  "--module", "CommonJS", "--moduleResolution", "Node", "--verbatimModuleSyntax", "false",
  "--ignoreDeprecations", "6.0", "--rootDir", "src", "--outDir", output], { stdio: "inherit" });
writeFileSync(join(output, "package.json"), '{"type":"commonjs"}');
const require = createRequire(import.meta.url);
const { hashPassword, verifyPassword, passwordNeedsRehash } = require(join(output, "auth/passwords.js"));
const { adminRoutes } = require(join(output, "routes/admin.js"));

const password = "correct horse battery staple";
function legacyPbkdf2(iterations = 10000) {
  const salt = "legacy-test-salt";
  const digest = pbkdf2Sync(password, salt, iterations, 32, "sha256").toString("base64");
  return `pbkdf2_sha256$${iterations}$${salt}$${digest}`;
}
function legacySha256() {
  return `sha256$demo-salt$${createHash("sha256").update(`demo-salt:${password}`).digest("base64")}`;
}

test("new hashes use fresh salts and match independent PBKDF2", async () => {
  const first = await hashPassword(password);
  const second = await hashPassword(password);
  assert.notEqual(first, second);
  const [algorithm, cost, salt, digest] = first.split("$");
  assert.equal(algorithm, "pbkdf2_sha256");
  assert.equal(Number(cost), 100000);
  assert.equal(digest, pbkdf2Sync(password, salt, 100000, 32, "sha256").toString("base64"));
  assert.equal(await verifyPassword(password, first), true);
  assert.equal(await verifyPassword("wrong", first), false);
  assert.equal(passwordNeedsRehash(first), false);
});

test("both legacy formats remain verifiable and need upgrading", async () => {
  for (const hash of [legacyPbkdf2(), legacySha256()]) {
    assert.equal(await verifyPassword(password, hash), true);
    assert.equal(await verifyPassword("wrong", hash), false);
    assert.equal(passwordNeedsRehash(hash), true);
  }
});

test("malformed hashes and excessive costs fail closed", async () => {
  const valid = legacyPbkdf2();
  for (const hash of ["", "unknown$x$y", valid + "$extra", legacySha256() + "$extra",
    valid.replace("10000", "0"), valid.replace("10000", "-1"),
    valid.replace("10000", "100001"), valid.replace("10000", "1e4"),
    valid.replace("10000", "99999999999999999"), valid.slice(0, -1)]) {
    assert.equal(await verifyPassword(password, hash), false, hash);
  }
});

test("Unicode and long passwords round-trip without truncation", async () => {
  const input = "שלום Jesús 🔑" + "x".repeat(100);
  const hash = await hashPassword(input);
  assert.equal(await verifyPassword(input, hash), true);
  assert.equal(await verifyPassword(input.slice(0, -1), hash), false);
});

function loginEnvironment(initialHash, { conflict = false } = {}) {
  const state = { hash: initialHash, writes: 0, sessionVersion: 3 };
  const env = {
    JWT_SECRET: "test-only-secret-at-least-thirty-two-characters",
    DB: {
      prepare(sql) {
        let values;
        return {
          bind(...args) { values = args; return this; },
          async first() {
            if (sql.includes("INNER JOIN organizations")) {
              return { id: 7, organization_id: 2, email: "admin@example.com", password_hash: state.hash,
                display_name: "Admin", role: "owner" };
            }
            if (sql.includes("FROM organizations")) {
              return { id: 2, slug: "test-church", name: "Test Church", organization_type: "church" };
            }
            if (sql.includes("SELECT session_version")) return { session_version: state.sessionVersion };
            throw new Error(`Unexpected query: ${sql}`);
          },
          async run() {
            assert.match(sql, /organization_id = \? AND password_hash = \? AND is_active = 1/);
            assert.doesNotMatch(sql, /session_version\s*=/);
            assert.deepEqual(values.slice(1), [7, 2, initialHash]);
            state.writes++;
            if (conflict) return { meta: { changes: 0 } };
            state.hash = values[0];
            return { meta: { changes: 1 } };
          }
        };
      }
    }
  };
  return { env, state };
}

async function login(env, input = password) {
  return adminRoutes(new Request("https://test.example/api/admin/login", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ organizationSlug: "test-church", email: "admin@example.com", password: input })
  }), env, {});
}

test("successful login upgrades legacy hashes and preserves sessions", async () => {
  for (const hash of [legacyPbkdf2(), legacySha256()]) {
    const { env, state } = loginEnvironment(hash);
    const response = await login(env);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(state.writes, 1);
    assert.match(state.hash, /^pbkdf2_sha256\$100000\$/);
    assert.equal(await verifyPassword(password, state.hash), true);
    assert.equal("passwordHash" in body.data.admin, false);
    const payload = JSON.parse(Buffer.from(body.data.token.split(".")[1], "base64url"));
    assert.equal(payload.sv, 3);
  }
});

test("wrong passwords never upgrade or receive a token", async () => {
  const { env, state } = loginEnvironment(legacyPbkdf2());
  const response = await login(env, "wrong");
  assert.equal(response.status, 401);
  assert.equal(state.writes, 0);
  assert.equal((await response.json()).data, undefined);
});

test("current hashes are not rewritten on login", async () => {
  const { env, state } = loginEnvironment(await hashPassword(password));
  assert.equal((await login(env)).status, 200);
  assert.equal(state.writes, 0);
});

test("a concurrent password reset cannot be overwritten or get a stale-password token", async () => {
  const initial = legacyPbkdf2();
  const { env, state } = loginEnvironment(initial, { conflict: true });
  const response = await login(env);
  assert.equal(response.status, 401);
  assert.equal(state.hash, initial);
  assert.equal((await response.json()).data, undefined);
});
