import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkOtpRateLimit,
  recordOtpRequest,
  checkVerificationRateLimit,
  recordFailedVerification,
  clearCooldown,
  resetOtpRateLimitsForTesting,
  setOtpCooldownSecondsForTesting,
  OTP_PHONE_MAX_REQUESTS,
  OTP_IP_MAX_REQUESTS,
  VERIFY_IP_MAX_ATTEMPTS,
  getRedisCooldownKey,
  getRedisPhoneRateKey,
  getRedisIpRateKey,
  getRedisVerifyRateKey
} from "../server/otp";
import { setRedisClientForTesting, resetRedisStateForTesting } from "../server/database";

/**
 * Creates an in-memory mock Redis instance supporting key storage, TTL, expire, and Lua script execution
 */
function createMockRedis() {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  function cleanupExpired() {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (v.expiresAt && now > v.expiresAt) {
        store.delete(k);
      }
    }
  }

  const mockClient: any = {
    get: async (key: string) => {
      cleanupExpired();
      const item = store.get(key);
      return item ? item.value : null;
    },
    set: async (key: string, value: string, mode?: string, duration?: number) => {
      cleanupExpired();
      const expiresAt = mode === "EX" && duration ? Date.now() + duration * 1000 : undefined;
      store.set(key, { value: String(value), expiresAt });
      return "OK";
    },
    del: async (key: string) => {
      cleanupExpired();
      const existed = store.delete(key);
      return existed ? 1 : 0;
    },
    incr: async (key: string) => {
      cleanupExpired();
      const current = store.get(key);
      const val = current ? parseInt(current.value, 10) + 1 : 1;
      store.set(key, { value: String(val), expiresAt: current?.expiresAt });
      return val;
    },
    expire: async (key: string, seconds: number) => {
      cleanupExpired();
      const current = store.get(key);
      if (current) {
        current.expiresAt = Date.now() + seconds * 1000;
        return 1;
      }
      return 0;
    },
    ttl: async (key: string) => {
      cleanupExpired();
      const item = store.get(key);
      if (!item) return -2;
      if (!item.expiresAt) return -1;
      const remainingMs = item.expiresAt - Date.now();
      return Math.max(0, Math.ceil(remainingMs / 1000));
    },
    keys: async (pattern: string) => {
      cleanupExpired();
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      return Array.from(store.keys()).filter(k => regex.test(k));
    },
    eval: async (script: string, numkeys: number, ...args: (string | number)[]) => {
      cleanupExpired();
      const keys = args.slice(0, numkeys) as string[];
      const argv = args.slice(numkeys);

      // Lua simulation for CHECK_OTP_RATE_LIMIT_LUA
      if (script.includes("CHECK_OTP_RATE_LIMIT_LUA") || script.includes("COOLDOWN")) {
        const cooldownKey = keys[0];
        const phoneRateKey = keys[1];
        const ipRateKey = keys[2];
        const phoneMax = Number(argv[0]);
        const ipMax = Number(argv[1]);

        const cooldownTtl = await mockClient.ttl(cooldownKey);
        if (cooldownTtl > 0) {
          return [0, cooldownTtl, "COOLDOWN"];
        }

        const phoneVal = await mockClient.get(phoneRateKey);
        const phoneCount = Number(phoneVal || 0);
        if (phoneCount >= phoneMax) {
          const pTtl = await mockClient.ttl(phoneRateKey);
          return [0, pTtl > 0 ? pTtl : 900, "PHONE_LIMIT"];
        }

        const ipVal = await mockClient.get(ipRateKey);
        const ipCount = Number(ipVal || 0);
        if (ipCount >= ipMax) {
          const iTtl = await mockClient.ttl(ipRateKey);
          return [0, iTtl > 0 ? iTtl : 900, "IP_LIMIT"];
        }

        return [1, 0, "OK"];
      }

      // Lua simulation for RECORD_OTP_REQUEST_LUA
      if (script.includes("RECORD_OTP_REQUEST_LUA") || (keys.length === 3 && argv.length === 2)) {
        const cooldownKey = keys[0];
        const phoneRateKey = keys[1];
        const ipRateKey = keys[2];
        const cooldownSec = Number(argv[0]);
        const windowSec = Number(argv[1]);

        if (cooldownSec > 0) {
          await mockClient.set(cooldownKey, "1", "EX", cooldownSec);
        }

        const pCount = await mockClient.incr(phoneRateKey);
        if (pCount === 1) {
          await mockClient.expire(phoneRateKey, windowSec);
        }

        const iCount = await mockClient.incr(ipRateKey);
        if (iCount === 1) {
          await mockClient.expire(ipRateKey, windowSec);
        }

        return 1;
      }

      // Lua simulation for CHECK_VERIFY_RATE_LUA
      if (script.includes("CHECK_VERIFY_RATE_LUA") || keys.length === 1 && argv.length === 1) {
        const key = keys[0];
        const max = Number(argv[0]);
        const val = await mockClient.get(key);
        const count = Number(val || 0);
        if (count >= max) {
          const ttl = await mockClient.ttl(key);
          return [0, ttl > 0 ? ttl : 900];
        }
        return [1, 0];
      }

      // Lua simulation for RECORD_FAILED_VERIFY_LUA
      if (script.includes("RECORD_FAILED_VERIFY_LUA") || keys.length === 1 && argv.length === 1) {
        const key = keys[0];
        const windowSec = Number(argv[0]);
        const count = await mockClient.incr(key);
        if (count === 1) {
          await mockClient.expire(key, windowSec);
        }
        return count;
      }

      return null;
    },
    // Expose raw internal store for test verification
    _getStore: () => store
  };

  return mockClient;
}

