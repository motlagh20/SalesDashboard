import crypto from "crypto";
import { getRedisClient } from "./database";

export interface OtpRecord {
  phone: string;
  code: string;
  purpose: "LOGIN" | "PASSWORD_RESET";
  createdAt: number;
  expiresAt: number;
  attempts: number;
}

// Configurable expiry window (default: 180 seconds / 3 minutes)
export function getOtpExpirySeconds(): number {
  return parseInt(process.env.OTP_EXPIRY_SECONDS || "180", 10);
}
export const OTP_EXPIRY_SECONDS = getOtpExpirySeconds();

// Maximum verification attempts allowed before code is invalidated
export const MAX_OTP_ATTEMPTS = 5;

// Cooldown between successive OTP requests for same phone (default: 60 seconds)
let testCooldownOverride: number | null = null;
export function getOtpCooldownSeconds(): number {
  if (testCooldownOverride !== null) return testCooldownOverride;
  return parseInt(process.env.OTP_COOLDOWN_SECONDS || "60", 10);
}

export function setOtpCooldownSecondsForTesting(seconds: number | null): void {
  testCooldownOverride = seconds;
}

// Maximum requests per phone within window (default: 5 requests per 15 minutes)
export const OTP_PHONE_MAX_REQUESTS = 5;
// Maximum requests per IP address within window (default: 10 requests per 15 minutes)
export const OTP_IP_MAX_REQUESTS = 10;
// Maximum failed verification attempts per IP within window (default: 20 per 15 minutes)
export const VERIFY_IP_MAX_ATTEMPTS = 20;
// Rate limit sliding window (15 minutes = 900 seconds)
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;

// Configurable OTP length (default: 6 digits for enterprise security)
export function getOtpLength(): number {
  return parseInt(process.env.OTP_LENGTH || "6", 10);
}
export const OTP_LENGTH = getOtpLength();

// In-memory store for active OTP codes: key is `${purpose}:${normalizedPhone}`
const otpStore = new Map<string, OtpRecord>();

// Concurrency lock set to prevent race conditions during verification
const verifyingKeys = new Set<string>();

// Rate-limiting in-memory buckets
const phoneLastSentAt = new Map<string, number>();
const phoneRequestTimestamps = new Map<string, number[]>();
const ipRequestTimestamps = new Map<string, number[]>();
const ipFailedVerificationTimestamps = new Map<string, number[]>();

// Periodic cleanup of expired OTP entries and rate limit buckets every 30 seconds
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  // 1. Clean expired OTP records
  for (const [key, record] of otpStore.entries()) {
    if (now > record.expiresAt) {
      otpStore.delete(key);
    }
  }

  // 2. Clean stale rate-limiting timestamps (> 15 minutes)
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of phoneRequestTimestamps.entries()) {
    const valid = timestamps.filter((t) => t > windowStart);
    if (valid.length === 0) {
      phoneRequestTimestamps.delete(key);
    } else {
      phoneRequestTimestamps.set(key, valid);
    }
  }

  for (const [key, timestamps] of ipRequestTimestamps.entries()) {
    const valid = timestamps.filter((t) => t > windowStart);
    if (valid.length === 0) {
      ipRequestTimestamps.delete(key);
    } else {
      ipRequestTimestamps.set(key, valid);
    }
  }

  for (const [key, timestamps] of ipFailedVerificationTimestamps.entries()) {
    const valid = timestamps.filter((t) => t > windowStart);
    if (valid.length === 0) {
      ipFailedVerificationTimestamps.delete(key);
    } else {
      ipFailedVerificationTimestamps.set(key, valid);
    }
  }
}, 30000);

if (cleanupInterval.unref) {
  cleanupInterval.unref();
}

/**
 * Extracts normalized client IP address from Express Request.
 * Uses Express's trusted `req.ip` evaluated according to the configured `trust proxy` topology.
 * Strictly avoids manually parsing raw unverified `X-Forwarded-For` headers to prevent IP spoofing attacks.
 * Falls back safely to socket remote address or 127.0.0.1 when req.ip is unavailable.
 */
