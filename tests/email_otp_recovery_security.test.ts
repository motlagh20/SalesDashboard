import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import net from "node:net";
import { setAuthDbPoolOverrideForTesting, generateToken } from "../server/auth";
import { hashPasswordSync } from "../server/password";
import {
  setDbPoolForTesting,
  setDbHealthyForTesting,
  setRedisClientForTesting,
  resetRedisStateForTesting
} from "../server/database";
import {
  checkAndRecordEmailAccountRateLimit,
  checkAndRecordEmailIdentifierRateLimit,
  checkEmailVerificationRateLimit,
  consumeRecoveryToken,
  getRedisEmailOtpKey,
  issueEmailOtp,
  issueRecoveryToken,
  recordEmailFailedVerification,
  resetEmailOtpStateForTesting,
  resetOtpRateLimitsForTesting,
  setEmailOtpCooldownSecondsForTesting,
  verifyEmailOtp
} from "../server/otp";
import {
  resetEmailModuleForTesting,
  saveEmailSettings,
  setDnsLookupOverrideForTesting,
  setEmailEncryptionKeyForTesting,
  setEmailSendOverrideForTesting,
  setEmailSettingsFilePathForTesting
} from "../server/email";
import { createExpressApp } from "../server";

function createEmailMockRedis() {
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
    _kvStore: kvStore,
    _zsets: zsets,
    ping: async () => "PONG",
    on: () => client,
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

      // 1. Atomic email identifier / account cooldown & sliding-window rate limit
      if (
        script.includes("ACCOUNT_LIMIT") &&
        keys.length === 3 &&
        argv.length >= 6
      ) {
        const cooldownKey = keys[0];
        const primaryZKey = keys[1];
        const secondaryZKey = keys[2];
        const now = Number(argv[0]);
        const windowMs = Number(argv[1]);
        const maxPrimary = Number(argv[2]);
        const maxSecondary = Number(argv[3]);
        const cooldownSec = Number(argv[4]);
        const memberId = String(argv[5]);
        const windowStart = now - windowMs;
        const windowSec = Math.ceil(windowMs / 1000);

        const cItem = kvStore.get(cooldownKey);
        if (cItem && (!cItem.expiresAt || cItem.expiresAt > now)) {
          const ttlSec = cItem.expiresAt ? Math.ceil((cItem.expiresAt - now) / 1000) : cooldownSec;
          return [0, ttlSec, "COOLDOWN"];
        }

        const pruneZ = (zKey: string) => {
          const z = zsets.get(zKey);
          if (!z) return 0;
          for (const [m, score] of z.members.entries()) {
            if (score <= windowStart) z.members.delete(m);
          }
          return z.members.size;
        };

        const computeRetry = (zKey: string) => {
          const z = zsets.get(zKey);
          if (!z || z.members.size === 0) return windowSec;
          const oldest = Math.min(...Array.from(z.members.values()));
          return Math.max(1, Math.ceil((oldest + windowMs - now) / 1000));
        };

        if (pruneZ(primaryZKey) >= maxPrimary) {
          return [0, computeRetry(primaryZKey), "ACCOUNT_LIMIT"];
        }
        if (pruneZ(secondaryZKey) >= maxSecondary) {
          return [0, computeRetry(secondaryZKey), "IP_LIMIT"];
        }

        if (cooldownSec > 0) {
          kvStore.set(cooldownKey, { value: "1", expiresAt: now + cooldownSec * 1000 });
        }

        const pushZ = (zKey: string) => {
          let z = zsets.get(zKey);
          if (!z) {
            z = { members: new Map() };
            zsets.set(zKey, z);
          }
          z.members.set(memberId, now);
          z.expiresAt = now + windowSec * 1000;
        };
        pushZ(primaryZKey);
        pushZ(secondaryZKey);
        return [1, 0, "OK"];
      }

      // 2. VERIFY_HASHED_EMAIL_OTP_ATOMIC_LUA
      if (script.includes("codeHash") && keys.length === 1 && argv.length >= 5) {
        const otpKey = keys[0];
        const candidateHash = String(argv[0]);
        const now = Number(argv[1]);
        const maxAttempts = Number(argv[2]);
        const expectedPurpose = String(argv[3]);
        const expectedEmailHash = String(argv[4]);

        const item = kvStore.get(otpKey);
        if (!item) {
          return [0, "NOT_FOUND", "کد تایید یافت نشد یا منقضی شده است."];
        }

        let record: any;
        try {
          record = JSON.parse(item.value);
        } catch {
          kvStore.delete(otpKey);
          return [0, "NOT_FOUND", "کد تایید یافت نشد یا منقضی شده است."];
        }

        if (record.expiresAt && now > Number(record.expiresAt)) {
          kvStore.delete(otpKey);
          return [0, "EXPIRED", "کد تایید منقضی شده است."];
        }

        record.attempts = Number(record.attempts || 0) + 1;
        if (record.attempts > maxAttempts) {
          kvStore.delete(otpKey);
          return [0, "TOO_MANY_ATTEMPTS", "تعداد دفعات تلاش اشتباه بیش از حد مجاز است. کد تایید باطل گردید."];
        }

        if (
          String(record.purpose || "") !== expectedPurpose ||
          String(record.emailHash || "") !== expectedEmailHash ||
          String(record.codeHash || "") !== candidateHash
        ) {
          const remaining = maxAttempts - record.attempts;
          if (remaining <= 0) {
            kvStore.delete(otpKey);
            return [0, "TOO_MANY_ATTEMPTS", "تعداد دفعات تلاش اشتباه بیش از حد مجاز است. کد تایید باطل گردید."];
          }
          kvStore.set(otpKey, { value: JSON.stringify(record), expiresAt: item.expiresAt });
          return [0, "INVALID", `کد تایید وارد شده نادرست است. (${remaining} تلاش باقی‌مانده)`];
        }

        kvStore.delete(otpKey);
        return [1, "OK", ""];
      }

      // 3. CONSUME_RECOVERY_TOKEN_ATOMIC_LUA
      if (script.includes("emailHash") && keys.length === 1 && argv.length === 2) {
        const tokenKey = keys[0];
        const expectedUserId = String(argv[0]);
        const expectedEmailHash = String(argv[1]);
        const item = kvStore.get(tokenKey);
        if (!item) {
          return [0, "NOT_FOUND", "توکن بازیابی نامعتبر، منقضی یا قبلاً استفاده شده است."];
        }
        let record: any;
        try {
          record = JSON.parse(item.value);
        } catch {
          kvStore.delete(tokenKey);
          return [0, "INVALID", "ساختار توکن بازیابی نامعتبر است."];
        }
        if (String(record.userId || "") !== expectedUserId || String(record.emailHash || "") !== expectedEmailHash) {
          return [0, "MISMATCH", "توکن بازیابی با حساب کاربری یا ایمیل مطابقت ندارد."];
        }
        kvStore.delete(tokenKey);
        return [1, "OK", ""];
      }

      // 4. CHECK_VERIFY_RATE_LUA
      if (script.includes("CHECK_VERIFY_RATE_LUA") || (keys.length === 1 && argv.length === 3)) {
        const verifyKey = keys[0];
        const now = Number(argv[0] || Date.now());
        const windowMs = Number(argv[1] || 900000);
        const maxAttempts = Number(argv[2] || 20);
        const windowStart = now - windowMs;
        const z = zsets.get(verifyKey);
        if (z) {
          for (const [m, score] of z.members.entries()) {
            if (score <= windowStart) z.members.delete(m);
          }
          if (z.members.size >= maxAttempts) {
            return [0, Math.ceil(windowMs / 1000)];
          }
        }
        return [1, 0];
      }

      // 5. RECORD_FAILED_VERIFY_LUA & CHECK_AND_RECORD_TEST_EMAIL_RATE_LUA
      if (keys.length === 1 && argv.length === 4) {
        const zKey = keys[0];
        const now = Number(argv[0] || Date.now());
        const windowMs = Number(argv[1] || 900000);
        const maxCount = Number(argv[2] || 20);
        const memberId = String(argv[3] || "");
        const windowStart = now - windowMs;
        const windowSec = Math.ceil(windowMs / 1000);
        let z = zsets.get(zKey);
        if (z) {
          for (const [m, score] of z.members.entries()) {
            if (score <= windowStart) z.members.delete(m);
          }
        }

        if (script.includes("ZCARD(KEYS[1])\nif count >= maxReq") || zKey.includes("rate:email_test:")) {
          const count = z ? z.members.size : 0;
          if (count >= maxCount) {
            return [0, windowSec];
          }
          if (!z) {
            z = { members: new Map() };
            zsets.set(zKey, z);
          }
          z.members.set(memberId, now);
          z.expiresAt = now + windowSec * 1000;
          return [1, 0];
        }

        if (!z) {
          z = { members: new Map() };
          zsets.set(zKey, z);
        }
        z.members.set(memberId, now);
        z.expiresAt = now + windowSec * 1000;
        const count = z.members.size;
        return [count, count >= maxCount ? 1 : 0];
      }

      return null;
    }
  };
  return client;
}

