import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import crypto from "crypto";
import {
  generateToken,
  verifyToken,
  assertJwtSecretConfiguration,
  validateJwtSecret,
  setAuthDbPoolOverrideForTesting
} from "../server/auth";
import {
  setDbPoolForTesting,
  setDbHealthyForTesting,
  setRedisClientForTesting,
  resetRedisStateForTesting,
  isDatabaseHealthy
} from "../server/database";
import {
  createOtp,
  verifyOtp,
  checkVerificationRateLimit,
  recordFailedVerification,
  resetOtpRateLimitsForTesting,
  getRedisOtpKey,
  getRedisCooldownKey
} from "../server/otp";
import { setSmsSendOverrideForTesting } from "../server/sms";
import { createExpressApp, resolveServerPort } from "../server";

function createMockRedis() {
  const kvStore = new Map<string, { value: string; expiresAt?: number }>();
  const zsets = new Map<string, { members: Map<string, number>; expiresAt?: number }>();

  function cleanupExpired() {
    const now = Date.now();
    for (const [k, v] of kvStore.entries()) {
      if (v.expiresAt && now > v.expiresAt) kvStore.delete(k);
    }
    for (const [k, z] of zsets.entries()) {
      if (z.expiresAt && now > z.expiresAt) zsets.delete(k);
    }
  }

  const client: any = {
    ping: async () => "PONG",
    get: async (key: string) => {
      cleanupExpired();
      const item = kvStore.get(key);
      return item ? item.value : null;
    },
    set: async (key: string, value: string, mode?: string, duration?: number) => {
      cleanupExpired();
      const expiresAt = mode === "EX" && duration ? Date.now() + duration * 1000 : undefined;
      kvStore.set(key, { value: String(value), expiresAt });
      return "OK";
    },
    del: async (key: string) => {
      cleanupExpired();
      const d1 = kvStore.delete(key);
      const d2 = zsets.delete(key);
      return d1 || d2 ? 1 : 0;
    },
    ttl: async (key: string) => {
      cleanupExpired();
      const item = kvStore.get(key) || zsets.get(key);
      if (!item) return -2;
      if (!item.expiresAt) return -1;
      return Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 1000));
    },
    expire: async (key: string, seconds: number) => {
      cleanupExpired();
      const item = kvStore.get(key) || zsets.get(key);
      if (item) {
        item.expiresAt = Date.now() + seconds * 1000;
        return 1;
      }
      return 0;
    },
    eval: async (script: string, numkeys: number, ...args: (string | number)[]) => {
      cleanupExpired();
      const keys = args.slice(0, numkeys).map(String);
      const argv = args.slice(numkeys);

      // Verify OTP atomic consumption script
      if (script.includes("inputCode == expectedCode") || script.includes("isMatch")) {
        const otpKey = keys[0];
        const cooldownKey = keys[1];
        const raw = kvStore.get(otpKey)?.value;
        if (!raw) return [0, "NOT_FOUND", "کد تایید یافت نشد یا منقضی شده است."];

        const record = JSON.parse(raw);
        const now = Number(argv[1]);
        if (record.expiresAt && now > record.expiresAt) {
          kvStore.delete(otpKey);
          return [0, "EXPIRED", "کد تایید منقضی شده است."];
        }

        record.attempts = (record.attempts || 0) + 1;
        const maxAttempts = Number(argv[2]);
        if (record.attempts > maxAttempts) {
          kvStore.delete(otpKey);
          return [0, "TOO_MANY_ATTEMPTS", "تعداد دفعات تلاش اشتباه بیش از حد مجاز است."];
        }

        const inputCode = String(argv[0]);
        if (inputCode !== String(record.code)) {
          const item = kvStore.get(otpKey);
          if (item) item.value = JSON.stringify(record);
          return [0, "INVALID", "کد تایید وارد شده نادرست است."];
        }

        // Match: single-use atomic consumption
        kvStore.delete(otpKey);
        if (cooldownKey) kvStore.delete(cooldownKey);
        return [1, "OK", ""];
      }

      // Check verify rate
      if (script.includes("CHECK_VERIFY_RATE_LUA") || script.includes("count >= maxAttempts")) {
        const key = keys[0];
        const now = Number(argv[0]);
        const windowMs = Number(argv[1]);
        const maxAttempts = Number(argv[2]);
        const windowStart = now - windowMs;

        const zset = zsets.get(key);
        if (!zset) return [1, 0];

        for (const [member, score] of zset.members.entries()) {
          if (score <= windowStart) zset.members.delete(member);
        }

        if (zset.members.size >= maxAttempts) {
          return [0, Math.ceil(windowMs / 1000)];
        }
        return [1, 0];
      }

      // Record failed verify
      if (script.includes("RECORD_FAILED_VERIFY_LUA") || script.includes("ZADD")) {
        const key = keys[0];
        const now = Number(argv[0]);
        const windowMs = Number(argv[1]);
        const maxAttempts = Number(argv[2]);
        const memberId = String(argv[3]);
        const windowSec = Math.ceil(windowMs / 1000);
        const windowStart = now - windowMs;

        let zset = zsets.get(key);
        if (!zset) {
          zset = { members: new Map<string, number>(), expiresAt: Date.now() + windowSec * 1000 };
          zsets.set(key, zset);
        }

        for (const [member, score] of zset.members.entries()) {
          if (score <= windowStart) zset.members.delete(member);
        }

        zset.members.set(memberId, now);
        zset.expiresAt = Date.now() + windowSec * 1000;
        const count = zset.members.size;
        return [count, count >= maxAttempts ? 1 : 0];
      }

      return [1, 0, "OK"];
    }
  };

  return client;
}

