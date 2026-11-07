import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkAndRecordOtpRequest,
  setOtpCooldownSecondsForTesting,
  resetOtpRateLimitsForTesting,
  OTP_PHONE_MAX_REQUESTS,
  OTP_IP_MAX_REQUESTS
} from "../server/otp";
import { setRedisClientForTesting, resetRedisStateForTesting } from "../server/database";

function createAtomicMockRedis() {
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

  // Redis is single-threaded: Lua scripts execute atomically and synchronously to completion
  const client: any = {
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
      const keys = args.slice(0, numkeys) as string[];
      const argv = args.slice(numkeys);

      if (script.includes("ATOMIC_CHECK_AND_RECORD_OTP_LUA") || (keys.length === 3 && argv.length >= 6)) {
        const cooldownKey = keys[0];
        const phoneRateKey = keys[1];
        const ipRateKey = keys[2];

        const now = Number(argv[0]);
        const windowMs = Number(argv[1]);
        const phoneMax = Number(argv[2]);
        const ipMax = Number(argv[3]);
        const cooldownSec = Number(argv[4]);
        const memberId = String(argv[5]);
        const windowStart = now - windowMs;

        // 1. Cooldown check (synchronous)
        const cItem = kvStore.get(cooldownKey);
        if (cItem && (!cItem.expiresAt || cItem.expiresAt > now)) {
          const ttlSec = cItem.expiresAt ? Math.ceil((cItem.expiresAt - now) / 1000) : cooldownSec;
          return [0, ttlSec, "COOLDOWN"];
        }

        // 2. Phone ZSET sliding-window check (synchronous)
        let phoneZ = zsets.get(phoneRateKey);
        if (phoneZ) {
          for (const [m, score] of phoneZ.members.entries()) {
            if (score <= windowStart) phoneZ.members.delete(m);
          }
        }
        const phoneCount = phoneZ ? phoneZ.members.size : 0;
        if (phoneCount >= phoneMax) {
          let retryAfter = Math.ceil(windowMs / 1000);
          if (phoneZ) {
            const sorted = Array.from(phoneZ.members.values()).sort((a, b) => a - b);
            if (sorted.length > 0) {
              retryAfter = Math.max(1, Math.ceil((sorted[0] + windowMs - now) / 1000));
            }
          }
          return [0, retryAfter, "PHONE_LIMIT"];
        }

        // 3. IP ZSET sliding-window check (synchronous)
        let ipZ = zsets.get(ipRateKey);
        if (ipZ) {
          for (const [m, score] of ipZ.members.entries()) {
            if (score <= windowStart) ipZ.members.delete(m);
          }
        }
        const ipCount = ipZ ? ipZ.members.size : 0;
        if (ipCount >= ipMax) {
          let retryAfter = Math.ceil(windowMs / 1000);
          if (ipZ) {
            const sorted = Array.from(ipZ.members.values()).sort((a, b) => a - b);
            if (sorted.length > 0) {
              retryAfter = Math.max(1, Math.ceil((sorted[0] + windowMs - now) / 1000));
            }
          }
          return [0, retryAfter, "IP_LIMIT"];
        }

        // 4. Atomic record of request (synchronous in single Redis step)
        const windowSec = Math.ceil(windowMs / 1000);
        if (cooldownSec > 0) {
          kvStore.set(cooldownKey, { value: "1", expiresAt: now + cooldownSec * 1000 });
        }

        if (!phoneZ) {
          phoneZ = { members: new Map() };
          zsets.set(phoneRateKey, phoneZ);
        }
        phoneZ.members.set(memberId, now);
        phoneZ.expiresAt = now + windowSec * 1000;

        if (!ipZ) {
          ipZ = { members: new Map() };
          zsets.set(ipRateKey, ipZ);
        }
        ipZ.members.set(memberId, now);
        ipZ.expiresAt = now + windowSec * 1000;

        return [1, 0, "OK"];
      }

      return [1, 0, "OK"];
    }
  };

  return client;
}