function createInMemoryUsersDb(initialUsers: any[]) {
  const users = initialUsers.map((u) => ({ ...u }));

  const execute = async (sql: string, values: any[] = []) => {
    const clean = sql.trim();

    if (/SELECT\s+.*FROM\s+app_users/i.test(clean)) {
      if (/WHERE\s*\(?\s*(?:LOWER\()?email\)?\s*=\s*(?:LOWER\()?\?\)?\s*OR\s*(?:LOWER\()?username\)?\s*=\s*(?:LOWER\()?\?\)?\s*OR\s*phoneNumber\s*=\s*\?/i.test(clean)) {
        const e = String(values[0] || "").trim().toLowerCase();
        const u = String(values[1] || "").trim().toLowerCase();
        const p = String(values[2] || "").trim().toLowerCase();
        return [
          users.filter(
            (x) =>
              (x.email && x.email.toLowerCase() === e) ||
              (x.username && x.username.toLowerCase() === u) ||
              (x.phoneNumber && x.phoneNumber.toLowerCase() === p)
          ),
          []
        ];
      }
      if (/WHERE\s+id\s*=\s*\?/i.test(clean)) {
        return [users.filter((x) => x.id === values[0]), []];
      }
      if (/WHERE\s+username\s*=\s*\?\s*OR\s*phoneNumber\s*=\s*\?/i.test(clean)) {
        const u = String(values[0] || "").trim().toLowerCase();
        const p = String(values[1] || "").trim().toLowerCase();
        return [
          users.filter(
            (x) =>
              (x.username && x.username.toLowerCase() === u) ||
              (x.phoneNumber && x.phoneNumber.toLowerCase() === p)
          ),
          []
        ];
      }
      if (/WHERE\s+(?:LOWER\()?email\)?\s*=\s*(?:LOWER\()?\?\)?\s*AND\s*id\s*(?:!=|<>)\s*\?/i.test(clean)) {
        const e = String(values[0] || "").trim().toLowerCase();
        const ex = String(values[1] || "");
        return [users.filter((x) => x.email && x.email.toLowerCase() === e && x.id !== ex), []];
      }
      if (/WHERE\s*\(?\s*username\s*=\s*\?\s*OR\s*phoneNumber\s*=\s*\?\s*\)?\s*AND\s*id\s*(?:!=|<>)\s*\?/i.test(clean)) {
        const u = String(values[0] || "").trim().toLowerCase();
        const p = String(values[1] || "").trim().toLowerCase();
        const ex = String(values[2] || "");
        return [
          users.filter(
            (x) => ((x.username && x.username.toLowerCase() === u) || (x.phoneNumber && x.phoneNumber.toLowerCase() === p)) && x.id !== ex
          ),
          []
        ];
      }
      if (/WHERE\s+username\s*=\s*\?\s*OR\s*phoneNumber\s*=\s*\?\s*OR\s*agentCode\s*=\s*\?/i.test(clean)) {
        const u = String(values[0] || "").trim().toLowerCase();
        const p = String(values[1] || "").trim().toLowerCase();
        const a = String(values[2] || "").trim().toLowerCase();
        return [
          users.filter(
            (x) =>
              (x.username && x.username.toLowerCase() === u) ||
              (x.phoneNumber && x.phoneNumber.toLowerCase() === p) ||
              (x.agentCode && String(x.agentCode).toLowerCase() === a)
          ),
          []
        ];
      }
      if (/WHERE\s+username\s*=\s*\?/i.test(clean)) {
        const u = String(values[0] || "").trim().toLowerCase();
        return [users.filter((x) => x.username && x.username.toLowerCase() === u), []];
      }
      return [users, []];
    }

    if (/UPDATE\s+app_users\s+SET/i.test(clean)) {
      if (/tokenVersion\s*=\s*COALESCE\(\s*tokenVersion\s*,\s*0\s*\)\s*\+\s*1\s+WHERE\s+id\s*=\s*\?/i.test(clean)) {
        const usr = users.find((x) => x.id === values[0]);
        if (usr) usr.tokenVersion = (Number(usr.tokenVersion) || 0) + 1;
        return [{ affectedRows: usr ? 1 : 0 }, []];
      }
      if (/SET\s+emailVerified\s*=\s*1\s*,\s*emailVerifiedAt\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/i.test(clean)) {
        const usr = users.find((x) => x.id === values[1]);
        if (usr) {
          usr.emailVerified = 1;
          usr.emailVerifiedAt = values[0];
        }
        return [{ affectedRows: usr ? 1 : 0 }, []];
      }
      if (/SET\s+password\s*=\s*\?\s*,\s*mustChangePassword\s*=\s*0\s+WHERE\s+id\s*=\s*\?/i.test(clean)) {
        const usr = users.find((x) => x.id === values[1]);
        if (usr) {
          usr.password = values[0];
          usr.mustChangePassword = 0;
        }
        return [{ affectedRows: usr ? 1 : 0 }, []];
      }
      // Generic dynamic SET col1 = ?, col2 = ? WHERE id = ?
      const setPartMatch = clean.match(/UPDATE\s+app_users\s+SET\s+([\s\S]+?)\s+WHERE\s+id\s*=\s*\?/i);
      if (setPartMatch) {
        const assignments = setPartMatch[1].split(",").map((s) => s.trim());
        const targetId = values[values.length - 1];
        const usr = users.find((x) => x.id === targetId);
        if (usr) {
          let vIdx = 0;
          for (const item of assignments) {
            const [colRaw, rhsRaw] = item.split("=").map((s) => s.trim());
            const col = colRaw.replace(/[`"]/g, "");
            if (rhsRaw === "?") {
              usr[col] = values[vIdx++];
            } else if (/COALESCE\(\s*tokenVersion\s*,\s*0\s*\)\s*\+\s*1/i.test(rhsRaw)) {
              usr.tokenVersion = (Number(usr.tokenVersion) || 0) + 1;
            }
          }
        }
        return [{ affectedRows: usr ? 1 : 0 }, []];
      }
    }

    if (/SELECT\s+.*FROM\s+orders/i.test(clean)) {
      return [[], []];
    }

    return [[], []];
  };

  const pool: any = {
    query: execute,
    getConnection: async () => ({
      query: execute,
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    })
  };

  return { pool, users };
}

describe("Email OTP & Recovery Security + End-to-End API Hardening", () => {
  let tmpDir: string;
  const VALID_KEY = "b8e3d1a2c4f50987654321fedcba0123456789abcdef0123456789abcdef0123";

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sales-email-otp-e2e-"));
  });

  after(() => {
    resetEmailModuleForTesting();
    resetOtpRateLimitsForTesting();
    setRedisClientForTesting(null);
    resetRedisStateForTesting();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetEmailModuleForTesting();
    resetOtpRateLimitsForTesting();
    setEmailSettingsFilePathForTesting(path.join(tmpDir, `cfg-${Date.now()}-${Math.random().toString(36).slice(2)}.json`));
    setEmailEncryptionKeyForTesting(VALID_KEY);
    setDnsLookupOverrideForTesting(async () => [{ address: "93.184.216.34", family: 4 }]);
    process.env.OTP_HMAC_SECRET = "test-otp-hmac-secret-32chars-minimum-ok!";
    setDbHealthyForTesting(true);
  });

  afterEach(() => {
    resetEmailModuleForTesting();
    resetOtpRateLimitsForTesting();
    setRedisClientForTesting(null);
    resetRedisStateForTesting();
  });

  describe("A. Redis-Backed Email OTP Core Security & Fail-Closed Guarantees", () => {
    it("should store only HMAC-SHA256 hash in Redis (never plaintext OTP), invalidate prior OTP on reissue, enforce purpose separation and atomic single-use", async () => {
      const mockRedis = createEmailMockRedis();
      setRedisClientForTesting(mockRedis);

      const first = await issueEmailOtp("u-1", "User@Example.COM", "PASSWORD_RESET");
      assert.equal(first.success, true);
      assert.match(first.code!, /^\d{6}$/);

      // Check raw Redis payload contains NO plaintext OTP code
      const rawRedisValue = await mockRedis.get(getRedisEmailOtpKey("PASSWORD_RESET", "u-1"));
      assert.ok(rawRedisValue);
      assert.equal(rawRedisValue.includes(first.code!), false);
      const parsed = JSON.parse(rawRedisValue);
      assert.ok(parsed.codeHash);
      assert.equal(parsed.codeHash.length, 64);

      // Re-issuing must immediately overwrite/invalidate the previous OTP
      const second = await issueEmailOtp("u-1", "user@example.com", "PASSWORD_RESET");
      assert.equal(second.success, true);
      if (second.code !== first.code) {
        const oldCheck = await verifyEmailOtp("u-1", "user@example.com", first.code!, "PASSWORD_RESET");
        assert.equal(oldCheck.success, false);
      }

      // Wrong purpose must fail even with the valid code
      const wrongPurpose = await verifyEmailOtp("u-1", "user@example.com", second.code!, "EMAIL_VERIFICATION");
      assert.equal(wrongPurpose.success, false);

      // Atomic concurrent verify race -> strictly ONE succeeds!
      const [r1, r2] = await Promise.all([
        verifyEmailOtp("u-1", "user@example.com", second.code!, "PASSWORD_RESET"),
        verifyEmailOtp("u-1", "user@example.com", second.code!, "PASSWORD_RESET")
      ]);
      const successes = [r1, r2].filter((r) => r.success).length;
      assert.equal(successes, 1);
    });

    it("should delete OTP after 5 failed attempts and reject expired OTPs", async () => {
      const mockRedis = createEmailMockRedis();
      setRedisClientForTesting(mockRedis);

      const issued = await issueEmailOtp("u-brute", "brute@example.com", "PASSWORD_RESET");
      assert.equal(issued.success, true);

      for (let i = 1; i <= 4; i++) {
        const fail = await verifyEmailOtp("u-brute", "brute@example.com", "000000", "PASSWORD_RESET");
        assert.equal(fail.success, false);
        assert.equal(fail.reason, "INVALID");
      }

      // 5th wrong attempt triggers TOO_MANY_ATTEMPTS and deletes OTP key
      const fifth = await verifyEmailOtp("u-brute", "brute@example.com", "000000", "PASSWORD_RESET");
      assert.equal(fifth.success, false);
      assert.equal(fifth.reason, "TOO_MANY_ATTEMPTS");
      assert.equal(await mockRedis.get(getRedisEmailOtpKey("PASSWORD_RESET", "u-brute")), null);

      // Expired OTP must be rejected and purged
      const expIssue = await issueEmailOtp("u-exp", "exp@example.com", "PASSWORD_RESET");
      assert.equal(expIssue.success, true);
      const key = getRedisEmailOtpKey("PASSWORD_RESET", "u-exp");
      const rec = JSON.parse((await mockRedis.get(key))!);
      rec.expiresAt = Date.now() - 1000;
      await mockRedis.set(key, JSON.stringify(rec), "EX", 60);

      const expRes = await verifyEmailOtp("u-exp", "exp@example.com", expIssue.code!, "PASSWORD_RESET");
      assert.equal(expRes.success, false);
      assert.equal(expRes.reason, "EXPIRED");
      assert.equal(await mockRedis.get(key), null);
    });

    it("should strictly fail closed (zero in-memory fallback) when Redis is null or throws errors", async () => {
      // 1. Null Redis
      setRedisClientForTesting(null);
      const idRate = await checkAndRecordEmailIdentifierRateLimit({
        identifier: "user@example.com",
        ip: "1.2.3.4",
        purpose: "PASSWORD_RESET"
      });
      assert.equal(idRate.allowed, false);
      assert.equal(idRate.isServiceUnavailable, true);

      const acctRate = await checkAndRecordEmailAccountRateLimit({
        userId: "u-1",
        email: "user@example.com",
        purpose: "PASSWORD_RESET"
      });
      assert.equal(acctRate.allowed, false);
      assert.equal(acctRate.isServiceUnavailable, true);

      const ipCheck = await checkEmailVerificationRateLimit("1.2.3.4");
      assert.equal(ipCheck.allowed, false);
      assert.equal(ipCheck.isServiceUnavailable, true);

      const recFail = await recordEmailFailedVerification("1.2.3.4");
      assert.equal(recFail.recorded, false);
      assert.equal(recFail.isServiceUnavailable, true);

      const issueFail = await issueEmailOtp("u-1", "user@example.com", "PASSWORD_RESET");
      assert.equal(issueFail.success, false);
      assert.equal(issueFail.isServiceUnavailable, true);

      const verifyFail = await verifyEmailOtp("u-1", "user@example.com", "123456", "PASSWORD_RESET");
      assert.equal(verifyFail.success, false);
      assert.equal(verifyFail.reason, "REDIS_UNAVAILABLE");

      const recTokFail = await issueRecoveryToken({ id: "u-1", username: "u", role: "USER" }, "user@example.com");
      assert.equal(recTokFail.success, false);
      assert.equal(recTokFail.isServiceUnavailable, true);

      const consumeFail = await consumeRecoveryToken("jti-1", "u-1", "user@example.com");
      assert.equal(consumeFail.valid, false);
      assert.equal(consumeFail.isServiceUnavailable, true);

      // 2. Broken Redis wrapper returning null from set/eval
      setRedisClientForTesting({
        get: async () => null,
        set: async () => null,
        eval: async () => null,
        del: async () => 0
      });
      const brokenIssue = await issueEmailOtp("u-1", "user@example.com", "PASSWORD_RESET");
      assert.equal(brokenIssue.success, false);
      assert.equal(brokenIssue.isServiceUnavailable, true);

      const brokenVerify = await verifyEmailOtp("u-1", "user@example.com", "123456", "PASSWORD_RESET");
      assert.equal(brokenVerify.success, false);
      assert.equal(brokenVerify.reason, "REDIS_UNAVAILABLE");
    });

    it("should verify Email OTP across simulated instances sharing only Redis", async () => {
      const sharedRedis = createEmailMockRedis();
      // Instance A issues OTP into shared Redis
      setRedisClientForTesting(sharedRedis);
      const issued = await issueEmailOtp("u-multi", "multi@example.com", "PASSWORD_RESET");
      assert.equal(issued.success, true);

      // Simulate Instance B resetting local memory while connecting to same shared Redis
      resetEmailOtpStateForTesting();
      setRedisClientForTesting(sharedRedis);

      const verified = await verifyEmailOtp("u-multi", "multi@example.com", issued.code!, "PASSWORD_RESET");
      assert.equal(verified.success, true);
    });
  });

  describe("B. Express API E2E Security: Admin Email Config & Email OTP Password Recovery", () => {
    let server: http.Server;
    let baseUrl: string;
    let mockRedis: any;
    let sentEmails: Array<{ to: string; subject: string; html: string; text?: string }>;
    let shouldMailFail: boolean;
    let dbUsers: any[];

    beforeEach(async () => {
      mockRedis = createEmailMockRedis();
      setRedisClientForTesting(mockRedis);
      setEmailOtpCooldownSecondsForTesting(0);

      sentEmails = [];
      shouldMailFail = false;
      setEmailSendOverrideForTesting(async ({ to, subject, html, text }) => {
        if (shouldMailFail) {
          return { success: false, error: "Simulated SMTP failure", logs: ["SMTP connection failed"] };
        }
        sentEmails.push({ to, subject, html, text });
        return { success: true, messageId: "mock-msg-id", logs: ["Sent via test override"] };
      });

      const passHash = hashPasswordSync("InitialPass!2026");
      const mockDb = createInMemoryUsersDb([
        {
          id: "admin-1",
          username: "sysadmin",
          fullName: "مدیر سیستم",
          phoneNumber: "09120000001",
          role: "SYSTEM_ADMIN",
          email: "admin@company.com",
          emailVerified: 1,
          isEnabled: 1,
          password: passHash,
          mustChangePassword: 0,
          tokenVersion: 0
        },
        {
          id: "rep-verified",
          username: "rep_verified",
          fullName: "نماینده تاییدشده",
          phoneNumber: "09120000002",
          role: "REPRESENTATIVE",
          agentCode: "AG-2",
          email: "rep.verified@example.com",
          emailVerified: 1,
          isEnabled: 1,
          password: passHash,
          mustChangePassword: 0,
          tokenVersion: 3
        },
        {
          id: "rep-unverified",
          username: "rep_unverified",
          fullName: "نماینده تاییدنشده",
          phoneNumber: "09120000003",
          role: "REPRESENTATIVE",
          agentCode: "AG-3",
          email: "rep.unverified@example.com",
          emailVerified: 0,
          isEnabled: 1,
          password: passHash,
          mustChangePassword: 0,
          tokenVersion: 0
        },
        {
          id: "rep-disabled",
          username: "rep_disabled",
          fullName: "کاربر غیرفعال",
          phoneNumber: "09120000004",
          role: "REPRESENTATIVE",
          email: "rep.disabled@example.com",
          emailVerified: 1,
          isEnabled: 0,
          password: passHash,
          mustChangePassword: 0,
          tokenVersion: 0
        }
      ]);
      dbUsers = mockDb.users;
      setDbPoolForTesting(mockDb.pool);
      setAuthDbPoolOverrideForTesting(mockDb.pool);

      saveEmailSettings({
        providerType: "SMTP",
        isEnabled: true,
        allowPasswordReset: true,
        senderName: "Sales Test",
        senderEmail: "noreply@company.com",
        smtpHost: "smtp.example.com",
        smtpPort: 587,
        smtpUser: "mailer",
        smtpPassword: "SavedSmtpPassword#99"
      });

      const app = await createExpressApp();
      server = http.createServer(app);
      await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
      const addr = server.address() as net.AddressInfo;
      baseUrl = `http://127.0.0.1:${addr.port}`;
    });

    afterEach(async () => {
      if (server) {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
      setAuthDbPoolOverrideForTesting(null);
    });

    async function apiCall(route: string, options: RequestInit & { token?: string } = {}) {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>)
      };
      if (options.token) {
        headers["Authorization"] = `Bearer ${options.token}`;
      }
      const res = await fetch(`${baseUrl}${route}`, { ...options, headers });
      const data = await res.json().catch(() => ({}));
      return { status: res.status, data };
    }

    it("enforces admin RBAC, rejects insecure settings/SSRF, prevents test credential exfiltration, and rate-limits /test", async () => {
      const adminToken = generateToken({
        id: "admin-1",
        username: "sysadmin",
        role: "SYSTEM_ADMIN",
        tokenVersion: 0
      });
      const repToken = generateToken({
        id: "rep-verified",
        username: "rep_verified",
        role: "REPRESENTATIVE",
        tokenVersion: 3
      });

      // Unauthenticated -> 401
      const unauthGet = await apiCall("/api/system/email-settings");
      assert.equal(unauthGet.status, 401);

      // Representative -> 403
      const repGet = await apiCall("/api/system/email-settings", { token: repToken });
      assert.equal(repGet.status, 403);
      const repPut = await apiCall("/api/system/email-settings", {
        method: "PUT",
        token: repToken,
        body: JSON.stringify({ isEnabled: false })
      });
      assert.equal(repPut.status, 403);

      // Admin GET returns masked flags without plaintext secret
      const adminGet = await apiCall("/api/system/email-settings", { token: adminToken });
      assert.equal(adminGet.status, 200);
      assert.equal(adminGet.data.settings.passwordConfigured, true);
      assert.equal(adminGet.data.settings.smtpPassword, undefined);

      // Reject HTTP webhook, private SSRF webhook, and forbidden Authorization custom header
      const httpWebhook = await apiCall("/api/system/email-settings", {
        method: "PUT",
        token: adminToken,
        body: JSON.stringify({
          providerType: "WEBHOOK_API",
          isEnabled: true,
          apiUrl: "http://api.resend.com/emails"
        })
      });
      assert.equal(httpWebhook.status, 400);

      const ssrfWebhook = await apiCall("/api/system/email-settings", {
        method: "PUT",
        token: adminToken,
        body: JSON.stringify({
          providerType: "WEBHOOK_API",
          isEnabled: true,
          apiUrl: "https://169.254.169.254/latest/meta-data"
        })
      });
      assert.equal(ssrfWebhook.status, 400);

      const forbiddenHeader = await apiCall("/api/system/email-settings", {
        method: "PUT",
        token: adminToken,
        body: JSON.stringify({
          providerType: "WEBHOOK_API",
          apiUrl: "https://api.resend.com/emails",
          customHeaders: "Authorization: Bearer leak"
        })
      });
      assert.equal(forbiddenHeader.status, 400);

      // Prevent credential exfiltration on /test if admin changes smtpHost without supplying new password
      const exfilRes = await apiCall("/api/system/email-settings/test", {
        method: "POST",
        token: adminToken,
        body: JSON.stringify({
          recipient: "admin@company.com",
          settings: {
            providerType: "SMTP",
            smtpHost: "attacker.example.com",
            smtpPort: 587,
            smtpUser: "mailer"
          }
        })
      });
      assert.equal(exfilRes.status, 400);

      // Rate limit on /test (max 5 requests / 60s; exfilRes above was request #1)
      for (let i = 0; i < 4; i++) {
        const okTest = await apiCall("/api/system/email-settings/test", {
          method: "POST",
          token: adminToken,
          body: JSON.stringify({ recipient: "admin@company.com" })
        });
        assert.equal(okTest.status, 200);
        assert.equal(okTest.data.logs.join("\n").includes("SavedSmtpPassword#99"), false);
      }
      const blockedTest = await apiCall("/api/system/email-settings/test", {
        method: "POST",
        token: adminToken,
        body: JSON.stringify({ recipient: "admin@company.com" })
      });
      assert.equal(blockedTest.status, 429);
    });

    it("prevents account enumeration, hides OTP/email from responses, rolls back on send error, and checks feature toggle", async () => {
      // Recovery options reflects enabled state
      const optOn = await apiCall("/api/auth/recovery-options");
      assert.equal(optOn.status, 200);
      assert.equal(optOn.data.emailEnabled, true);

      // Verified user request vs non-existent vs unverified vs disabled MUST return identical 200 body
      const verifiedSend = await apiCall("/api/auth/forgot-password-email-send", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep_verified" })
      });
      assert.equal(verifiedSend.status, 200);
      assert.equal(verifiedSend.data.devOtp, undefined);
      assert.equal(verifiedSend.data.maskedEmail, undefined);
      assert.equal(sentEmails.length, 1);
      assert.equal(sentEmails[0].to, "rep.verified@example.com");

      for (const ident of ["no_such_user", "rep_unverified", "rep_disabled"]) {
        const res = await apiCall("/api/auth/forgot-password-email-send", {
          method: "POST",
          body: JSON.stringify({ identifier: ident })
        });
        assert.equal(res.status, 200);
        assert.deepEqual(res.data, verifiedSend.data);
      }
      // Still ONLY 1 email ever sent!
      assert.equal(sentEmails.length, 1);

      // Unverified user must fail verify uniformly
      const verifyUnverified = await apiCall("/api/auth/forgot-password-email-verify", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep_unverified", code: "123456" })
      });
      assert.equal(verifyUnverified.status, 400);

      // Send failure must roll back OTP key cleanly and return 502
      shouldMailFail = true;
      const failSend = await apiCall("/api/auth/forgot-password-email-send", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep.verified@example.com" })
      });
      assert.equal(failSend.status, 502);
      assert.equal(await mockRedis.get(getRedisEmailOtpKey("PASSWORD_RESET", "rep-verified")), null);

      // Disabled allowPasswordReset -> 403 across endpoints
      saveEmailSettings({ isEnabled: true, allowPasswordReset: false });
      const optOff = await apiCall("/api/auth/recovery-options");
      assert.equal(optOff.data.emailEnabled, false);

      const disabledSend = await apiCall("/api/auth/forgot-password-email-send", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep_verified" })
      });
      assert.equal(disabledSend.status, 403);
    });

    it("completes full Email OTP recovery, isolates recoveryToken from ACCESS routes, revokes prior JWTs via tokenVersion, and fails closed if Redis drops", async () => {
      const existingAccessToken = generateToken({
        id: "rep-verified",
        username: "rep_verified",
        role: "REPRESENTATIVE",
        tokenVersion: 3
      });

      // Confirm old access token works before reset
      const meBefore = await apiCall("/api/auth/me", { token: existingAccessToken });
      assert.equal(meBefore.status, 200);

      // Step 1: Send Email OTP
      const sendRes = await apiCall("/api/auth/forgot-password-email-send", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep_verified" })
      });
      assert.equal(sendRes.status, 200);
      assert.equal(sentEmails.length, 1);
      const codeMatch = sentEmails[0].text?.match(/\b(\d{6})\b/);
      assert.ok(codeMatch, "Expected 6-digit code in dispatched recovery email");
      const otpCode = codeMatch[1];

      // Step 2: Verify Email OTP -> receives scoped single-use recoveryToken
      const verifyRes = await apiCall("/api/auth/forgot-password-email-verify", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep_verified", code: otpCode })
      });
      assert.equal(verifyRes.status, 200);
      assert.ok(verifyRes.data.recoveryToken);
      const recoveryToken = verifyRes.data.recoveryToken;

      // Critical security guarantee: recoveryToken CANNOT access normal API endpoints!
      const meWithRecovery = await apiCall("/api/auth/me", { token: recoveryToken });
      assert.equal(meWithRecovery.status, 401);
      const ordersWithRecovery = await apiCall("/api/orders", { token: recoveryToken });
      assert.equal(ordersWithRecovery.status, 401);

      // Step 3: Reset password with recoveryToken
      const resetRes = await apiCall("/api/auth/forgot-password-email-reset", {
        method: "POST",
        body: JSON.stringify({ recoveryToken, newPassword: "BrandNewStrongPass!99" })
      });
      assert.equal(resetRes.status, 200);
      assert.equal(dbUsers.find((u) => u.id === "rep-verified")?.tokenVersion, 4);

      // Replaying recoveryToken must fail with 400
      const replayRes = await apiCall("/api/auth/forgot-password-email-reset", {
        method: "POST",
        body: JSON.stringify({ recoveryToken, newPassword: "AnotherPassword!99" })
      });
      assert.equal(replayRes.status, 400);

      // Old session JWT must be rejected immediately (401)
      const meAfterReset = await apiCall("/api/auth/me", { token: existingAccessToken });
      assert.equal(meAfterReset.status, 401);

      // Login with new password succeeds
      const loginNew = await apiCall("/api/auth/login-password", {
        method: "POST",
        body: JSON.stringify({ loginKey: "rep_verified", password: "BrandNewStrongPass!99" })
      });
      assert.equal(loginNew.status, 200);

      // Redis outage during recovery endpoints must fail closed with 503
      setRedisClientForTesting(null);
      const outageSend = await apiCall("/api/auth/forgot-password-email-send", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep_verified" })
      });
      assert.equal(outageSend.status, 503);

      const outageVerify = await apiCall("/api/auth/forgot-password-email-verify", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep_verified", code: "123456" })
      });
      assert.equal(outageVerify.status, 503);

      const outageReset = await apiCall("/api/auth/forgot-password-email-reset", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep_verified", code: "123456", newPassword: "NewPassword!234" })
      });
      assert.equal(outageReset.status, 503);
    });

    it("resets emailVerified when email changes and completes self-service email verification", async () => {
      const adminToken = generateToken({
        id: "admin-1",
        username: "sysadmin",
        role: "SYSTEM_ADMIN",
        tokenVersion: 0
      });
      const unverifiedToken = generateToken({
        id: "rep-unverified",
        username: "rep_unverified",
        role: "REPRESENTATIVE",
        tokenVersion: 0
      });

      // Verified user gets email changed by admin -> emailVerified must drop to false
      const updateUser = await apiCall("/api/users/rep-verified", {
        method: "PUT",
        token: adminToken,
        body: JSON.stringify({ email: "changed.email@example.com" })
      });
      assert.equal(updateUser.status, 200);
      assert.equal(dbUsers.find((u) => u.id === "rep-verified")?.emailVerified, 0);

      // Unverified user completes self-service verification
      const sendVerif = await apiCall("/api/auth/email-verification/send", {
        method: "POST",
        token: unverifiedToken,
        body: JSON.stringify({})
      });
      assert.equal(sendVerif.status, 200);
      assert.equal(sentEmails.length, 1);
      const match = sentEmails[0].text?.match(/\b(\d{6})\b/);
      assert.ok(match);

      const confirmVerif = await apiCall("/api/auth/email-verification/verify", {
        method: "POST",
        token: unverifiedToken,
        body: JSON.stringify({ code: match[1] })
      });
      assert.equal(confirmVerif.status, 200);
      assert.equal(confirmVerif.data.emailVerified, true);
      assert.equal(dbUsers.find((u) => u.id === "rep-unverified")?.emailVerified, 1);

      // Now rep-unverified IS eligible for Email OTP password reset!
      const recoverySend = await apiCall("/api/auth/forgot-password-email-send", {
        method: "POST",
        body: JSON.stringify({ identifier: "rep_unverified" })
      });
      assert.equal(recoverySend.status, 200);
      assert.equal(sentEmails.length, 2);
      assert.equal(sentEmails[1].to, "rep.unverified@example.com");
    });
  });
});