describe("Redis-Backed OTP Rate Limiting Suite", () => {
  let mockRedis: any;
  const testPhone = "09121112233";
  const testIp = "192.168.1.50";

  beforeEach(() => {
    mockRedis = createMockRedis();
    setRedisClientForTesting(mockRedis);
    resetOtpRateLimitsForTesting();
  });

  afterEach(() => {
    resetRedisStateForTesting();
    resetOtpRateLimitsForTesting();
  });

  it("1. Resend cooldown: Enforces resend cooldown atomically in Redis", async () => {
    setOtpCooldownSecondsForTesting(45);

    // Initial check: must be allowed
    const firstCheck = await checkOtpRateLimit(testPhone, testIp, "LOGIN");
    assert.equal(firstCheck.allowed, true);

    // Record request in Redis
    await recordOtpRequest(testPhone, testIp, "LOGIN");

    // Immediate subsequent check: blocked by Redis cooldown
    const secondCheck = await checkOtpRateLimit(testPhone, testIp, "LOGIN");
    assert.equal(secondCheck.allowed, false);
    assert.ok(secondCheck.retryAfter && secondCheck.retryAfter > 0);
    assert.match(secondCheck.error || "", /صبر نمایید/);

    // Verify cooldown key in Redis
    const cooldownKey = getRedisCooldownKey("LOGIN", testPhone);
    const ttl = await mockRedis.ttl(cooldownKey);
    assert.ok(ttl > 0 && ttl <= 45, `Cooldown key must have TTL <= 45s, got ${ttl}`);
  });

  it("2. Multi-instance / Restart behavior: Limits survive complete memory wipe", async () => {
    setOtpCooldownSecondsForTesting(60);

    // Record request on Server Instance A
    await recordOtpRequest(testPhone, testIp, "LOGIN");

    // Simulate Server Instance A crash / restart (in-memory state wiped)
    resetOtpRateLimitsForTesting();

    // Check rate limit on Server Instance B connected to the same Redis
    const checkOnNewInstance = await checkOtpRateLimit(testPhone, testIp, "LOGIN");
    assert.equal(
      checkOnNewInstance.allowed,
      false,
      "Rate limit must be enforced on separate server instance via Redis"
    );
    assert.match(checkOnNewInstance.error || "", /صبر نمایید/);
  });

  it("3. Phone quota: Blocks exceeding requests per phone across 15m window", async () => {
    setOtpCooldownSecondsForTesting(0); // Disable cooldown to test window quota

    // Perform maximum allowed requests
    for (let i = 0; i < OTP_PHONE_MAX_REQUESTS; i++) {
      const check = await checkOtpRateLimit(testPhone, `10.0.0.${i}`, "LOGIN");
      assert.equal(check.allowed, true, `Request ${i + 1} should be allowed`);
      await recordOtpRequest(testPhone, `10.0.0.${i}`, "LOGIN");
    }

    // Exceeding request must be blocked
    const blockedCheck = await checkOtpRateLimit(testPhone, "10.0.0.99", "LOGIN");
    assert.equal(blockedCheck.allowed, false);
    assert.match(blockedCheck.error || "", /تعداد درخواست‌های کد تایید برای این شماره بیش از حد مجاز است/);

    // Verify Redis counter value
    const phoneKey = getRedisPhoneRateKey(testPhone);
    const count = await mockRedis.get(phoneKey);
    assert.equal(parseInt(count, 10), OTP_PHONE_MAX_REQUESTS);
  });

  it("4. IP quota: Blocks exceeding requests per client IP", async () => {
    setOtpCooldownSecondsForTesting(0);

    // Perform maximum allowed requests from testIp
    for (let i = 0; i < OTP_IP_MAX_REQUESTS; i++) {
      const distinctPhone = `091200000${i.toString().padStart(2, "0")}`;
      const check = await checkOtpRateLimit(distinctPhone, testIp, "LOGIN");
      assert.equal(check.allowed, true);
      await recordOtpRequest(distinctPhone, testIp, "LOGIN");
    }

    // Next request from testIp must be blocked
    const blocked = await checkOtpRateLimit("09129999999", testIp, "LOGIN");
    assert.equal(blocked.allowed, false);
    assert.match(blocked.error || "", /تعداد درخواست‌های کد تایید از این آدرس شبکه/);
  });

  it("5. Verification brute-force protection: Blocks repeated failed attempts from IP", async () => {
    const attackerIp = "198.51.100.22";

    // Record failures up to threshold
    for (let i = 0; i < VERIFY_IP_MAX_ATTEMPTS; i++) {
      const check = await checkVerificationRateLimit(attackerIp);
      assert.equal(check.allowed, true);
      await recordFailedVerification(attackerIp);
    }

    // Exceeding attempt blocked
    const blocked = await checkVerificationRateLimit(attackerIp);
    assert.equal(blocked.allowed, false);
    assert.match(blocked.error || "", /تعداد دفعات تلاش اشتباه/);

    const verifyKey = getRedisVerifyRateKey(attackerIp);
    const ttl = await mockRedis.ttl(verifyKey);
    assert.ok(ttl > 0 && ttl <= 900, "Verify rate key must have TTL up to 900s");
  });

  it("6. Automatic TTL expiration: Keys expire automatically in Redis", async () => {
    setOtpCooldownSecondsForTesting(1);

    await recordOtpRequest(testPhone, testIp, "LOGIN");
    const cooldownKey = getRedisCooldownKey("LOGIN", testPhone);

    const ttlBefore = await mockRedis.ttl(cooldownKey);
    assert.ok(ttlBefore > 0, "Key must have positive TTL");

    // Clear key manually to simulate TTL expiration
    await mockRedis.del(cooldownKey);
    resetOtpRateLimitsForTesting();

    const checkAfterExpiry = await checkOtpRateLimit(testPhone, testIp, "LOGIN");
    assert.equal(checkAfterExpiry.allowed, true, "After TTL expiration, request must be allowed again");
  });

  it("7. Redis failure graceful degradation: Falls back to in-memory rate limiting when Redis fails", async () => {
    setOtpCooldownSecondsForTesting(60);

    // Mock Redis that throws errors
    const failingRedis: any = {
      eval: async () => { throw new Error("Redis connection timed out"); },
      get: async () => { throw new Error("Redis unreachable"); },
      set: async () => { throw new Error("Redis unreachable"); },
      del: async () => { throw new Error("Redis unreachable"); },
      keys: async () => { throw new Error("Redis unreachable"); }
    };
    setRedisClientForTesting(failingRedis);

    // First request should work via in-memory fallback
    const firstCheck = await checkOtpRateLimit(testPhone, testIp, "LOGIN");
    assert.equal(firstCheck.allowed, true);
    await recordOtpRequest(testPhone, testIp, "LOGIN");

    // Second request should still be blocked by in-memory fallback
    const secondCheck = await checkOtpRateLimit(testPhone, testIp, "LOGIN");
    assert.equal(secondCheck.allowed, false);
    assert.match(secondCheck.error || "", /صبر نمایید/);
  });

  it("8. Clear cooldown: Removes cooldown key from Redis upon authentication", async () => {
    setOtpCooldownSecondsForTesting(60);
    await recordOtpRequest(testPhone, testIp, "LOGIN");

    const cooldownKey = getRedisCooldownKey("LOGIN", testPhone);
    const beforeClear = await mockRedis.get(cooldownKey);
    assert.ok(beforeClear !== null);

    // Clear cooldown
    clearCooldown(testPhone, "LOGIN");

    const afterClear = await mockRedis.get(cooldownKey);
    assert.equal(afterClear, null, "Cooldown key must be removed from Redis");
  });
});