describe("Item 1: Truly Atomic OTP Rate Limiting Suite (Zero Race Conditions)", () => {
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = createAtomicMockRedis();
    setRedisClientForTesting(mockRedis);
    resetOtpRateLimitsForTesting();
  });

  afterEach(() => {
    resetRedisStateForTesting();
    resetOtpRateLimitsForTesting();
  });

  it("1.1 Concurrency Burst per Phone: Exactly 5 of 15 simultaneous requests succeed", async () => {
    setOtpCooldownSecondsForTesting(0);
    const phone = "09121110001";

    const tasks = Array.from({ length: 15 }, (_, i) =>
      checkAndRecordOtpRequest(phone, `10.0.1.${i}`, "LOGIN")
    );

    const results = await Promise.all(tasks);

    const allowedCount = results.filter(r => r.allowed).length;
    const blockedCount = results.filter(r => !r.allowed).length;

    assert.equal(allowedCount, OTP_PHONE_MAX_REQUESTS, `Exactly ${OTP_PHONE_MAX_REQUESTS} requests must be allowed`);
    assert.equal(blockedCount, 15 - OTP_PHONE_MAX_REQUESTS, "Exceeding concurrent requests must be rejected");

    for (const blocked of results.filter(r => !r.allowed)) {
      assert.match(blocked.error || "", /تعداد درخواست‌های کد تایید برای این شماره بیش از حد مجاز است/);
      assert.ok(blocked.retryAfter && blocked.retryAfter > 0);
    }
  });

  it("1.2 Concurrency Burst per IP: Exactly 10 of 20 simultaneous requests succeed", async () => {
    setOtpCooldownSecondsForTesting(0);
    const ip = "192.168.10.88";

    const tasks = Array.from({ length: 20 }, (_, i) =>
      checkAndRecordOtpRequest(`091200000${i.toString().padStart(2, "0")}`, ip, "LOGIN")
    );

    const results = await Promise.all(tasks);

    const allowedCount = results.filter(r => r.allowed).length;
    const blockedCount = results.filter(r => !r.allowed).length;

    assert.equal(allowedCount, OTP_IP_MAX_REQUESTS, `Exactly ${OTP_IP_MAX_REQUESTS} requests must be allowed for IP`);
    assert.equal(blockedCount, 20 - OTP_IP_MAX_REQUESTS, "Exceeding concurrent requests from IP must be rejected");

    for (const blocked of results.filter(r => !r.allowed)) {
      assert.match(blocked.error || "", /تعداد درخواست‌های کد تایید از این آدرس شبکه/);
    }
  });

  it("1.3 Cooldown Race: Exactly 1 of 5 simultaneous requests for same phone succeeds when cooldown is active", async () => {
    setOtpCooldownSecondsForTesting(60);
    const phone = "09122223344";

    const tasks = Array.from({ length: 5 }, (_, i) =>
      checkAndRecordOtpRequest(phone, `10.0.2.${i}`, "LOGIN")
    );

    const results = await Promise.all(tasks);

    const allowed = results.filter(r => r.allowed);
    const blocked = results.filter(r => !r.allowed);

    assert.equal(allowed.length, 1, "Only the first concurrent request may pass before cooldown locks");
    assert.equal(blocked.length, 4, "All remaining concurrent requests must be rejected by cooldown");

    for (const b of blocked) {
      assert.match(b.error || "", /صبر نمایید/);
    }
  });

  it("1.4 In-Memory Fallback Concurrency: Without Redis, safe sliding-window limits strictly apply", async () => {
    setRedisClientForTesting(null);
    setOtpCooldownSecondsForTesting(0);
    const phone = "09125556677";

    const tasks = Array.from({ length: 10 }, (_, i) =>
      checkAndRecordOtpRequest(phone, `10.0.3.${i}`, "LOGIN")
    );

    const results = await Promise.all(tasks);
    const allowed = results.filter(r => r.allowed);
    const blocked = results.filter(r => !r.allowed);

    assert.equal(allowed.length, OTP_PHONE_MAX_REQUESTS);
    assert.equal(blocked.length, 10 - OTP_PHONE_MAX_REQUESTS);
  });
});
