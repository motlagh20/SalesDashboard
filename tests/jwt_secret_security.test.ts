import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import {
  generateToken,
  verifyToken,
  validateJwtSecret,
  getJwtSecret,
  assertJwtSecretConfiguration,
  DEV_ONLY_FALLBACK_JWT_SECRET
} from "../server/auth";

describe("JWT Secret & Cryptographic Verification Security Tests", () => {
  describe("1. Production Startup Refusal & Validation", () => {
    it("fails production validation when JWT_SECRET is undefined or missing", () => {
      const result = validateJwtSecret(undefined, true);
      assert.equal(result.valid, false);
      assert.ok(result.error?.includes("required in production"));
    });

    it("fails production validation when JWT_SECRET is empty string or whitespace", () => {
      const result = validateJwtSecret("   ", true);
      assert.equal(result.valid, false);
      assert.ok(result.error?.includes("required in production"));
    });

    it("fails production validation when JWT_SECRET is shorter than 32 characters (< 256 bits)", () => {
      const shortSecret = "too-short-key-only-24-ch"; // 24 chars
      const result = validateJwtSecret(shortSecret, true);
      assert.equal(result.valid, false);
      assert.ok(result.error?.includes("at least 32 characters"));
    });

    it("fails production validation when JWT_SECRET is a known weak or default secret", () => {
      const weakSecrets = [
        "tabarestan-sales-dashboard-production-secret-key-2026",
        DEV_ONLY_FALLBACK_JWT_SECRET,
        "secret",
        "password",
        "123456",
        "admin",
        "default",
        "changeme"
      ];

      for (const weak of weakSecrets) {
        const result = validateJwtSecret(weak, true);
        assert.equal(result.valid, false, `Weak secret '${weak}' must be rejected`);
        assert.ok(result.error?.includes("known default") || result.error?.includes("at least 32 characters"));
      }
    });

    it("fails production validation when JWT_SECRET has insufficient character diversity", () => {
      const repeated = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"; // 32 chars, single character
      const result = validateJwtSecret(repeated, true);
      assert.equal(result.valid, false);
      assert.ok(result.error?.includes("insufficient character diversity"));
    });

    it("passes production validation when JWT_SECRET meets all security criteria (>= 32 chars, high entropy)", () => {
      const secureSecret = crypto.randomBytes(32).toString("hex"); // 64 hex characters
      const result = validateJwtSecret(secureSecret, true);
      assert.equal(result.valid, true);
      assert.equal(result.error, undefined);
    });

    it("proves assertJwtSecretConfiguration() throws fatal error in production when JWT_SECRET is missing", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = "production";
        delete process.env.JWT_SECRET;

        assert.throws(
          () => assertJwtSecretConfiguration(),
          (err: any) => {
            return err instanceof Error && err.message.includes("FATAL: Insecure JWT configuration");
          },
          "Application must refuse to start in production without secure JWT_SECRET"
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalSecret !== undefined) {
          process.env.JWT_SECRET = originalSecret;
        } else {
          delete process.env.JWT_SECRET;
        }
      }
    });

    it("proves assertJwtSecretConfiguration() does NOT throw in development mode when JWT_SECRET is unset", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.JWT_SECRET;
      try {
        process.env.NODE_ENV = "development";
        delete process.env.JWT_SECRET;

        assert.doesNotThrow(() => assertJwtSecretConfiguration());
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalSecret !== undefined) {
          process.env.JWT_SECRET = originalSecret;
        } else {
          delete process.env.JWT_SECRET;
        }
      }
    });

    it("never falls back to SESSION_SECRET in production", () => {
      const originalEnv = process.env.NODE_ENV;
      const originalSecret = process.env.JWT_SECRET;
      const originalSession = process.env.SESSION_SECRET;
      try {
        process.env.NODE_ENV = "production";
        delete process.env.JWT_SECRET;
        process.env.SESSION_SECRET = "some-long-session-secret-that-is-over-32-characters-long!";

        // Must still throw because JWT_SECRET itself is missing
        assert.throws(
          () => getJwtSecret(),
          (err: any) => err.message.includes("JWT_SECRET is required in production"),
          "Must not fall back to SESSION_SECRET in production"
        );
      } finally {
        process.env.NODE_ENV = originalEnv;
        if (originalSecret !== undefined) process.env.JWT_SECRET = originalSecret;
        else delete process.env.JWT_SECRET;
        if (originalSession !== undefined) process.env.SESSION_SECRET = originalSession;
        else delete process.env.SESSION_SECRET;
      }
    });
  });

  describe("2. Cryptographic Algorithm & Signature Verification", () => {
    it("strictly rejects tokens with alg: 'none' (Algorithm None Attack)", () => {
      const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          userId: "usr-hacked",
          username: "attacker",
          role: "SYSTEM_ADMIN",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      ).toString("base64url");

      const noneToken = `${header}.${payload}.`;
      const result = verifyToken(noneToken);
      assert.equal(result, null, "Tokens with alg 'none' must be rejected unconditionally");
    });

    it("strictly rejects tokens with unexpected algorithms (e.g. RS256, HS384)", () => {
      const rsHeader = Buffer.from(JSON.stringify({ alg: "RS256", typ: "JWT" })).toString("base64url");
      const payload = Buffer.from(
        JSON.stringify({
          userId: "usr-1",
          username: "user",
          role: "REPRESENTATIVE",
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      ).toString("base64url");

      const rsToken = `${rsHeader}.${payload}.fakesignature`;
      assert.equal(verifyToken(rsToken), null, "Tokens with non-HS256 algorithms must be rejected");
    });

    it("rejects tokens signed with the removed hardcoded fallback secret when a custom secret is set", () => {
      const originalSecret = process.env.JWT_SECRET;
      try {
        const secureSecret = "super-secure-production-key-99887766554433221100!";
        process.env.JWT_SECRET = secureSecret;

        // Create a token signed with the old hardcoded fallback
        const oldSecret = "tabarestan-sales-dashboard-production-secret-key-2026";
        const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
        const payload = Buffer.from(
          JSON.stringify({
            userId: "usr-0",
            username: "admin",
            role: "SYSTEM_ADMIN",
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + 3600
          })
        ).toString("base64url");
        const oldSig = crypto.createHmac("sha256", oldSecret).update(`${header}.${payload}`).digest("base64url");
        const legacyToken = `${header}.${payload}.${oldSig}`;

        // Verify that the server rejects this legacy signed token
        const result = verifyToken(legacyToken);
        assert.equal(result, null, "Tokens signed with old fallback string must be rejected");
      } finally {
        if (originalSecret !== undefined) process.env.JWT_SECRET = originalSecret;
        else delete process.env.JWT_SECRET;
      }
    });

    it("rejects tokens with future iat exceeding clock skew tolerance", () => {
      const secret = getJwtSecret();
      const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
      const futureNow = Math.floor(Date.now() / 1000) + 300; // 5 minutes in future
      const payload = Buffer.from(
        JSON.stringify({
          userId: "usr-1",
          username: "time_traveler",
          role: "REPRESENTATIVE",
          iat: futureNow,
          exp: futureNow + 3600
        })
      ).toString("base64url");
      const sig = crypto.createHmac("sha256", secret).update(`${header}.${payload}`).digest("base64url");
      const futureToken = `${header}.${payload}.${sig}`;

      assert.equal(verifyToken(futureToken), null, "Tokens from the future must be rejected");
    });

    it("verifies and accepts legitimate tokens within validity window", () => {
      const token = generateToken({ id: "usr-valid-1", username: "validuser", role: "SALES_MANAGER" }, 3600);
      const verified = verifyToken(token);
      assert.ok(verified);
      assert.equal(verified?.userId, "usr-valid-1");
      assert.equal(verified?.username, "validuser");
      assert.equal(verified?.role, "SALES_MANAGER");
      assert.ok(verified?.exp && verified.exp > Math.floor(Date.now() / 1000));
    });
  });

  describe("3. Secret Privacy & No-Leak Guarantee", () => {
    it("does not leak secret values in error messages or validation outputs", () => {
      const sensitiveKey = "super-secret-password-1234567890-must-not-leak";
      const result = validateJwtSecret(sensitiveKey, true);
      const serialized = JSON.stringify(result);
      assert.ok(!serialized.includes(sensitiveKey), "Validation results must never output the secret");
    });
  });
});
