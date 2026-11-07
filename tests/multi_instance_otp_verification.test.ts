import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  createOtp,
  verifyOtpDistributed,
  resetOtpRateLimitsForTesting,
  getRedisOtpKey
} from "../server/otp";
import { setRedisClientForTesting, resetRedisStateForTesting } from "../server/database";

function createSharedMockRedis() {
  const store = new Map<string, { value: string; expiresAt?: number }>();

  function cleanupExpired() {
    const now = Date.now();
    for (const [k, v] of store.entries()) {
      if (v.expiresAt && now > v.expiresAt) store.delete(k);
    }
  }

  const client: any = {
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
      return store.delete(key) ? 1 : 0;
    },
    ttl: async (key: string) => {
      cleanupExpired();
      const item = store.get(key);
      if (!item) return -2;
      if (!item.expiresAt) return -1;
      return Math.max(0, Math.ceil((item.expiresAt - Date.now()) / 1000));
    },
    eval: async (script: string, numkeys: number, ...args: (string | number)[]) => {
      cleanupExpired();
      const keys = args.slice(0, numkeys) as string[];
      const argv = args.slice(numkeys);

      // Simulation for VERIFY_OTP_ATOMIC_LUA
      if (script.includes("VERIFY_OTP_ATOMIC_LUA") || keys.length >= 2) {
        const otpKey = keys[0];
        const cooldownKey = keys[1];
        const inputCode = String(argv[0]).trim();
        const now = Number(argv[1]);
        const maxAttempts = Number(argv[2] || 5);

        const item = store.get(otpKey);
        if (!item) {
          return [0, "NOT_FOUND", "کد تایید یافت نشد یا منقضی شده است. لطفاً مجدداً درخواست ارسال کد نمایید."];
        }

        let record: any;
        try {
          record = JSON.parse(item.value);
        } catch {
          store.delete(otpKey);
          return [0, "NOT_FOUND", "کد تایید نامعتبر است."];
        }

        if (record.expiresAt && now > Number(record.expiresAt)) {
          store.delete(otpKey);
          return [0, "EXPIRED", "کد تایید منقضی شده است. لطفاً مجدداً درخواست ارسال کد نمایید."];
        }

        record.attempts = (record.attempts || 0) + 1;
        if (record.attempts > maxAttempts) {
          store.delete(otpKey);
          return [0, "TOO_MANY_ATTEMPTS", "تعداد دفعات تلاش اشتباه بیش از حد مجاز است. کد باطل شد. لطفاً مجدداً درخواست کد نمایید."];
        }

        const expectedCode = String(record.code || "").trim();
        if (inputCode !== expectedCode) {
          store.set(otpKey, { value: JSON.stringify(record), expiresAt: item.expiresAt });
          const remaining = maxAttempts - record.attempts;
          return [0, "INVALID", `کد تایید وارد شده نادرست است. (${remaining} تلاش باقی‌مانده)`];
        }

        // Matched! Atomically consume immediately (single-use guarantee)
        store.delete(otpKey);
        if (cooldownKey) store.delete(cooldownKey);
        return [1, "OK", ""];
      }

      return [0, "NOT_FOUND", "Unknown script"];
    }
  };

  return client;
}

describe("Item 2: Multi-Instance Distributed OTP Verification Suite", () => {
  let sharedRedis: any;
  const testPhone = "09123334455";

  beforeEach(() => {
    sharedRedis = createSharedMockRedis();
    setRedisClientForTesting(sharedRedis);
    resetOtpRateLimitsForTesting();
  });

  afterEach(() => {
    resetRedisStateForTesting();
    resetOtpRateLimitsForTesting();
  });

  it("2.1 Cross-Instance Verification: Code created on Instance 1 is successfully verified by Instance 2", async () => {
    // Instance 1 creates the OTP and saves to Redis
    const { code } = createOtp(testPhone, "LOGIN");

    // Simulate Instance 2: clear local in-memory store so Instance 2 only has Redis
    resetOtpRateLimitsForTesting();

    // Instance 2 verifies against shared Redis
    const verifyResult = await verifyOtpDistributed(testPhone, code, "LOGIN");
    assert.equal(verifyResult.success, true, "Instance 2 must successfully verify OTP stored in Redis");

    // Verify OTP was consumed and deleted from Redis (single use)
    const stored = await sharedRedis.get(getRedisOtpKey("LOGIN", testPhone));
    assert.equal(stored, null, "OTP key must be deleted immediately after successful verification");
  });

  it("2.2 Atomic Single-Use Concurrency: Concurrent requests cannot reuse the same OTP", async () => {
    const { code } = createOtp(testPhone, "LOGIN");

    // Two instances attempt to verify the exact same valid OTP simultaneously
    const [result1, result2] = await Promise.all([
      verifyOtpDistributed(testPhone, code, "LOGIN"),
      verifyOtpDistributed(testPhone, code, "LOGIN")
    ]);

    const successes = [result1, result2].filter(r => r.success);
    const failures = [result1, result2].filter(r => !r.success);

    assert.equal(successes.length, 1, "Exactly one verification attempt must succeed");
    assert.equal(failures.length, 1, "The second concurrent attempt must be rejected (single-use)");
    assert.equal(failures[0].reason, "NOT_FOUND");
  });

  it("2.3 Shared Distributed Attempt Limit: Failed attempts across instances aggregate to 5", async () => {
    createOtp(testPhone, "LOGIN");

    // Instance 1 sends 3 wrong attempts
    for (let i = 0; i < 3; i++) {
      const res = await verifyOtpDistributed(testPhone, "000000", "LOGIN");
      assert.equal(res.success, false);
      assert.equal(res.reason, "INVALID");
    }

    // Instance 2 (cleared local memory) sends 2 more wrong attempts
    resetOtpRateLimitsForTesting();
    for (let i = 0; i < 2; i++) {
      const res = await verifyOtpDistributed(testPhone, "000000", "LOGIN");
      assert.equal(res.success, false);
    }

    // 6th attempt from any instance must be blocked with TOO_MANY_ATTEMPTS
    resetOtpRateLimitsForTesting();
    const blockedRes = await verifyOtpDistributed(testPhone, "000000", "LOGIN");
    assert.equal(blockedRes.success, false);
    assert.equal(blockedRes.reason, "TOO_MANY_ATTEMPTS");
  });
});