export function getClientIp(req: any): string {
  if (!req) return "127.0.0.1";
  // 1. Prefer Express's trusted, proxy-evaluated client IP
  if (typeof req.ip === "string" && req.ip.trim()) {
    return req.ip.trim();
  }
  // 2. Fall back to direct socket remote address
  const socketAddress = req.socket?.remoteAddress;
  if (typeof socketAddress === "string" && socketAddress.trim()) {
    return socketAddress.trim();
  }
  return "127.0.0.1";
}

/**
 * Normalizes Persian/Arabic digits and formats phone numbers
 */
export function normalizePhoneNumber(rawPhone: string): string {
  if (!rawPhone) return "";
  let phone = String(rawPhone)
    .trim()
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1728))
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1584))
    .replace(/[\s\-\(\)]/g, "");

  if (phone.startsWith("+98")) {
    phone = "0" + phone.slice(3);
  } else if (phone.startsWith("0098")) {
    phone = "0" + phone.slice(4);
  } else if (phone.startsWith("98") && phone.length === 12) {
    phone = "0" + phone.slice(2);
  } else if (phone.length === 10 && phone.startsWith("9")) {
    phone = "0" + phone;
  }
  return phone;
}

/**
 * Masks a phone number for privacy-safe logging (e.g. 09120000001 -> 0912***0001)
 */
export function maskPhoneNumber(phone: string): string {
  if (!phone || phone.length < 7) return "***";
  return phone.slice(0, 4) + "***" + phone.slice(-4);
}

/**
 * Generates a cryptographically secure random numeric OTP
 */
export function generateSecureOtp(length: number = getOtpLength()): string {
  const len = Math.max(4, Math.min(8, length));
  const min = Math.pow(10, len - 1);
  const max = Math.pow(10, len);
  const num = crypto.randomInt(min, max);
  return num.toString();
}

export const REDIS_NAMESPACE = "salesdashboard:";

export function getRedisCooldownKey(purpose: string, phone: string): string {
  return `${REDIS_NAMESPACE}cooldown:${purpose}:${phone}`;
}

export function getRedisPhoneRateKey(phone: string): string {
  return `${REDIS_NAMESPACE}rate:otp:phone:${phone}`;
}

export function getRedisIpRateKey(ip: string): string {
  return `${REDIS_NAMESPACE}rate:otp:ip:${ip}`;
}

export function getRedisVerifyRateKey(ip: string): string {
  return `${REDIS_NAMESPACE}rate:verify:ip:${ip}`;
}

export function getRedisOtpKey(purpose: string, phone: string): string {
  return `${REDIS_NAMESPACE}otp:${purpose}:${phone}`;
}

const CHECK_OTP_RATE_LIMIT_LUA = `
local cooldownTtl = redis.call('TTL', KEYS[1])
if cooldownTtl > 0 then
  return { 0, cooldownTtl, 'COOLDOWN' }
end

local phoneCount = tonumber(redis.call('GET', KEYS[2]) or '0')
if phoneCount >= tonumber(ARGV[1]) then
  local phoneTtl = redis.call('TTL', KEYS[2])
  if phoneTtl < 0 then phoneTtl = 900 end
  return { 0, phoneTtl, 'PHONE_LIMIT' }
end

local ipCount = tonumber(redis.call('GET', KEYS[3]) or '0')
if ipCount >= tonumber(ARGV[2]) then
  local ipTtl = redis.call('TTL', KEYS[3])
  if ipTtl < 0 then ipTtl = 900 end
  return { 0, ipTtl, 'IP_LIMIT' }
end

return { 1, 0, 'OK' }
`;

const RECORD_OTP_REQUEST_LUA = `
if tonumber(ARGV[1]) > 0 then
  redis.call('SET', KEYS[1], '1', 'EX', tonumber(ARGV[1]))
end

local pCount = redis.call('INCR', KEYS[2])
if pCount == 1 then
  redis.call('EXPIRE', KEYS[2], tonumber(ARGV[2]))
else
  local pTtl = redis.call('TTL', KEYS[2])
  if pTtl < 0 then
    redis.call('EXPIRE', KEYS[2], tonumber(ARGV[2]))
  end
end

local iCount = redis.call('INCR', KEYS[3])
if iCount == 1 then
  redis.call('EXPIRE', KEYS[3], tonumber(ARGV[2]))
else
  local iTtl = redis.call('TTL', KEYS[3])
  if iTtl < 0 then
    redis.call('EXPIRE', KEYS[3], tonumber(ARGV[2]))
  end
end

return 1
`;

