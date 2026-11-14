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
  const zsets = new Map<string, { members: Map<string, number>; expiresAt?: number }>();

  function cleanupExpired() {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (v.expiresAt && now > v.expiresAt) {
        store.delete(k);
      }
    }
    for (const [k, z] of zsets.entries()) {
      if (z.expiresAt && now > z.expiresAt) {
        zsets.delete(k);
      }
    }
  }

  function zremrangebyscore(key: string, minScore: number, maxScore: number) {
    const z = zsets.get(key);
    if (!z) return 0;
    let removed = 0;
    for (const [member, score] of z.members.entries()) {
      if (score >= minScore && score <= maxScore) {
        z.members.delete(member);
        removed++;
      }
    }
    return removed;
  }

  function zcard(key: string): number {
    const z = zsets.get(key);
    return z ? z.members.size : 0;
  }

  function zadd(key: string, score: number, member: string): number {
    let z = zsets.get(key);
    if (!z) {
      z = { members: new Map<string, number>() };
      zsets.set(key, z);
    }
    const isNew = !z.members.has(member);
    z.members.set(member, score);
    return isNew ? 1 : 0;
  }

  function zrangeOldestScore(key: string): number | null {
    const z = zsets.get(key);
    if (!z || z.members.size === 0) return null;
    let minScore = Infinity;
    for (const score of z.members.values()) {
      if (score < minScore) minScore = score;
    }
    return Number.isFinite(minScore) ? minScore : null;
  }

  const mockClient: any = {
    get: async (key: string) => {
      cleanupExpired();
      const item = store.get(key);
      return item ? item.value : null;
    },
    set: async (key: string, value: string, mode?: string, duration?: number) => {
      cleanupExpired();
      zsets.delete(key);
      const expiresAt = mode === "EX" && duration ? Date.now() + duration * 1000 : undefined;
      store.set(key, { value: String(value), expiresAt });
      return "OK";
    },
    del: async (key: string) => {
      cleanupExpired();
      const d1 = store.delete(key);
      const d2 = zsets.delete(key);
      return d1 || d2 ? 1 : 0;
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
      const item = store.get(key) || zsets.get(key);
      if (item) {
        item.expiresAt = Date.now() + seconds * 1000;
        return 1;
      }
      return 0;
    },
    ttl: async (key: string) => {
      cleanupExpired();
      const item = store.get(key) || zsets.get(key);
      if (!item) return -2;
      if (!item.expiresAt) return -1;
      const remainingMs = item.expiresAt - Date.now();
      return Math.max(0, Math.ceil(remainingMs / 1000));
    },
    type: async (key: string) => {
      cleanupExpired();
      if (zsets.has(key)) return "zset";
      if (store.has(key)) return "string";
      return "none";
    },
    keys: async (pattern: string) => {
      cleanupExpired();
      const regex = new RegExp("^" + pattern.replace(/\*/g, ".*") + "$");
      const allKeys = new Set([...store.keys(), ...zsets.keys()]);
      return Array.from(allKeys).filter(k => regex.test(k));
    },
    eval: async (script: string, numkeys: number, ...args: (string | number)[]) => {
      cleanupExpired();
      const keys = args.slice(0, numkeys) as string[];
      const argv = args.slice(numkeys);

      // Lua simulation for ATOMIC_CHECK_AND_RECORD_OTP_LUA (3 keys, 6 argv)
      if (keys.length === 3 && argv.length === 6) {
        const [cooldownKey, phoneRateKey, ipRateKey] = keys;
        const now = Number(argv[0]) || 0;
        const windowMs = Number(argv[1]) || 900000;
        const phoneMax = Number(argv[2]) || 5;
        const ipMax = Number(argv[3]) || 10;
        const cooldownSec = Number(argv[4]) || 0;
        const memberId = String(argv[5] || "");
        const windowSec = Math.ceil(windowMs / 1000);
        const windowStart = now - windowMs;

        const cooldownTtl = await mockClient.ttl(cooldownKey);
        if (cooldownTtl > 0) {
          return [0, cooldownTtl, "COOLDOWN"];
        }

        zremrangebyscore(phoneRateKey, -Infinity, windowStart);
        if (zcard(phoneRateKey) >= phoneMax) {
          const oldestScore = zrangeOldestScore(phoneRateKey);
          const retryAfter = oldestScore !== null
            ? Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000))
            : windowSec;
          return [0, retryAfter, "PHONE_LIMIT"];
        }

        zremrangebyscore(ipRateKey, -Infinity, windowStart);
        if (zcard(ipRateKey) >= ipMax) {
          const oldestScore = zrangeOldestScore(ipRateKey);
          const retryAfter = oldestScore !== null
            ? Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000))
            : windowSec;
          return [0, retryAfter, "IP_LIMIT"];
        }

        if (cooldownSec > 0) {
          await mockClient.set(cooldownKey, "1", "EX", cooldownSec);
        }
        zadd(phoneRateKey, now, memberId);
        await mockClient.expire(phoneRateKey, windowSec);
        zadd(ipRateKey, now, memberId);
        await mockClient.expire(ipRateKey, windowSec);
        return [1, 0, "OK"];
      }

      // Lua simulation for CHECK_OTP_RATE_LIMIT_LUA (3 keys, 4 argv: [now, windowMs, phoneMax, ipMax])
      if (keys.length === 3 && argv.length === 4 && script.includes("PHONE_LIMIT")) {
        const [cooldownKey, phoneRateKey, ipRateKey] = keys;
        const now = Number(argv[0]) || 0;
        const windowMs = Number(argv[1]) || 900000;
        const phoneMax = Number(argv[2]) || 5;
        const ipMax = Number(argv[3]) || 10;
        const windowStart = now - windowMs;

        const cooldownTtl = await mockClient.ttl(cooldownKey);
        if (cooldownTtl > 0) {
          return [0, cooldownTtl, "COOLDOWN"];
        }

        if (zsets.has(phoneRateKey)) {
          zremrangebyscore(phoneRateKey, -Infinity, windowStart);
          if (zcard(phoneRateKey) >= phoneMax) {
            const oldestScore = zrangeOldestScore(phoneRateKey);
            const retryAfter = oldestScore !== null
              ? Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000))
              : Math.ceil(windowMs / 1000);
            return [0, retryAfter, "PHONE_LIMIT"];
          }
        } else {
          const phoneVal = await mockClient.get(phoneRateKey);
          const phoneCount = Number(phoneVal || 0);
          if (phoneCount >= phoneMax) {
            const pTtl = await mockClient.ttl(phoneRateKey);
            return [0, pTtl >= 0 ? pTtl : 900, "PHONE_LIMIT"];
          }
        }

        if (zsets.has(ipRateKey)) {
          zremrangebyscore(ipRateKey, -Infinity, windowStart);
          if (zcard(ipRateKey) >= ipMax) {
            const oldestScore = zrangeOldestScore(ipRateKey);
            const retryAfter = oldestScore !== null
              ? Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000))
              : Math.ceil(windowMs / 1000);
            return [0, retryAfter, "IP_LIMIT"];
          }
        } else {
          const ipVal = await mockClient.get(ipRateKey);
          const ipCount = Number(ipVal || 0);
          if (ipCount >= ipMax) {
            const iTtl = await mockClient.ttl(ipRateKey);
            return [0, iTtl >= 0 ? iTtl : 900, "IP_LIMIT"];
          }
        }

        return [1, 0, "OK"];
      }

      // Lua simulation for RECORD_OTP_REQUEST_LUA (3 keys, 2 or 4 argv: [cooldownSec, windowSec, (now), (memberId)])
      if (keys.length === 3 && (argv.length === 2 || argv.length === 4)) {
        const [cooldownKey, phoneRateKey, ipRateKey] = keys;
        const cooldownSec = Number(argv[0]) || 0;
        const windowSec = Number(argv[1]) || 900;
        const now = Number(argv[2]) || 0;
        const memberId = String(argv[3] || "");

        if (cooldownSec > 0) {
          await mockClient.set(cooldownKey, "1", "EX", cooldownSec);
        }

        if (now > 0 && memberId !== "") {
          zadd(phoneRateKey, now, memberId);
          await mockClient.expire(phoneRateKey, windowSec);
          zadd(ipRateKey, now, memberId);
          await mockClient.expire(ipRateKey, windowSec);
        } else {
          const pCount = await mockClient.incr(phoneRateKey);
          if (pCount === 1) {
            await mockClient.expire(phoneRateKey, windowSec);
          }

          const iCount = await mockClient.incr(ipRateKey);
          if (iCount === 1) {
            await mockClient.expire(ipRateKey, windowSec);
          }
        }

        return 1;
      }

      // Lua simulation for CHECK_VERIFY_RATE_LUA (1 key, 3 argv: [now, windowMs, maxAttempts])
      if (keys.length === 1 && argv.length === 3) {
        const key = keys[0];
        const now = Number(argv[0]) || 0;
        const windowMs = Number(argv[1]) || 900000;
        const maxAttempts = Number(argv[2]) || 20;
        const windowStart = now - windowMs;

        if (zsets.has(key)) {
          zremrangebyscore(key, -Infinity, windowStart);
          if (zcard(key) >= maxAttempts) {
            const oldestScore = zrangeOldestScore(key);
            const retryAfter = oldestScore !== null
              ? Math.max(1, Math.ceil((oldestScore + windowMs - now) / 1000))
              : Math.ceil(windowMs / 1000);
            return [0, retryAfter];
          }
        } else {
          const val = await mockClient.get(key);
          const count = Number(val || 0);
          if (count >= maxAttempts) {
            const ttl = await mockClient.ttl(key);
            return [0, ttl >= 0 ? ttl : 900];
          }
        }
        return [1, 0];
      }

      // Lua simulation for RECORD_FAILED_VERIFY_LUA (1 key, 4 argv: [now, windowMs, maxAttempts, memberId])
      if (keys.length === 1 && argv.length === 4 && script.includes("ZREMRANGEBYSCORE")) {
        const key = keys[0];
        const now = Number(argv[0]) || 0;
        const windowMs = Number(argv[1]) || 900000;
        const maxAttempts = Number(argv[2]) || 20;
        const memberId = String(argv[3] || "");
        const windowSec = Math.ceil(windowMs / 1000);
        const windowStart = now - windowMs;

        zremrangebyscore(key, -Infinity, windowStart);
        zadd(key, now, memberId);
        await mockClient.expire(key, windowSec);

        const count = zcard(key);
        return [count, count >= maxAttempts ? 1 : 0];
      }

      return null;
    },
    // Expose raw internal store for test verification
    _getStore: () => store,
    _getZsets: () => zsets
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
