import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { setAuthDbPoolOverrideForTesting } from "../server/auth";
import { hashPasswordSync } from "../server/password";
import {
  setDbPoolForTesting,
  setDbHealthyForTesting,
  setRedisClientForTesting,
  resetRedisStateForTesting
} from "../server/database";
import {
  setOtpCooldownSecondsForTesting,
  resetOtpRateLimitsForTesting,
  getRedisOtpKey,
  createOtp
} from "../server/otp";
import { setSmsSendOverrideForTesting } from "../server/sms";
import { createExpressApp } from "../server";

function createUnifiedMockRedis() {
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

      // 1. ATOMIC_CHECK_AND_RECORD_OTP_LUA
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

        const cItem = kvStore.get(cooldownKey);
        if (cItem && (!cItem.expiresAt || cItem.expiresAt > now)) {
          const ttlSec = cItem.expiresAt ? Math.ceil((cItem.expiresAt - now) / 1000) : cooldownSec;
          return [0, ttlSec, "COOLDOWN"];
        }

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

      // 2. VERIFY_OTP_ATOMIC_LUA
      if (script.includes("VERIFY_OTP_ATOMIC_LUA") || (keys.length === 2 && argv.length >= 3)) {
        const otpKey = keys[0];
        const cooldownKey = keys[1];
        const inputCode = String(argv[0]).trim();
        const now = Number(argv[1]);
        const maxAttempts = Number(argv[2] || 5);

        const item = kvStore.get(otpKey);
        if (!item) {
          return [0, "NOT_FOUND", "کد تایید یافت نشد یا منقضی شده است. لطفاً مجدداً درخواست ارسال کد نمایید."];
        }

        let record: any;
        try {
          record = JSON.parse(item.value);
        } catch {
          kvStore.delete(otpKey);
          return [0, "NOT_FOUND", "کد تایید نامعتبر است."];
        }

        if (record.expiresAt && now > Number(record.expiresAt)) {
          kvStore.delete(otpKey);
          return [0, "EXPIRED", "کد تایید منقضی شده است. لطفاً مجدداً درخواست ارسال کد نمایید."];
        }

        record.attempts = (record.attempts || 0) + 1;
        if (record.attempts > maxAttempts) {
          kvStore.delete(otpKey);
          return [0, "TOO_MANY_ATTEMPTS", "تعداد دفعات تلاش اشتباه بیش از حد مجاز است. کد باطل شد. لطفاً مجدداً درخواست کد نمایید."];
        }

        const expectedCode = String(record.code || "").trim();
        if (inputCode !== expectedCode) {
          kvStore.set(otpKey, { value: JSON.stringify(record), expiresAt: item.expiresAt });
          const remaining = maxAttempts - record.attempts;
          return [0, "INVALID", `کد تایید وارد شده نادرست است. (${remaining} تلاش باقی‌مانده)`];
        }

        // Matched! Atomically consume immediately (single-use guarantee)
        kvStore.delete(otpKey);
        if (cooldownKey) kvStore.delete(cooldownKey);
        return [1, "OK", ""];
      }

      // 3. CHECK_VERIFY_RATE_LUA
      if (script.includes("CHECK_VERIFY_RATE_LUA")) {
        const verifyKey = keys[0];
        const now = Number(argv[0] || Date.now());
        const windowMs = Number(argv[1] || 900000);
        const maxAttempts = Number(argv[2] || 20);
        const windowStart = now - windowMs;

        const ipZ = zsets.get(verifyKey);
        if (ipZ) {
          for (const [m, score] of ipZ.members.entries()) {
            if (score <= windowStart) ipZ.members.delete(m);
          }
          if (ipZ.members.size >= maxAttempts) {
            return [0, Math.ceil(windowMs / 1000)];
          }
        }
        return [1, 0];
      }

      // 4. RECORD_FAILED_VERIFY_LUA
      if (script.includes("RECORD_FAILED_VERIFY_LUA")) {
        const verifyKey = keys[0];
        const now = Number(argv[0] || Date.now());
        const windowMs = Number(argv[1] || 900000);
        const maxAttempts = Number(argv[2] || 20);
        const memberId = String(argv[3] || `${now}`);
        const windowStart = now - windowMs;
        const windowSec = Math.ceil(windowMs / 1000);

        let ipZ = zsets.get(verifyKey);
        if (!ipZ) {
          ipZ = { members: new Map() };
          zsets.set(verifyKey, ipZ);
        }
        for (const [m, score] of ipZ.members.entries()) {
          if (score <= windowStart) ipZ.members.delete(m);
        }
        ipZ.members.set(memberId, now);
        ipZ.expiresAt = now + windowSec * 1000;

        const count = ipZ.members.size;
        return [count, count >= maxAttempts ? 1 : 0];
      }

      return [1, 0, "OK"];
    }
  };

  return client;
}