const CHECK_VERIFY_RATE_LUA = `
local count = tonumber(redis.call('GET', KEYS[1]) or '0')
if count >= tonumber(ARGV[1]) then
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then ttl = 900 end
  return { 0, ttl }
end
return { 1, 0 }
`;

const RECORD_FAILED_VERIFY_LUA = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
else
  local ttl = redis.call('TTL', KEYS[1])
  if ttl < 0 then
    redis.call('EXPIRE', KEYS[1], tonumber(ARGV[1]))
  end
end
return count
`;

export interface RateLimitResult {
  allowed: boolean;
  retryAfter?: number;
  error?: string;
}

export type RateLimitResultThenable = RateLimitResult & PromiseLike<RateLimitResult>;

/**
 * Checks rate limits and cooldowns before issuing a new OTP.
 * Evaluates:
 * 1. Resend cooldown per phone (default: 60s)
 * 2. Window limit per phone (default: max 5 requests / 15m)
 * 3. Window limit per IP (default: max 10 requests / 15m)
 * 
 * Supports both synchronous return and \`await\` for atomic Redis checks.
 */
export function checkOtpRateLimit(
  phone: string,
  ip: string,
  purpose: "LOGIN" | "PASSWORD_RESET"
): RateLimitResultThenable {
  const cleanPhone = normalizePhoneNumber(phone);
  const cleanIp = String(ip || "127.0.0.1").trim();
  const now = Date.now();
  const cooldownSeconds = getOtpCooldownSeconds();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  // 1. In-memory check (fast synchronous fallback & baseline)
  let syncResult: RateLimitResult = { allowed: true };
  const cooldownKey = `${purpose}:${cleanPhone}`;
  const lastSent = phoneLastSentAt.get(cooldownKey) || 0;
  const elapsedSeconds = (now - lastSent) / 1000;

  if (cooldownSeconds > 0 && elapsedSeconds < cooldownSeconds) {
    const retryAfter = Math.ceil(cooldownSeconds - elapsedSeconds);
    syncResult = {
      allowed: false,
      retryAfter,
      error: `لطفاً پیش از درخواست مجدد کد تایید، ${retryAfter} ثانیه صبر نمایید.`
    };
  } else {
    const phoneHistory = (phoneRequestTimestamps.get(cleanPhone) || []).filter((t) => t > windowStart);
    if (phoneHistory.length >= OTP_PHONE_MAX_REQUESTS) {
      const oldest = phoneHistory[0];
      const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
      syncResult = {
        allowed: false,
        retryAfter,
        error: "تعداد درخواست‌های کد تایید برای این شماره بیش از حد مجاز است. لطفاً پس از ۱۵ دقیقه مجدداً تلاش فرمایید."
      };
    } else {
      const ipHistory = (ipRequestTimestamps.get(cleanIp) || []).filter((t) => t > windowStart);
      if (ipHistory.length >= OTP_IP_MAX_REQUESTS) {
        const oldest = ipHistory[0];
        const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
        syncResult = {
          allowed: false,
          retryAfter,
          error: "تعداد درخواست‌های کد تایید از این آدرس شبکه بیش از حد مجاز است. لطفاً دقایقی دیگر تلاش فرمایید."
        };
      }
    }
  }

  // Thenable wrapper: performs atomic Redis Lua evaluation if Redis is connected
  return Object.assign(syncResult, {
    then<TResult1 = RateLimitResult, TResult2 = never>(
      onfulfilled?: ((value: RateLimitResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      const evaluateAsync = async (): Promise<RateLimitResult> => {
        try {
          const redis = getRedisClient();
          if (redis && typeof redis.eval === "function") {
            const redisCooldownKey = getRedisCooldownKey(purpose, cleanPhone);
            const redisPhoneRateKey = getRedisPhoneRateKey(cleanPhone);
            const redisIpRateKey = getRedisIpRateKey(cleanIp);

            const res = await redis.eval(
              CHECK_OTP_RATE_LIMIT_LUA,
              3,
              redisCooldownKey,
              redisPhoneRateKey,
              redisIpRateKey,
              OTP_PHONE_MAX_REQUESTS,
              OTP_IP_MAX_REQUESTS
            );

            if (Array.isArray(res)) {
              const allowed = Number(res[0]) === 1;
              const retryAfter = Number(res[1]) || 0;
              const reason = String(res[2]);

              if (!allowed) {
                if (reason === "COOLDOWN") {
                  return {
                    allowed: false,
                    retryAfter,
                    error: `لطفاً پیش از درخواست مجدد کد تایید، ${retryAfter} ثانیه صبر نمایید.`
                  };
                }
                if (reason === "PHONE_LIMIT") {
                  return {
                    allowed: false,
                    retryAfter,
                    error: "تعداد درخواست‌های کد تایید برای این شماره بیش از حد مجاز است. لطفاً پس از ۱۵ دقیقه مجدداً تلاش فرمایید."
                  };
                }
                if (reason === "IP_LIMIT") {
                  return {
                    allowed: false,
                    retryAfter,
                    error: "تعداد درخواست‌های کد تایید از این آدرس شبکه بیش از حد مجاز است. لطفاً دقایقی دیگر تلاش فرمایید."
                  };
                }
              }
              return { allowed: true };
            }
          }
        } catch {
          // Redis failure: safe fallback to in-memory check result
        }
        return syncResult;
      };

      return evaluateAsync().then(onfulfilled, onrejected);
    }
  });
}

/**
 * Records an OTP request timestamp against phone and IP buckets (atomic in Redis with fallback)
 */
export function recordOtpRequest(
  phone: string,
  ip: string,
  purpose: "LOGIN" | "PASSWORD_RESET"
): Promise<void> & { allowed?: boolean } {
  const cleanPhone = normalizePhoneNumber(phone);
  const cleanIp = String(ip || "127.0.0.1").trim();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const cooldownSec = getOtpCooldownSeconds();

  // 1. In-memory update
  const cooldownKey = `${purpose}:${cleanPhone}`;
  phoneLastSentAt.set(cooldownKey, now);

  const phoneHistory = (phoneRequestTimestamps.get(cleanPhone) || []).filter((t) => t > windowStart);
  phoneHistory.push(now);
  phoneRequestTimestamps.set(cleanPhone, phoneHistory);

  const ipHistory = (ipRequestTimestamps.get(cleanIp) || []).filter((t) => t > windowStart);
  ipHistory.push(now);
  ipRequestTimestamps.set(cleanIp, ipHistory);

  // 2. Atomic Redis update with Lua script
  const asyncUpdate = async (): Promise<void> => {
    try {
      const redis = getRedisClient();
      if (redis) {
        const redisCooldownKey = getRedisCooldownKey(purpose, cleanPhone);
        const redisPhoneRateKey = getRedisPhoneRateKey(cleanPhone);
        const redisIpRateKey = getRedisIpRateKey(cleanIp);
        const windowSec = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);

        if (typeof redis.eval === "function") {
          await redis.eval(
            RECORD_OTP_REQUEST_LUA,
            3,
            redisCooldownKey,
            redisPhoneRateKey,
            redisIpRateKey,
            cooldownSec,
            windowSec
          );
        } else {
          if (cooldownSec > 0) {
            await redis.set(redisCooldownKey, "1", "EX", cooldownSec);
          }
          await redis.incr(redisPhoneRateKey);
          await redis.expire(redisPhoneRateKey, windowSec);
          await redis.incr(redisIpRateKey);
          await redis.expire(redisIpRateKey, windowSec);
        }
      }
    } catch {}
  };

  const p = asyncUpdate();
  return Object.assign(p, { allowed: true });
}

/**
 * Checks verification attempt rate limits per client IP (prevents distributed brute-forcing)
 */
export function checkVerificationRateLimit(ip: string): RateLimitResultThenable {
  const cleanIp = String(ip || "127.0.0.1").trim();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  let syncResult: RateLimitResult = { allowed: true };
  const failedAttempts = (ipFailedVerificationTimestamps.get(cleanIp) || []).filter((t) => t > windowStart);
  if (failedAttempts.length >= VERIFY_IP_MAX_ATTEMPTS) {
    const oldest = failedAttempts[0];
    const retryAfter = Math.max(1, Math.ceil((oldest + RATE_LIMIT_WINDOW_MS - now) / 1000));
    syncResult = {
      allowed: false,
      retryAfter,
      error: "تعداد دفعات تلاش اشتباه بیش از حد مجاز است. لطفاً پس از ۱۵ دقیقه مجدداً تلاش فرمایید."
    };
  }

  return Object.assign(syncResult, {
    then<TResult1 = RateLimitResult, TResult2 = never>(
      onfulfilled?: ((value: RateLimitResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      const evaluateAsync = async (): Promise<RateLimitResult> => {
        try {
          const redis = getRedisClient();
          if (redis && typeof redis.eval === "function") {
            const redisVerifyKey = getRedisVerifyRateKey(cleanIp);
            const res = await redis.eval(CHECK_VERIFY_RATE_LUA, 1, redisVerifyKey, VERIFY_IP_MAX_ATTEMPTS);
            if (Array.isArray(res)) {
              const allowed = Number(res[0]) === 1;
              const retryAfter = Number(res[1]) || 0;
              if (!allowed) {
                return {
                  allowed: false,
                  retryAfter,
                  error: "تعداد دفعات تلاش اشتباه بیش از حد مجاز است. لطفاً پس از ۱۵ دقیقه مجدداً تلاش فرمایید."
                };
              }
              return { allowed: true };
            }
          }
        } catch {}
        return syncResult;
      };

      return evaluateAsync().then(onfulfilled, onrejected);
    }
  });
}

/**
 * Records a failed verification attempt against client IP (atomic in Redis with fallback)
 */
export function recordFailedVerification(ip: string): Promise<void> & { recorded?: boolean } {
  const cleanIp = String(ip || "127.0.0.1").trim();
  const now = Date.now();
  const windowStart = now - RATE_LIMIT_WINDOW_MS;

  const failedAttempts = (ipFailedVerificationTimestamps.get(cleanIp) || []).filter((t) => t > windowStart);
  failedAttempts.push(now);
  ipFailedVerificationTimestamps.set(cleanIp, failedAttempts);

  const asyncUpdate = async (): Promise<void> => {
    try {
      const redis = getRedisClient();
      if (redis) {
        const redisVerifyKey = getRedisVerifyRateKey(cleanIp);
        const windowSec = Math.ceil(RATE_LIMIT_WINDOW_MS / 1000);
        if (typeof redis.eval === "function") {
          await redis.eval(RECORD_FAILED_VERIFY_LUA, 1, redisVerifyKey, windowSec);
        } else {
          await redis.incr(redisVerifyKey);
          await redis.expire(redisVerifyKey, windowSec);
        }
      }
    } catch {}
  };

  const p = asyncUpdate();
  return Object.assign(p, { recorded: true });
}

/**
 * Clears active cooldown for a phone (e.g. upon successful authentication)
 */
export function clearCooldown(phone: string, purpose?: "LOGIN" | "PASSWORD_RESET"): void {
  const cleanPhone = normalizePhoneNumber(phone);
  if (purpose) {
    phoneLastSentAt.delete(`${purpose}:${cleanPhone}`);
    try {
      const redis = getRedisClient();
      if (redis) {
        redis.del(getRedisCooldownKey(purpose, cleanPhone)).catch(() => {});
      }
    } catch {}
  } else {
    phoneLastSentAt.delete(`LOGIN:${cleanPhone}`);
    phoneLastSentAt.delete(`PASSWORD_RESET:${cleanPhone}`);
    try {
      const redis = getRedisClient();
      if (redis) {
        redis.del(getRedisCooldownKey("LOGIN", cleanPhone)).catch(() => {});
        redis.del(getRedisCooldownKey("PASSWORD_RESET", cleanPhone)).catch(() => {});
      }
    } catch {}
  }
}

/**
 * Resets all rate-limiting and active OTP state for tests
 */
export function resetOtpRateLimitsForTesting(): void {
  phoneLastSentAt.clear();
  phoneRequestTimestamps.clear();
  ipRequestTimestamps.clear();
  ipFailedVerificationTimestamps.clear();
  otpStore.clear();
  verifyingKeys.clear();
  testCooldownOverride = null;
}

/**
 * Creates and stores a new OTP record with expiration.
 * Saves to in-memory store and synchronizes with Redis if active.
 */
export function createOtp(phone: string, purpose: "LOGIN" | "PASSWORD_RESET"): { code: string; expiresIn: number } {
  const cleanPhone = normalizePhoneNumber(phone);
  const code = generateSecureOtp();
  const now = Date.now();
  const expirySeconds = getOtpExpirySeconds();
  const expiresAt = now + expirySeconds * 1000;

  const key = `${purpose}:${cleanPhone}`;
  const record: OtpRecord = {
    phone: cleanPhone,
    code,
    purpose,
    createdAt: now,
    expiresAt,
    attempts: 0
  };

  otpStore.set(key, record);

  // Synchronize with Redis if connected
  try {
    const redis = getRedisClient();
    if (redis) {
      redis.set(getRedisOtpKey(purpose, cleanPhone), JSON.stringify(record), "EX", expirySeconds).catch(() => {});
    }
  } catch {}

  return { code, expiresIn: expirySeconds };
}

export type VerifyResult =
  | { success: true; error?: undefined; reason?: undefined }
  | { success: false; reason: "NOT_FOUND" | "EXPIRED" | "TOO_MANY_ATTEMPTS" | "INVALID" | "CONCURRENT_CONFLICT"; error: string };

export type VerifyResultThenable = VerifyResult & PromiseLike<VerifyResult>;

/**
 * Securely verifies an OTP using constant-time comparison.
 * Enforces:
 * 1. Single use: consumes/deletes code immediately upon match.
 * 2. Attempt limits: invalidates after MAX_OTP_ATTEMPTS.
 * 3. Expiration: rejects and deletes expired codes.
 * 4. Safe concurrent verification: rejects concurrent duplicate attempts on same OTP.
 * 5. Returns a result that can be used both synchronously and with `await`.
 */
export function verifyOtp(
  phone: string,
  userInputCode: string,
  purpose: "LOGIN" | "PASSWORD_RESET"
): VerifyResultThenable {
  const cleanPhone = normalizePhoneNumber(phone);
  const key = `${purpose}:${cleanPhone}`;

  // 1. Concurrency conflict check
  if (verifyingKeys.has(key)) {
    const conflictResult: VerifyResult = {
      success: false,
      reason: "CONCURRENT_CONFLICT",
      error: "درخواست تایید همزمان در حال پردازش است. لطفاً چند لحظه دیگر تلاش فرمایید."
    };
    return Object.assign(conflictResult, {
      then<TResult1 = VerifyResult, TResult2 = never>(
        onfulfilled?: ((value: VerifyResult) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
      ) {
        return Promise.resolve(conflictResult).then(onfulfilled, onrejected);
      }
    });
  }

  verifyingKeys.add(key);

  let syncResult: VerifyResult;
  try {
    const record = otpStore.get(key);

    if (!record) {
      syncResult = {
        success: false,
        reason: "NOT_FOUND",
        error: "کد تایید یافت نشد یا منقضی شده است. لطفاً مجدداً درخواست ارسال کد نمایید."
      };
    } else {
      const now = Date.now();
      if (now > record.expiresAt) {
        otpStore.delete(key);
        try {
          const redis = getRedisClient();
          if (redis) redis.del(getRedisOtpKey(purpose, cleanPhone)).catch(() => {});
        } catch {}

        syncResult = {
          success: false,
          reason: "EXPIRED",
          error: "کد تایید منقضی شده است. لطفاً مجدداً درخواست ارسال کد نمایید."
        };
      } else {
        record.attempts += 1;
        if (record.attempts > MAX_OTP_ATTEMPTS) {
          otpStore.delete(key);
          try {
            const redis = getRedisClient();
            if (redis) redis.del(getRedisOtpKey(purpose, cleanPhone)).catch(() => {});
          } catch {}

          syncResult = {
            success: false,
            reason: "TOO_MANY_ATTEMPTS",
            error: "تعداد دفعات تلاش اشتباه بیش از حد مجاز است. کد باطل شد. لطفاً مجدداً درخواست کد نمایید."
          };
        } else {
          const inputTrimmed = String(userInputCode || "").trim();
          const expectedTrimmed = record.code.trim();

          // Timing-safe constant-time comparison
          const bufInput = Buffer.from(inputTrimmed);
          const bufExpected = Buffer.from(expectedTrimmed);

          const isMatch = bufInput.length === bufExpected.length && crypto.timingSafeEqual(bufInput, bufExpected);

          if (!isMatch) {
            syncResult = {
              success: false,
              reason: "INVALID",
              error: `کد تایید وارد شده نادرست است. (${MAX_OTP_ATTEMPTS - record.attempts} تلاش باقی‌مانده)`
            };
          } else {
            // Verification succeeded - consume and delete OTP immediately (single-use guarantee)
            otpStore.delete(key);
            clearCooldown(cleanPhone, purpose);
            try {
              const redis = getRedisClient();
              if (redis) redis.del(getRedisOtpKey(purpose, cleanPhone)).catch(() => {});
            } catch {}

            syncResult = { success: true };
          }
        }
      }
    }
  } finally {
    verifyingKeys.delete(key);
  }

  // Return thenable object that works both synchronously (`res.success`) and asynchronously (`await verifyOtp(...)`)
  return Object.assign(syncResult, {
    then<TResult1 = VerifyResult, TResult2 = never>(
      onfulfilled?: ((value: VerifyResult) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: any) => TResult2 | PromiseLike<TResult2>) | null
    ) {
      return Promise.resolve(syncResult).then(onfulfilled, onrejected);
    }
  });
}

/**
 * Asynchronous verification that checks Redis if record is not present in local memory.
 */
export async function verifyOtpAsync(
  phone: string,
  userInputCode: string,
  purpose: "LOGIN" | "PASSWORD_RESET"
): Promise<VerifyResult> {
  const cleanPhone = normalizePhoneNumber(phone);
  const key = `${purpose}:${cleanPhone}`;

  // If found in local store, verify directly
  if (otpStore.has(key)) {
    return verifyOtp(phone, userInputCode, purpose);
  }

  // Check Redis for cross-process state
  try {
    const redis = getRedisClient();
    if (redis) {
      const cached = await redis.get(getRedisOtpKey(purpose, cleanPhone));
      if (cached) {
        const record: OtpRecord = JSON.parse(cached);
        otpStore.set(key, record);
        return verifyOtp(phone, userInputCode, purpose);
      }
    }
  } catch {}

  return {
    success: false,
    reason: "NOT_FOUND",
    error: "کد تایید یافت نشد یا منقضی شده است. لطفاً مجدداً درخواست ارسال کد نمایید."
  };
}

/**
 * Clears any active OTP for a phone number
 */
export function deleteOtp(phone: string, purpose?: "LOGIN" | "PASSWORD_RESET"): void {
  const cleanPhone = normalizePhoneNumber(phone);
  if (purpose) {
    const key = `${purpose}:${cleanPhone}`;
    otpStore.delete(key);
    clearCooldown(cleanPhone, purpose);
    try {
      const redis = getRedisClient();
      if (redis) redis.del(getRedisOtpKey(purpose, cleanPhone)).catch(() => {});
    } catch {}
  } else {
    otpStore.delete(`LOGIN:${cleanPhone}`);
    otpStore.delete(`PASSWORD_RESET:${cleanPhone}`);
    clearCooldown(cleanPhone);
    try {
      const redis = getRedisClient();
      if (redis) {
        redis.del(getRedisOtpKey("LOGIN", cleanPhone)).catch(() => {});
        redis.del(getRedisOtpKey("PASSWORD_RESET", cleanPhone)).catch(() => {});
      }
    } catch {}
  }
}

/**
 * Development helper to retrieve active OTP for testing.
 * Strictly returns null in production.
 */
export function getDevOtp(phone: string, purpose: "LOGIN" | "PASSWORD_RESET"): string | null {
  const isProduction =
    (process.env.NODE_ENV || "").toLowerCase() === "production" ||
    (process.env.APP_ENV || "").toLowerCase() === "production";

  if (isProduction) {
    return null;
  }

  const cleanPhone = normalizePhoneNumber(phone);
  const key = `${purpose}:${cleanPhone}`;
  const record = otpStore.get(key);
  if (!record || Date.now() > record.expiresAt) return null;
  return record.code;
}