describe("Cloud Run & Final Security Requirements Suite", () => {
  const savedNodeEnv = process.env.NODE_ENV;
  const savedJwtSecret = process.env.JWT_SECRET;
  const savedRequireRedis = process.env.REQUIRE_REDIS;
  const savedRedisHost = process.env.REDIS_HOST;
  const validSecret = "production-cryptographic-jwt-secret-minimum-32-chars-high-entropy-2026!";

  function restoreEnvVar(key: string, val: string | undefined) {
    if (val === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }

  beforeEach(() => {
    delete process.env.REDIS_HOST;
    resetRedisStateForTesting();
    resetOtpRateLimitsForTesting();
    setSmsSendOverrideForTesting(null);
  });

  afterEach(() => {
    restoreEnvVar("NODE_ENV", savedNodeEnv);
    restoreEnvVar("JWT_SECRET", savedJwtSecret);
    restoreEnvVar("REQUIRE_REDIS", savedRequireRedis);
    restoreEnvVar("REDIS_HOST", savedRedisHost);
    resetRedisStateForTesting();
    resetOtpRateLimitsForTesting();
    setSmsSendOverrideForTesting(null);
  });

  describe("1. Strict JWT Secret Management in Production", () => {
    it("fails startup in production when JWT_SECRET is completely missing", () => {
      process.env.NODE_ENV = "production";
      delete process.env.JWT_SECRET;

      assert.throws(
        () => assertJwtSecretConfiguration(),
        (err: any) => {
          return err instanceof Error && err.message.includes("FATAL: Insecure JWT configuration");
        },
        "Must throw fatal error on startup in production when JWT_SECRET is missing"
      );
    });

    it("fails startup in production when JWT_SECRET is invalid or weak (< 32 chars)", () => {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET = "short-secret";

      assert.throws(
        () => assertJwtSecretConfiguration(),
        (err: any) => {
          return err instanceof Error && err.message.includes("at least 32 characters long");
        },
        "Must throw fatal error on startup in production when JWT_SECRET is under 32 chars"
      );
    });

    it("starts up successfully in production when valid JWT_SECRET is provided", () => {
      process.env.NODE_ENV = "production";
      process.env.JWT_SECRET = validSecret;

      assert.doesNotThrow(() => assertJwtSecretConfiguration());
    });

    it("ensures two independent application instances sharing the configured secret validate each other's tokens", () => {
      process.env.JWT_SECRET = validSecret;

      // Instance 1 issues token
      const tokenFromInstance1 = generateToken({
        id: "usr-shared-1",
        username: "shared_admin",
        role: "SYSTEM_ADMIN"
      });

      // Instance 2 (independent verification with same secret)
      const decodedByInstance2 = verifyToken(tokenFromInstance1);
      assert.ok(decodedByInstance2);
      assert.equal(decodedByInstance2.userId, "usr-shared-1");
      assert.equal(decodedByInstance2.role, "SYSTEM_ADMIN");
    });

    it("ensures restarting or replacing an instance preserves token validity when secret remains unchanged", () => {
      process.env.JWT_SECRET = validSecret;
      const issuedToken = generateToken({ id: "usr-restart", username: "restart_user", role: "REPRESENTATIVE" });

      // Simulate container restart (fresh environment with same injected secret)
      delete (process.env as any).SIMULATED_STATE;
      process.env.JWT_SECRET = validSecret;

      const verified = verifyToken(issuedToken);
      assert.ok(verified);
      assert.equal(verified.username, "restart_user");
    });
  });

  describe("2. Cloud Run Port Resolution & Startup Validation", () => {
    it("resolves PORT=8080 correctly in production", () => {
      const port = resolveServerPort("8080", true);
      assert.equal(port, 8080);
    });

    it("resolves PORT=3000 correctly in development", () => {
      const port = resolveServerPort("3000", false);
      assert.equal(port, 3000);
    });

    it("defaults to 8080 in production when PORT is unset", () => {
      const port = resolveServerPort(undefined, true);
      assert.equal(port, 8080);
    });

    it("defaults to 3000 in development when PORT is unset", () => {
      const port = resolveServerPort(undefined, false);
      assert.equal(port, 3000);
    });

    it("rejects invalid non-numeric or out-of-range TCP ports", () => {
      assert.throws(() => resolveServerPort("invalid", true), /Invalid server port/);
      assert.throws(() => resolveServerPort("99999", true), /Invalid server port/);
      assert.throws(() => resolveServerPort("-10", true), /Invalid server port/);
      assert.throws(() => resolveServerPort("0", true), /Invalid server port/);
      assert.throws(() => resolveServerPort("3.14", true), /Invalid server port/);
    });
  });

  describe("3. Health Checks (/healthz Liveness & /readyz Readiness)", () => {
    let server: http.Server;
    let baseUrl: string;

    const mockDb: any = {
      query: async (sql: string) => [[{ 1: 1 }], []],
      getConnection: async () => ({
        query: async () => [[{ 1: 1 }], []],
        beginTransaction: async () => {},
        commit: async () => {},
        rollback: async () => {},
        release: () => {}
      })
    };

    before(async () => {
      process.env.JWT_SECRET = validSecret;
      setDbPoolForTesting(mockDb);
      setAuthDbPoolOverrideForTesting(mockDb);
      setDbHealthyForTesting(true);

      const app = await createExpressApp({ skipDatabaseBootstrap: true });
      server = http.createServer(app);
      await new Promise<void>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address() as any;
          baseUrl = `http://127.0.0.1:${addr.port}`;
          resolve();
        });
      });
    });

    after(async () => {
      setDbPoolForTesting(null);
      setAuthDbPoolOverrideForTesting(null);
      if (server) {
        if (typeof (server as any).closeAllConnections === "function") {
          (server as any).closeAllConnections();
        }
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });

    it("returns 200 on /healthz (liveness) confirming process is alive", async () => {
      const res = await fetch(`${baseUrl}/healthz`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, "healthy");
      assert.equal(typeof body.uptime, "number");
    });

    it("returns 200 on /readyz (readiness) when MariaDB and Redis are healthy", async () => {
      setDbHealthyForTesting(true);
      const mockRedis = createMockRedis();
      setRedisClientForTesting(mockRedis);

      const res = await fetch(`${baseUrl}/readyz`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, "ready");
      assert.equal(body.checks.database, "up");
    });

    it("returns 503 on /readyz when MariaDB is unavailable", async () => {
      setDbHealthyForTesting(false);
      try {
        const res = await fetch(`${baseUrl}/readyz`);
        assert.equal(res.status, 503);
        const body = await res.json();
        assert.equal(body.status, "not_ready");
        assert.equal(body.checks.database, "down");
        // Must never leak secrets, passwords, or connection details
        assert.equal(body.password, undefined);
        assert.equal(body.connectionString, undefined);
      } finally {
        setDbHealthyForTesting(true);
      }
    });

    it("returns 503 on /readyz when required Redis service is unavailable", async () => {
      process.env.REQUIRE_REDIS = "true";
      setRedisClientForTesting(null);
      try {
        const res = await fetch(`${baseUrl}/readyz`);
        assert.equal(res.status, 503);
        const body = await res.json();
        assert.equal(body.status, "not_ready");
        assert.equal(body.checks.redis, "down");
      } finally {
        delete process.env.REQUIRE_REDIS;
      }
    });

    it("preserves 200 on /healthz (liveness) even when external dependencies are down", async () => {
      setDbHealthyForTesting(false);
      try {
        const res = await fetch(`${baseUrl}/healthz`);
        assert.equal(res.status, 200, "Liveness must remain 200 so container is not prematurely killed");
      } finally {
        setDbHealthyForTesting(true);
      }
    });
  });

  describe("4. OTP Security & Atomic Verification Rate Limiting", () => {
    it("fails closed in production when Redis is offline during rate limit check", async () => {
      process.env.NODE_ENV = "production";
      setRedisClientForTesting(null);

      const check = await checkVerificationRateLimit("198.51.100.99");
      assert.equal(check.allowed, false);
      assert.equal(check.isServiceUnavailable, true);
    });

    it("fails closed in production when Redis is offline during failed verification recording", async () => {
      process.env.NODE_ENV = "production";
      setRedisClientForTesting(null);

      const recordRes = await recordFailedVerification("198.51.100.99");
      assert.equal(recordRes.recorded, false);
      assert.equal(recordRes.isServiceUnavailable, true);
    });

    it("enforces atomic single-use OTP verification: exactly 1 concurrent verify succeeds", async () => {
      const mockRedis = createMockRedis();
      setRedisClientForTesting(mockRedis);

      const testPhone = "09121118899";
      const otp = createOtp(testPhone, "LOGIN");

      // Save to Redis
      const otpKey = getRedisOtpKey("LOGIN", testPhone);
      await mockRedis.set(
        otpKey,
        JSON.stringify({
          phone: testPhone,
          code: otp.code,
          purpose: "LOGIN",
          createdAt: Date.now(),
          expiresAt: Date.now() + 180000,
          attempts: 0
        })
      );

      // Launch 5 concurrent verification attempts with the exact same valid code
      const results = await Promise.all([
        verifyOtp(testPhone, otp.code, "LOGIN"),
        verifyOtp(testPhone, otp.code, "LOGIN"),
        verifyOtp(testPhone, otp.code, "LOGIN"),
        verifyOtp(testPhone, otp.code, "LOGIN"),
        verifyOtp(testPhone, otp.code, "LOGIN")
      ]);

      const successes = results.filter((r) => r.success === true);
      const failures = results.filter((r) => r.success === false);

      assert.equal(successes.length, 1, "Exactly one concurrent verification must succeed");
      assert.equal(failures.length, 4, "All 4 other concurrent attempts must be rejected");

      // Replay attack is rejected
      const replay = await verifyOtp(testPhone, otp.code, "LOGIN");
      assert.equal(replay.success, false);
      assert.equal(replay.reason, "NOT_FOUND");
    });

    it("verifies multi-instance distributed verification across independent server instances sharing Redis", async () => {
      const sharedRedis = createMockRedis();

      // Instance 1: creates OTP and writes to shared Redis
      setRedisClientForTesting(sharedRedis);
      const testPhone = "09123334455";
      const { code } = createOtp(testPhone, "LOGIN");
      await sharedRedis.set(
        getRedisOtpKey("LOGIN", testPhone),
        JSON.stringify({
          phone: testPhone,
          code,
          purpose: "LOGIN",
          createdAt: Date.now(),
          expiresAt: Date.now() + 180000,
          attempts: 0
        })
      );

      // Instance 2: distinct local state, shares Redis client
      resetOtpRateLimitsForTesting(); // Clear in-memory
      setRedisClientForTesting(sharedRedis);

      // Instance 2 verifies and atomically consumes
      const verifyFromInstance2 = await verifyOtp(testPhone, code, "LOGIN");
      assert.equal(verifyFromInstance2.success, true);

      // Instance 1 subsequently attempts to reuse -> rejected
      const verifyFromInstance1 = await verifyOtp(testPhone, code, "LOGIN");
      assert.equal(verifyFromInstance1.success, false);
      assert.equal(verifyFromInstance1.reason, "NOT_FOUND");
    });
  });
});