describe("Comprehensive End-to-End API Security Test Suite (All 6 Findings)", () => {
  let server: http.Server;
  let baseUrl: string;
  let mockRedis: any;

  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  const testPhone = "09121112233";
  let dbUserPasswordHash = hashPasswordSync("InitialSecurePassword123!");

  const mockDbPool: any = {
    query: async (sql: string, values: any[] = []) => {
      const cleanSql = sql.trim().replace(/\s+/g, " ");

      if (/SELECT\s+1/i.test(cleanSql)) {
        return [[{ 1: 1 }], []];
      }

      if (/SELECT\s+\*\s+FROM\s+app_users\s+WHERE\s+phoneNumber\s*=\s*\?\s*OR\s*username\s*=\s*\?\s*OR\s*agentCode\s*=\s*\?/i.test(cleanSql)) {
        const key = values[0];
        if (key === testPhone || key === "test_user") {
          return [[{
            id: "usr-e2e-1",
            username: "test_user",
            phoneNumber: testPhone,
            role: "REPRESENTATIVE",
            fullName: "کاربر تست جامع",
            password: dbUserPasswordHash,
            isEnabled: 1,
            mustChangePassword: 0
          }], []];
        }
        return [[], []];
      }

      if (/UPDATE\s+app_users\s+SET\s+password\s*=\s*\?,\s*mustChangePassword\s*=\s*0\s+WHERE\s+id\s*=\s*\?/i.test(cleanSql)) {
        dbUserPasswordHash = values[0];
        return [{ affectedRows: 1 }, []];
      }

      if (/INSERT\s+INTO\s+user_activity_logs/i.test(cleanSql)) {
        return [{ insertId: 1 }, []];
      }

      return [[], []];
    },
    getConnection: async () => ({
      query: async (sql: string, values: any[] = []) => mockDbPool.query(sql, values),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    })
  };

  async function apiRequest(endpoint: string, options: {
    method?: string;
    body?: any;
    headers?: Record<string, string>;
  } = {}): Promise<{ status: number; headers: Headers; data: any }> {
    const { method = "POST", body, headers = {} } = options;
    const reqHeaders: Record<string, string> = {
      "Accept": "application/json",
      "Content-Type": "application/json",
      "Connection": "close",
      ...headers
    };

    const res = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers: reqHeaders,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    let data: any = null;
    const contentType = res.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      try {
        data = await res.json();
      } catch {
        data = null;
      }
    } else {
      data = await res.text();
    }

    return { status: res.status, headers: res.headers, data };
  }

  before(async () => {
    process.env.JWT_SECRET = "production-comprehensive-api-security-secret-key-32chars";
    process.env.NODE_ENV = "development";

    setDbPoolForTesting(mockDbPool);
    setAuthDbPoolOverrideForTesting(mockDbPool);
    setDbHealthyForTesting(true);

    const app = await createExpressApp({ skipDatabaseBootstrap: true });
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const address = server.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    if (server) {
      if (typeof (server as any).closeAllConnections === "function") {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    process.env.NODE_ENV = originalNodeEnv;
    process.env.APP_ENV = originalAppEnv;
    process.env.JWT_SECRET = originalJwtSecret;
    resetRedisStateForTesting();
    resetOtpRateLimitsForTesting();
    setSmsSendOverrideForTesting(null);
  });

  beforeEach(() => {
    mockRedis = createUnifiedMockRedis();
    setRedisClientForTesting(mockRedis);
    resetOtpRateLimitsForTesting();
    setOtpCooldownSecondsForTesting(0);
    setSmsSendOverrideForTesting(async () => ({ success: true, messageId: "sms-e2e-ok", provider: "simulated_dev" }));
  });

  afterEach(() => {
    resetRedisStateForTesting();
    resetOtpRateLimitsForTesting();
    setOtpCooldownSecondsForTesting(null);
    setSmsSendOverrideForTesting(null);
  });

  it("1. Concurrency Burst on /api/auth/send-otp: Exactly 5 of 15 simultaneous requests succeed", async () => {
    const burstRequests = Array.from({ length: 15 }, () =>
      apiRequest("/api/auth/send-otp", {
        body: { phoneNumber: testPhone },
        headers: { "x-forwarded-for": "198.51.100.1" }
      })
    );

    const responses = await Promise.all(burstRequests);

    const succeeded = responses.filter(r => r.status === 200);
    const rateLimited = responses.filter(r => r.status === 429);

    assert.equal(succeeded.length, 5, "Exactly 5 requests must succeed within the phone window");
    assert.equal(rateLimited.length, 10, "Remaining 10 requests must be rejected with 429 Too Many Requests");
    assert.ok(rateLimited[0].headers.get("retry-after"), "Rate limited response must include Retry-After header");
  });

  it("2. Concurrency on /api/auth/verify-otp with valid code: Exactly 1 succeeds, all others fail", async () => {
    // Generate valid OTP
    const { code } = createOtp(testPhone, "LOGIN");

    // 5 concurrent verification attempts using the exact same valid code
    const concurrentVerifications = Array.from({ length: 5 }, () =>
      apiRequest("/api/auth/verify-otp", {
        body: { phoneNumber: testPhone, code },
        headers: { "x-forwarded-for": "198.51.100.2" }
      })
    );

    const responses = await Promise.all(concurrentVerifications);

    const successful = responses.filter(r => r.status === 200);
    const failed = responses.filter(r => r.status === 400);

    assert.equal(successful.length, 1, "Exactly ONE verification request must succeed");
    assert.equal(failed.length, 4, "The other 4 concurrent requests must fail (single-use consumption)");
    assert.ok(successful[0].data?.token, "Successful login must return a signed JWT token");
    assert.equal(successful[0].data?.user?.phoneNumber, testPhone);
  });

  it("3. Cross-Instance / Two-Instance Distributed Verification via Redis", async () => {
    // Instance 1 creates OTP in shared Redis
    const { code } = createOtp(testPhone, "LOGIN");

    // Verify key exists in shared Redis
    const redisOtpKey = getRedisOtpKey("LOGIN", testPhone);
    const stored = await mockRedis.get(redisOtpKey);
    assert.ok(stored, "OTP record must be stored in shared Redis");

    // Simulate Instance 2: completely clear process-local memory store
    resetOtpRateLimitsForTesting();

    // Instance 2 executes verify-otp against shared Redis
    const response = await apiRequest("/api/auth/verify-otp", {
      body: { phoneNumber: testPhone, code },
      headers: { "x-forwarded-for": "198.51.100.3" }
    });

    assert.equal(response.status, 200, "Instance 2 must successfully verify OTP from shared Redis");
    assert.equal(response.data?.success, true);
    assert.ok(response.data?.token, "Must issue valid JWT token");

    // Key must be consumed and deleted from shared Redis
    const afterDelete = await mockRedis.get(redisOtpKey);
    assert.equal(afterDelete, null, "OTP key must be deleted from shared Redis after consumption");
  });

  it("4. Full Authentication Flow via /api/auth/send-otp and /api/auth/verify-otp", async () => {
    const sendRes = await apiRequest("/api/auth/send-otp", {
      body: { phoneNumber: testPhone },
      headers: { "x-forwarded-for": "198.51.100.4" }
    });

    assert.equal(sendRes.status, 200);
    assert.equal(sendRes.data?.success, true);
    assert.ok(sendRes.data?.devOtp, "In development mode, devOtp is returned for testing");

    const otpCode = sendRes.data.devOtp;

    const verifyRes = await apiRequest("/api/auth/verify-otp", {
      body: { phoneNumber: testPhone, code: otpCode },
      headers: { "x-forwarded-for": "198.51.100.4" }
    });

    assert.equal(verifyRes.status, 200);
    assert.equal(verifyRes.data?.success, true);
    assert.ok(verifyRes.data?.token, "Must return signed JWT");
    assert.equal(verifyRes.data?.user?.username, "test_user");
    assert.equal(verifyRes.data?.user?.password, undefined, "Sanitizer must strip password");
  });

  it("5. Full Password Reset Flow via /api/auth/forgot-password-reset", async () => {
    const sendRes = await apiRequest("/api/auth/forgot-password-send", {
      body: { phoneNumber: testPhone },
      headers: { "x-forwarded-for": "198.51.100.5" }
    });

    assert.equal(sendRes.status, 200);
    assert.equal(sendRes.data?.success, true);
    assert.ok(sendRes.data?.devOtp);

    const otpCode = sendRes.data.devOtp;
    const newStrongPassword = "BrandNewSuperSecurePass2026!";

    // 1. Rejection of weak/default passwords
    const weakResetRes = await apiRequest("/api/auth/forgot-password-reset", {
      body: { phoneNumber: testPhone, code: otpCode, newPassword: "123" },
      headers: { "x-forwarded-for": "198.51.100.5" }
    });
    assert.equal(weakResetRes.status, 400);

    // 2. Successful reset with valid code and strong password
    const validResetRes = await apiRequest("/api/auth/forgot-password-reset", {
      body: { phoneNumber: testPhone, code: otpCode, newPassword: newStrongPassword },
      headers: { "x-forwarded-for": "198.51.100.5" }
    });

    assert.equal(validResetRes.status, 200);
    assert.equal(validResetRes.data?.success, true);

    // 3. Replay attack with same OTP must be rejected (single-use)
    const replayResetRes = await apiRequest("/api/auth/forgot-password-reset", {
      body: { phoneNumber: testPhone, code: otpCode, newPassword: "AnotherNewPassword123!" },
      headers: { "x-forwarded-for": "198.51.100.5" }
    });
    assert.equal(replayResetRes.status, 400, "Replayed OTP code must be rejected");
  });

  it("6. Redis Outage Fail-Closed Behavior in Production Environment", async () => {
    process.env.NODE_ENV = "production";
    // Simulate complete Redis failure
    setRedisClientForTesting(null);

    // 1. send-otp must fail closed (HTTP 503)
    const sendRes = await apiRequest("/api/auth/send-otp", {
      body: { phoneNumber: testPhone },
      headers: { "x-forwarded-for": "198.51.100.6" }
    });
    assert.equal(sendRes.status, 503, "Production send-otp must fail closed with 503 when Redis is unavailable");
    assert.equal(sendRes.data?.success, false);

    // 2. verify-otp must fail closed (HTTP 503)
    const verifyRes = await apiRequest("/api/auth/verify-otp", {
      body: { phoneNumber: testPhone, code: "123456" },
      headers: { "x-forwarded-for": "198.51.100.6" }
    });
    assert.equal(verifyRes.status, 503, "Production verify-otp must fail closed with 503 when Redis is unavailable");
    assert.equal(verifyRes.data?.success, false);

    // 3. forgot-password-send must fail closed (HTTP 503)
    const forgotRes = await apiRequest("/api/auth/forgot-password-send", {
      body: { phoneNumber: testPhone },
      headers: { "x-forwarded-for": "198.51.100.6" }
    });
    assert.equal(forgotRes.status, 503, "Production forgot-password-send must fail closed with 503");

    // 4. forgot-password-reset must fail closed (HTTP 503)
    const resetRes = await apiRequest("/api/auth/forgot-password-reset", {
      body: { phoneNumber: testPhone, code: "123456", newPassword: "NewSecurePassword123!" },
      headers: { "x-forwarded-for": "198.51.100.6" }
    });
    assert.equal(resetRes.status, 503, "Production forgot-password-reset must fail closed with 503");

    // Restore dev environment for subsequent tests
    process.env.NODE_ENV = "development";
  });
});
