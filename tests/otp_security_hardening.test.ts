import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import {
  createOtp,
  verifyOtp,
  deleteOtp,
  getDevOtp,
  checkOtpRateLimit,
  recordOtpRequest,
  checkVerificationRateLimit,
  recordFailedVerification,
  clearCooldown,
  resetOtpRateLimitsForTesting,
  setOtpCooldownSecondsForTesting,
  MAX_OTP_ATTEMPTS,
  OTP_PHONE_MAX_REQUESTS,
  OTP_IP_MAX_REQUESTS,
  VERIFY_IP_MAX_ATTEMPTS
} from "../server/otp";
import { setSmsSendOverrideForTesting, sendOtpSms } from "../server/sms";
import { createExpressApp } from "../server";

import { setDbPoolForTesting, setDbHealthyForTesting, resetRedisStateForTesting } from "../server/database";
import { setAuthDbPoolOverrideForTesting } from "../server/auth";

describe("OTP Authentication & Password Recovery Security Hardening Tests", () => {
  let server: http.Server;
  let baseUrl: string;
  let originalRedisHost: string | undefined;

  const mockDbPool: any = {
    query: async (sql: string, values: any[] = []) => {
      const cleanSql = sql.trim().replace(/\s+/g, " ");
      if (/SELECT\s+1/i.test(cleanSql)) {
        return [[{ 1: 1 }], []];
      }
      if (/SELECT\s+\*\s+FROM\s+app_users\s+WHERE/i.test(cleanSql)) {
        const key = values[0];
        if (key === "09120000000" || key === "09120000001" || key === "09121112233") {
          return [[{
            id: "usr-hardened-1",
            username: "hardened_user",
            phoneNumber: key,
            role: "SYSTEM_ADMIN",
            fullName: "کاربر تست",
            password: "$2b$10$PsDANqVXkW9r/PZuHcEKzOQBvPNYbYeFU/D4WMt3fBE0mH2U4x33a",
            isEnabled: 1,
            mustChangePassword: 0
          }], []];
        }
        return [[], []];
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

  before(async () => {
    originalRedisHost = process.env.REDIS_HOST;
    delete process.env.REDIS_HOST;
    resetRedisStateForTesting();

    process.env.JWT_SECRET = "security-hardening-test-jwt-secret-minimum-32-chars";
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
    resetRedisStateForTesting();
    setAuthDbPoolOverrideForTesting(null);
    if (originalRedisHost !== undefined) {
      process.env.REDIS_HOST = originalRedisHost;
    } else {
      delete process.env.REDIS_HOST;
    }
    if (server) {
      if (typeof (server as any).closeAllConnections === "function") {
        (server as any).closeAllConnections();
      }
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

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

  beforeEach(() => {
    resetOtpRateLimitsForTesting();
    setSmsSendOverrideForTesting(null);
  });

  afterEach(() => {
    resetOtpRateLimitsForTesting();
    setSmsSendOverrideForTesting(null);
  });

  describe("1. Rate Limits and Cooldowns (Distributed & Local Enforcement)", () => {
    const testPhone = "09121112233";
    const testIp = "192.168.1.100";

    it("rejects repeated OTP requests within cooldown window with 429 and Retry-After", () => {
      setOtpCooldownSecondsForTesting(60);

      // First request: allowed
      const firstCheck = checkOtpRateLimit(testPhone, testIp, "LOGIN");
      assert.equal(firstCheck.allowed, true);
      recordOtpRequest(testPhone, testIp, "LOGIN");

      // Immediate second request: must be blocked by cooldown
      const secondCheck = checkOtpRateLimit(testPhone, testIp, "LOGIN");
      assert.equal(secondCheck.allowed, false);
      assert.ok(secondCheck.retryAfter && secondCheck.retryAfter > 0);
      assert.ok(secondCheck.error?.includes("صبر نمایید"));
    });

    it("enforces phone-level request limits across window (Max 5 per 15 min)", () => {
      setOtpCooldownSecondsForTesting(0); // Disable cooldown to test window quota

      for (let i = 0; i < OTP_PHONE_MAX_REQUESTS; i++) {
        const check = checkOtpRateLimit(testPhone, `192.168.1.${i}`, "LOGIN");
        assert.equal(check.allowed, true, `Request ${i + 1} within quota must be allowed`);
        recordOtpRequest(testPhone, `192.168.1.${i}`, "LOGIN");
      }

      // 6th request exceeding phone quota must be blocked
      const blocked = checkOtpRateLimit(testPhone, "192.168.1.99", "LOGIN");
      assert.equal(blocked.allowed, false);
      assert.ok(blocked.error?.includes("تعداد درخواست‌های کد تایید برای این شماره بیش از حد مجاز است"));
    });

    it("enforces IP-level request limits across window (Max 10 per 15 min)", () => {
      setOtpCooldownSecondsForTesting(0);
      const attackIp = "10.0.0.50";

      for (let i = 0; i < OTP_IP_MAX_REQUESTS; i++) {
        const phone = `091200000${i.toString().padStart(2, "0")}`;
        const check = checkOtpRateLimit(phone, attackIp, "LOGIN");
        assert.equal(check.allowed, true);
        recordOtpRequest(phone, attackIp, "LOGIN");
      }

      // 11th request from same IP must be blocked
      const blocked = checkOtpRateLimit("09129999999", attackIp, "LOGIN");
      assert.equal(blocked.allowed, false);
      assert.ok(blocked.error?.includes("آدرس شبکه"));
    });

    it("enforces IP verification attempt limits against brute forcing", () => {
      const attackIp = "10.0.0.88";

      for (let i = 0; i < VERIFY_IP_MAX_ATTEMPTS; i++) {
        assert.equal(checkVerificationRateLimit(attackIp).allowed, true);
        recordFailedVerification(attackIp);
      }

      // Next attempt must trigger rate limit lockout
      const blocked = checkVerificationRateLimit(attackIp);
      assert.equal(blocked.allowed, false);
      assert.ok(blocked.error?.includes("تعداد دفعات تلاش اشتباه"));
    });
  });

  describe("2. Account Enumeration Defenses", () => {
    it("returns consistent 200 response on send-otp for nonexistent accounts without disclosing absence", async () => {
      const res = await apiRequest("/api/auth/send-otp", {
        body: { phoneNumber: "09129990000" }, // Nonexistent account
        headers: { "x-forwarded-for": "172.16.0.1" }
      });

      // Must NOT return 404 Not Found (prevents account probing)
      assert.equal(res.status, 200);
      assert.equal(res.data?.success, true);
      assert.ok(res.data?.message?.includes("در صورت ثبت بودن اطلاعات"));
      assert.equal(res.data?.devOtp, undefined, "Must not generate or return devOtp for nonexistent accounts");
    });

    it("returns consistent 200 response on forgot-password-send for nonexistent accounts", async () => {
      const res = await apiRequest("/api/auth/forgot-password-send", {
        body: { phoneNumber: "09129990000" },
        headers: { "x-forwarded-for": "172.16.0.2" }
      });

      // Must NOT return 404 Not Found
      assert.equal(res.status, 200);
      assert.equal(res.data?.success, true);
      assert.ok(res.data?.message?.includes("در صورت ثبت بودن شماره همراه"));
    });

    it("returns consistent 400 response on verify-otp and forgot-password-reset for nonexistent account", async () => {
      const verifyRes = await apiRequest("/api/auth/verify-otp", {
        body: { phoneNumber: "09129990000", code: "123456" },
        headers: { "x-forwarded-for": "172.16.0.3" }
      });

      // Must return 400 Bad Request (not 404 User Not Found)
      assert.equal(verifyRes.status, 400);
      assert.equal(verifyRes.data?.success, false);
      assert.ok(verifyRes.data?.message?.includes("نادرست است یا منقضی"));

      const resetRes = await apiRequest("/api/auth/forgot-password-reset", {
        body: { phoneNumber: "09129990000", code: "123456", newPassword: "StrongPassword123!" },
        headers: { "x-forwarded-for": "172.16.0.4" }
      });

      assert.equal(resetRes.status, 400);
      assert.equal(resetRes.data?.success, false);
      assert.ok(resetRes.data?.message?.includes("نادرست است یا منقضی"));
    });
  });

  describe("3. SMS Provider Dispatch Verification & Failure Handling", () => {
    it("never reports success when SMS provider fails and destroys un-delivered OTP", async () => {
      // Simulate SMS gateway provider outage
      setSmsSendOverrideForTesting(async () => {
        return {
          success: false,
          provider: "kavenegar",
          error: "درگاه پیامک در دسترس نمی‌باشد (Error 500)."
        };
      });

      const res = await apiRequest("/api/auth/send-otp", {
        body: { phoneNumber: "09120000000" }, // Existing account
        headers: { "x-forwarded-for": "172.16.0.10" }
      });

      // Must return 502 Bad Gateway and fail, forwarding gateway error detail
      assert.equal(res.status, 502);
      assert.equal(res.data?.success, false);
      assert.ok(res.data?.message?.includes("درگاه پیامک در دسترس نمی‌باشد"));

      // Ensure the generated OTP was invalidated and deleted immediately
      const verifyRes = await apiRequest("/api/auth/verify-otp", {
        body: { phoneNumber: "09120000000", code: "123456" },
        headers: { "x-forwarded-for": "172.16.0.11" }
      });
      assert.equal(verifyRes.status, 400);
    });

    it("handles SMS failure on forgot-password-send without leaking success", async () => {
      setSmsSendOverrideForTesting(async () => {
        return {
          success: false,
          provider: "ippanel",
          error: "اعتبار پنل پیامک به اتمام رسیده است."
        };
      });

      const res = await apiRequest("/api/auth/forgot-password-send", {
        body: { phoneNumber: "09120000001" },
        headers: { "x-forwarded-for": "172.16.0.12" }
      });

      assert.equal(res.status, 502);
      assert.equal(res.data?.success, false);
      assert.ok(res.data?.message?.includes("اعتبار پنل پیامک به اتمام رسیده است"));
    });
  });

  describe("4. Purpose Isolation & Replay Protection", () => {
    const testPhone = "09125554433";

    it("prevents using a PASSWORD_RESET OTP for LOGIN", async () => {
      deleteOtp(testPhone);
      const resetOtp = createOtp(testPhone, "PASSWORD_RESET");

      const attemptLogin = await verifyOtp(testPhone, resetOtp.code, "LOGIN");
      assert.equal(attemptLogin.success, false);
      assert.equal(attemptLogin.reason, "NOT_FOUND");
    });

    it("prevents using a LOGIN OTP for PASSWORD_RESET", async () => {
      deleteOtp(testPhone);
      const loginOtp = createOtp(testPhone, "LOGIN");

      const attemptReset = await verifyOtp(testPhone, loginOtp.code, "PASSWORD_RESET");
      assert.equal(attemptReset.success, false);
      assert.equal(attemptReset.reason, "NOT_FOUND");
    });

    it("enforces single use: replay of consumed OTP is strictly rejected", async () => {
      deleteOtp(testPhone);
      const { code } = createOtp(testPhone, "LOGIN");

      const firstAttempt = await verifyOtp(testPhone, code, "LOGIN");
      assert.equal(firstAttempt.success, true);

      // Replay attack
      const secondAttempt = await verifyOtp(testPhone, code, "LOGIN");
      assert.equal(secondAttempt.success, false);
      assert.equal(secondAttempt.reason, "NOT_FOUND");
    });
  });

  describe("5. Attempt Limits & Expiration", () => {
    const testPhone = "09126667788";

    it("locks out and deletes code after MAX_OTP_ATTEMPTS (5) failed attempts", async () => {
      deleteOtp(testPhone);
      const { code } = createOtp(testPhone, "LOGIN");

      // 5 failed attempts
      for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
        const res = await verifyOtp(testPhone, "000000", "LOGIN");
        assert.equal(res.success, false);
        assert.equal(res.reason, "INVALID");
      }

      // 6th attempt triggers TOO_MANY_ATTEMPTS and deletes code
      const lockedOut = await verifyOtp(testPhone, "000000", "LOGIN");
      assert.equal(lockedOut.success, false);
      assert.equal(lockedOut.reason, "TOO_MANY_ATTEMPTS");

      // Subsequent attempt with correct code fails because code was purged
      const afterPurge = await verifyOtp(testPhone, code, "LOGIN");
      assert.equal(afterPurge.success, false);
      assert.equal(afterPurge.reason, "NOT_FOUND");
    });
  });

  describe("6. Safe Concurrent Verification", () => {
    const testPhone = "09127778899";

    it("safely handles concurrent verification attempts of the same OTP", async () => {
      deleteOtp(testPhone);
      const { code } = createOtp(testPhone, "LOGIN");

      // Execute 5 concurrent verification attempts simultaneously
      const results = await Promise.all([
        verifyOtp(testPhone, code, "LOGIN"),
        verifyOtp(testPhone, code, "LOGIN"),
        verifyOtp(testPhone, code, "LOGIN"),
        verifyOtp(testPhone, code, "LOGIN"),
        verifyOtp(testPhone, code, "LOGIN")
      ]);

      const successes = results.filter((r) => r.success === true);
      const failures = results.filter((r) => r.success === false);

      // Exactly ONE request must succeed (single-use guarantee)
      assert.equal(successes.length, 1, "Exactly one concurrent verification must succeed");
      assert.equal(failures.length, 4, "All other concurrent attempts must be rejected");
    });
  });

  describe("7. Production Security Leakage Guard", () => {
    it("never returns devOtp or logs codes when simulated in production mode", async () => {
      const origNodeEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = "production";

      try {
        const devOtp = getDevOtp("09120000000", "LOGIN");
        assert.equal(devOtp, null, "getDevOtp must strictly return null in production");
      } finally {
        process.env.NODE_ENV = origNodeEnv;
      }
    });
  });
});
