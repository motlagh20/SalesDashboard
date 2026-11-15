import express from "express";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
import { getDbPool } from "./database";
import { sendApiError } from "./errorHandler";
import { isDefaultPasswordOrMatches } from "./password";
import {
  clearAuthCookie,
  setAuthCookie,
  serializeAuthCookie,
  serializeClearAuthCookie,
  getAuthCookieOptions,
  isSecureConnection,
  csrfProtectionMiddleware,
  isCookieAuthenticated,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_PATH,
  AUTH_COOKIE_MAX_AGE
} from "./cookie";

export {
  clearAuthCookie,
  setAuthCookie,
  serializeAuthCookie,
  serializeClearAuthCookie,
  getAuthCookieOptions,
  isSecureConnection,
  csrfProtectionMiddleware,
  isCookieAuthenticated,
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_PATH,
  AUTH_COOKIE_MAX_AGE
};

// Ensure environment variables are loaded
dotenv.config();

/**
 * Detects whether the server is running in a production environment.
 */
export function isProductionEnvironment(): boolean {
  const env = (process.env.NODE_ENV || "").toLowerCase().trim();
  const appEnv = (process.env.APP_ENV || "").toLowerCase().trim();
  return env === "production" || appEnv === "production";
}

/**
 * Dedicated development-only fallback JWT secret.
 * STRICTLY FORBIDDEN IN PRODUCTION.
 */
export const DEV_ONLY_FALLBACK_JWT_SECRET = "dev-only-local-secret-do-not-use-in-production-tabarestan-2026-32chars!";

/**
 * Validates that a JWT secret meets the required security standards:
 * - Must be present and non-empty in production.
 * - Must be at least 32 characters (256 bits) long for HMAC-SHA256.
 * - Must not be a trivial, known weak, or default phrase.
 * - Must have reasonable character diversity (not single repeated character).
 * 
 * Never logs or prints the secret value.
 */
export function validateJwtSecret(
  secret: string | undefined,
  isProduction: boolean
): { valid: boolean; error?: string } {
  if (!secret || typeof secret !== "string" || secret.trim().length === 0) {
    return {
      valid: false,
      error: isProduction
        ? "JWT_SECRET is required in production environment but is missing or empty."
        : "JWT_SECRET is missing or empty."
    };
  }

  const trimmed = secret.trim();

  // Enforce minimum 32 characters (256-bit entropy for HMAC-SHA256)
  if (trimmed.length < 32) {
    return {
      valid: false,
      error: `JWT_SECRET must be at least 32 characters long (provided: ${trimmed.length} characters).`
    };
  }

  // Reject known weak or default secrets
  const knownWeakPatterns = [
    "tabarestan-sales-dashboard-production-secret-key-2026",
    DEV_ONLY_FALLBACK_JWT_SECRET,
    "secret",
    "jwt_secret",
    "jwtsecret",
    "changeme",
    "password",
    "123456",
    "admin",
    "default",
    "test"
  ];
  const lower = trimmed.toLowerCase();
  for (const weak of knownWeakPatterns) {
    if (lower === weak.toLowerCase() || lower === `${weak.toLowerCase()}123` || lower.includes("production-secret-key-2026")) {
      return {
        valid: false,
        error: "JWT_SECRET cannot be a known default, example, or easily guessable secret."
      };
    }
  }

  // Check character diversity (at least 4 distinct characters to prevent "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa")
  const distinctChars = new Set(trimmed.split(""));
  if (distinctChars.size < 4) {
    return {
      valid: false,
      error: "JWT_SECRET has insufficient character diversity/entropy."
    };
  }

  return { valid: true };
}

/**
 * Resolves the active JWT secret for signing and verifying tokens.
 * In production:
 * - Fails immediately if JWT_SECRET is missing, empty, or insecure.
 * - Never falls back to hardcoded secrets or SESSION_SECRET.
 * In development:
 * - Uses process.env.JWT_SECRET if present, or DEV_ONLY_FALLBACK_JWT_SECRET if unset.
 */
export function getJwtSecret(): string {
  const isProduction = isProductionEnvironment();
  const rawSecret = process.env.JWT_SECRET;

  if (isProduction) {
    const validation = validateJwtSecret(rawSecret, true);
    if (!validation.valid) {
      throw new Error(`[SECURITY FATAL] ${validation.error}`);
    }
    return rawSecret!.trim();
  }

  // In development / test environment:
  if (rawSecret && rawSecret.trim().length > 0) {
    return rawSecret.trim();
  }

  return DEV_ONLY_FALLBACK_JWT_SECRET;
}

/**
 * Asserts that the JWT secret is properly configured.
 * Called at server startup to prevent starting in an insecure state.
 */
export function assertJwtSecretConfiguration(): void {
  const isProduction = isProductionEnvironment();
  const rawSecret = process.env.JWT_SECRET;

  const validation = validateJwtSecret(rawSecret, isProduction);

  if (!validation.valid) {
    if (isProduction) {
      console.error("🚨 [CRITICAL SECURITY ERROR] Application refusing to start in production:");
      console.error(`🚨 Reason: ${validation.error}`);
      throw new Error(`FATAL: Insecure JWT configuration - ${validation.error}`);
    } else {
      console.log("ℹ️ [Auth] Development mode: Using explicit development JWT secret. Set JWT_SECRET in .env for custom configuration.");
    }
  } else {
    console.log("✅ [Auth] Configured JWT_SECRET verified successfully (HS256).");
  }
}

// Primary administrator constants
export const PRIMARY_ADMIN_ID = "usr-0";
export const PRIMARY_ADMIN_USERNAME = "admin";

/**
 * Checks if a user is the primary root administrator account.
 * The primary administrator account cannot be deleted, demoted, or disabled.
 */
export function isPrimaryAdmin(user: { id?: string | null; username?: string | null } | undefined | null): boolean {
  if (!user) return false;
  const userId = user.id ? String(user.id).trim().toLowerCase() : "";
  const username = user.username ? String(user.username).trim().toLowerCase() : "";
  return userId === PRIMARY_ADMIN_ID || username === PRIMARY_ADMIN_USERNAME;
}

export const VALID_USER_ROLES = [
  "SYSTEM_ADMIN",
  "SALES_MANAGER",
  "REPRESENTATIVE",
  "SHIPPING_COMPANY",
  "FACTORY_TRANSPORT",
  "PRODUCT_WAREHOUSE",
  "SECURITY_GATE"
] as const;

export function isValidRole(role: string): boolean {
  if (!role || typeof role !== "string") return false;
  const norm = normalizeRole(role);
  return (VALID_USER_ROLES as readonly string[]).includes(norm);
}

// Exported for backward-compatibility with existing tests and modules
// Avoid eager getJwtSecret() throw at top-level module load time
export const JWT_SECRET = process.env.JWT_SECRET || DEV_ONLY_FALLBACK_JWT_SECRET;

// Extend Express Request interface to include authenticated user details
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        fullName?: string;
        phoneNumber?: string;
        email?: string | null;
        emailVerified?: boolean;
        role: string;
        agentCode?: string | null;
        shippingCompanyId?: string | null;
        isEnabled?: boolean;
        mustChangePassword?: boolean;
        tokenVersion?: number;
      };
    }
  }
}

export type JwtTokenUse = "ACCESS" | "PASSWORD_RESET";

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
  tokenUse?: JwtTokenUse;
  tv?: number;
  jti?: string;
  recoveryEmail?: string;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

/**
 * Generates a signed tamper-proof ACCESS JWT token using HMAC-SHA256
 */
export function generateToken(
  user: { id: string; username: string; role: string; tokenVersion?: number },
  expiresInSeconds: number = 30 * 24 * 3600
): string {
  const secret = getJwtSecret();
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    userId: String(user.id),
    username: String(user.username),
    role: String(user.role),
    tokenUse: "ACCESS",
    tv: Number(user.tokenVersion ?? 0),
    iat: now,
    exp: now + expiresInSeconds
  };
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payloadEncoded}`)
    .digest("base64url");

  return `${header}.${payloadEncoded}.${signature}`;
}

/**
 * Generates a short-lived, single-use scoped PASSWORD_RESET recovery token.
 * Strictly rejected by authenticate() so it cannot be used as an API access token.
 */
export function generateRecoveryToken(
  user: { id: string; username: string; role: string; tokenVersion?: number },
  recoveryEmail: string,
  jti: string,
  expiresInSeconds: number = 300
): string {
  const secret = getJwtSecret();
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    userId: String(user.id),
    username: String(user.username),
    role: String(user.role),
    tokenUse: "PASSWORD_RESET",
    tv: Number(user.tokenVersion ?? 0),
    jti,
    recoveryEmail: String(recoveryEmail).trim().toLowerCase(),
    iat: now,
    exp: now + expiresInSeconds
  };
  const payloadEncoded = base64UrlEncode(JSON.stringify(payload));
  const signature = crypto
    .createHmac("sha256", secret)
    .update(`${header}.${payloadEncoded}`)
    .digest("base64url");

  return `${header}.${payloadEncoded}.${signature}`;
}

/**
 * Verifies a JWT token signature, expiration, algorithm, and structural integrity.
 * Strictly enforces HS256 algorithm and rejects alg: "none" or algorithm confusion attacks.
 */
export function verifyToken(token: string): TokenPayload | null {
  if (!token || typeof token !== "string") return null;
  const parts = token.trim().split(".");
  if (parts.length !== 3) return null;

  const [headerEncoded, payloadEncoded, signatureEncoded] = parts;
  if (!headerEncoded || !payloadEncoded || !signatureEncoded) return null;

  try {
    // 1. Strict Header & Algorithm Verification
    let headerObj: any;
    try {
      headerObj = JSON.parse(base64UrlDecode(headerEncoded));
    } catch {
      return null;
    }

    if (!headerObj || typeof headerObj !== "object") return null;

    // Reject any algorithm other than HS256 (prevents alg: "none" and key confusion)
    if (headerObj.alg !== "HS256") {
      return null;
    }

    // Optional typ check: if present, must be JWT (case-insensitive)
    if (headerObj.typ && String(headerObj.typ).toUpperCase() !== "JWT") {
      return null;
    }

    // 2. Cryptographic Signature Verification using constant-time equality
    const secret = getJwtSecret();
    const expectedSig = crypto
      .createHmac("sha256", secret)
      .update(`${headerEncoded}.${payloadEncoded}`)
      .digest("base64url");

    const sigBuf = Buffer.from(signatureEncoded);
    const expBuf = Buffer.from(expectedSig);

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null;
    }

    // 3. Payload Claims Validation
    let payload: any;
    try {
      payload = JSON.parse(base64UrlDecode(payloadEncoded));
    } catch {
      return null;
    }

    if (!payload || typeof payload !== "object") return null;

    // Check mandatory payload identity fields
    if (!payload.userId || typeof payload.userId !== "string") return null;
    if (typeof payload.username !== "string") return null;
    if (typeof payload.role !== "string") return null;

    // 4. Timestamp & Expiration Verification
    const now = Math.floor(Date.now() / 1000);
    const exp = Number(payload.exp);
    const iat = Number(payload.iat);

    if (!Number.isFinite(exp) || !Number.isFinite(iat)) {
      return null;
    }

    // Token must not be expired
    if (now > exp) {
      return null;
    }

    // Clock skew tolerance of at most 60 seconds for future iat
    if (iat > now + 60) {
      return null;
    }

    const result: TokenPayload = {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      iat,
      exp
    };
    if (payload.tokenUse === "ACCESS" || payload.tokenUse === "PASSWORD_RESET") {
      result.tokenUse = payload.tokenUse;
    } else if (payload.tokenUse !== undefined) {
      return null;
    }
    if (payload.tv !== undefined) {
      const tvNum = Number(payload.tv);
      if (!Number.isFinite(tvNum) || tvNum < 0) return null;
      result.tv = tvNum;
    }
    if (typeof payload.jti === "string" && payload.jti.length > 0) {
      result.jti = payload.jti;
    }
    if (typeof payload.recoveryEmail === "string" && payload.recoveryEmail.length > 0) {
      result.recoveryEmail = payload.recoveryEmail;
    }

    return result;
  } catch {
    return null;
  }
}

/**
 * Verifies a scoped PASSWORD_RESET recovery token.
 * Rejects normal ACCESS tokens or tokens missing jti.
 */
export function verifyRecoveryToken(token: string): TokenPayload | null {
  const payload = verifyToken(token);
  if (!payload) return null;
  if (payload.tokenUse !== "PASSWORD_RESET") return null;
  if (!payload.jti || !payload.recoveryEmail) return null;
  return payload;
}

/**
 * Extracts authentication token from headers or cookies
 */
export function extractToken(req: express.Request): string | null {
  // 1. Authorization: Bearer <token> or raw <token>
  const authHeader = req.headers.authorization;
  if (authHeader) {
    const parts = authHeader.trim().split(/\s+/);
    if (parts.length === 2 && /^Bearer$/i.test(parts[0])) {
      return parts[1];
    }
    if (parts.length === 1 && parts[0].includes(".")) {
      return parts[0];
    }
  }

  // 2. x-auth-token header
  const xAuthToken = req.headers["x-auth-token"];
  if (typeof xAuthToken === "string" && xAuthToken.trim()) {
    return xAuthToken.trim();
  }

  // 3. Cookie header
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    const cookies: Record<string, string> = {};
    cookieHeader.split(";").forEach((cookie) => {
      const cparts = cookie.split("=");
      const name = cparts[0]?.trim();
      if (name) {
        cookies[name] = decodeURIComponent(cparts.slice(1).join("=").trim());
      }
    });
    if (cookies.auth_token) return cookies.auth_token;
    if (cookies.token) return cookies.token;
    if (cookies.tabarestan_token) return cookies.tabarestan_token;
  }

  return null;
}

/**
 * Normalizes role names (e.g. FACTORY -> FACTORY_TRANSPORT, WAREHOUSE -> PRODUCT_WAREHOUSE)
 */
export function normalizeRole(role: string): string {
  const r = String(role || "").toUpperCase().trim();
  if (r === "FACTORY") return "FACTORY_TRANSPORT";
  if (r === "WAREHOUSE") return "PRODUCT_WAREHOUSE";
  if (r === "SECURITY") return "SECURITY_GATE";
  if (r === "AGENT") return "REPRESENTATIVE";
  if (r === "ADMIN") return "SYSTEM_ADMIN";
  return r;
}

/**
 * Checks whether userRole has access to one of allowedRoles
 */
export function hasRole(userRole: string, allowedRoles: string[]): boolean {
  const normUser = normalizeRole(userRole);
  // SYSTEM_ADMIN has access to everything
  if (normUser === "SYSTEM_ADMIN") return true;
  const normAllowed = allowedRoles.map(normalizeRole);
  return normAllowed.includes(normUser);
}

let testDbPoolOverride: any = null;

/**
 * Allows automated security tests to simulate database query rejections, timeouts, or outages.
 */
export function setAuthDbPoolOverrideForTesting(override: any | null): void {
  testDbPoolOverride = override;
}

/**
 * Authentication Middleware:
 * Validates token, retrieves the true user record from database,
 * and attaches verified user info to req.user.
 * 
 * Strict Fail-Closed Security Guarantee:
 * 1. Fails closed whenever token verification fails or database lookup cannot verify user.
 * 2. Never constructs req.user or grants roles based on token claims alone when DB fails.
 * 3. On database errors, halts execution immediately and never calls next().
 * 4. Distinguishes database outages (503) from invalid/disabled users (401/403) internally.
 */
export async function authenticate(req: express.Request, res: express.Response, next: express.NextFunction) {
  // Requirement 4: Ensure req.user is clean before authentication starts
  delete req.user;

  const token = extractToken(req);
  if (!token) {
    return sendApiError(res, 401, "احراز هویت الزامی است. لطفاً ابتدا وارد شوید.");
  }

  const payload = verifyToken(token);
  if (!payload || !payload.userId) {
    if (req.headers.cookie && req.headers.cookie.includes("auth_token")) {
      clearAuthCookie(res, req);
    }
    return sendApiError(res, 401, "توکن نامعتبر یا منقضی شده است.");
  }

  // Strictly reject recovery or non-ACCESS scoped tokens on general APIs
  if (payload.tokenUse && payload.tokenUse !== "ACCESS") {
    if (req.headers.cookie && req.headers.cookie.includes("auth_token")) {
      clearAuthCookie(res, req);
    }
    return sendApiError(res, 401, "توکن نامعتبر یا خارج از محدوده دسترسی مجاز است.");
  }

  try {
    const db = (req as any)._dbPool || testDbPoolOverride || getDbPool();
    const [rows] = await db.query("SELECT * FROM app_users WHERE id = ?", [payload.userId]);
    const matched = rows as any[];

    if (!Array.isArray(matched) || matched.length === 0) {
      console.warn(`[Auth] User ID '${payload.userId}' not found in database.`);
      if (req.headers.cookie && req.headers.cookie.includes("auth_token")) {
        clearAuthCookie(res, req);
      }
      return sendApiError(res, 401, "کاربر معتبر در سامانه یافت نشد.");
    }

    const user = matched[0];
    if (!user.isEnabled) {
      console.warn(`[Auth] Disabled user account access attempt: ${user.id} (${user.username}).`);
      if (req.headers.cookie && req.headers.cookie.includes("auth_token")) {
        clearAuthCookie(res, req);
      }
      return sendApiError(res, 403, "حساب کاربری شما غیرفعال شده است. با مدیریت تماس بگیرید.");
    }

    // Session revocation check via tokenVersion (invalidates old JWTs after password change/reset)
    const userTokenVersion = Number(user.tokenVersion ?? 0);
    const payloadTokenVersion = Number(payload.tv ?? 0);
    if (payloadTokenVersion !== userTokenVersion) {
      if (req.headers.cookie && req.headers.cookie.includes("auth_token")) {
        clearAuthCookie(res, req);
      }
      return sendApiError(res, 401, "نشست کاربری منقضی یا ابطال شده است. لطفاً مجدداً وارد شوید.");
    }

    const mustChange = Boolean(user.mustChangePassword) || (isProductionEnvironment() && isDefaultPasswordOrMatches(user.password));

    // Role and identity strictly come from verified database record
    req.user = {
      id: String(user.id),
      username: String(user.username),
      fullName: user.fullName || user.username,
      phoneNumber: user.phoneNumber,
      email: user.email || null,
      emailVerified: Boolean(user.emailVerified),
      role: normalizeRole(user.role),
      agentCode: user.agentCode || null,
      shippingCompanyId: user.shippingCompanyId || null,
      isEnabled: !!user.isEnabled,
      mustChangePassword: Boolean(mustChange),
      tokenVersion: userTokenVersion
    };

    // Mandatory Password Change Backend Enforcement:
    // If the account is flagged for mandatory password change (or has default password),
    // strictly deny access to all application data APIs until password is changed.
    if (mustChange) {
      const targetUrl = (req.originalUrl || req.url || "").split("?")[0];
      const normalizedPath = targetUrl.startsWith("/api") ? targetUrl : `/api${targetUrl}`;
      const allowedPatterns = [
        new RegExp(`^/api/users/${req.user.id}/change-password$`),
        /^\/api\/auth\/logout$/,
        /^\/api\/auth\/me$/,
        /^\/api\/auth\/unlock$/,
        /^\/api\/users\/heartbeat$/
      ];
      const isAllowed = allowedPatterns.some(pattern => pattern.test(normalizedPath));
      if (!isAllowed) {
        return sendApiError(
          res,
          403,
          "جهت حفظ امنیت حساب کاربری، تغییر کلمه عبور پیش‌فرض/موقت الزامی است. دسترسی به سایر بخش‌های سامانه تا زمان تغییر رمز عبور مسدود می‌باشد."
        );
      }
    }

    next();
  } catch (err: any) {
    // FAIL CLOSED (Requirements 1, 2, 4, 7):
    // Strictly ensure req.user is never set or retained
    delete req.user;

    // Distinguish database outage/timeout vs generic query error
    const isDbOutage =
      err?.code === "ECONNREFUSED" ||
      err?.code === "PROTOCOL_CONNECTION_LOST" ||
      err?.code === "ETIMEDOUT" ||
      err?.code === "ENOTFOUND" ||
      err?.name === "DatabaseMaintenanceError" ||
      (typeof err?.message === "string" && (
        err.message.includes("Database service is temporarily unavailable") ||
        err.message.includes("timeout") ||
        err.message.includes("timed out") ||
        err.message.includes("Connection lost") ||
        err.message.includes("connection refused")
      ));

    // Internal diagnostics logging (never logs tokens, passwords, or secrets)
    console.error(
      `[Auth Database Failure] Type=${isDbOutage ? "OUTAGE/TIMEOUT" : "QUERY_ERROR"} | UserID=${payload.userId} | Error: ${err?.message || err}`
    );

    // Safe client responses: 503 for database outages, 500 for other server errors.
    // Do NOT clear auth cookies on transient database outages so valid sessions are not prematurely destroyed.
    const statusCode = isDbOutage ? 503 : 500;
    const clientMessage = isDbOutage
      ? "خطا در برقراری ارتباط با پایگاه داده. لطفاً مجدداً تلاش نمایید."
      : "خطای سرور در بررسی اطلاعات کاربری. لطفاً مجدداً تلاش نمایید.";

    return sendApiError(res, statusCode, clientMessage);
  }
}

/**
 * Authorization Middleware:
 * Ensures the authenticated user possesses one of the allowed roles.
 * Rejects unauthorized operations with 403 Forbidden.
 */
export function authorize(...allowedRoles: string[]) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.user) {
      return sendApiError(res, 401, "احراز هویت الزامی است.");
    }

    if (!hasRole(req.user.role, allowedRoles)) {
      return sendApiError(res, 403, "دسترسی غیرمجاز. شما مجوز انجام این عملیات را ندارید.");
    }

    next();
  };
}

export interface OrderQueryAuthorization {
  sql: string;
  params: any[];
  isRestricted: boolean;
  filterType: 'ALL' | 'AGENT' | 'SHIPPING_COMPANY' | 'STAGE' | 'NONE';
  filterValue: string | null;
  allowedStatuses?: string[];
}

export const ORDER_VISIBLE_STATUSES_BY_ROLE: Record<string, string[]> = {
  FACTORY_TRANSPORT: ["SENT_TO_FACTORY", "VEHICLE_ASSIGNED", "WAREHOUSE_LOADED", "LOADED_AND_DISPATCHED"],
  SHIPPING_COMPANY: ["SENT_TO_FACTORY", "VEHICLE_ASSIGNED", "WAREHOUSE_LOADED", "LOADED_AND_DISPATCHED"],
  PRODUCT_WAREHOUSE: ["VEHICLE_ASSIGNED", "WAREHOUSE_LOADED", "LOADED_AND_DISPATCHED"],
  SECURITY_GATE: ["WAREHOUSE_LOADED", "LOADED_AND_DISPATCHED"]
};

/**
 * Builds the database query and parameter bindings for orders based strictly
 * on the verified server-side identity and role in req.user.
 *
 * Enforces Least Privilege:
 * 1. SYSTEM_ADMIN & SALES_MANAGER: Full order oversight.
 * 2. REPRESENTATIVE (or AGENT): ONLY orders matching their verified agentCode.
 * 3. SHIPPING_COMPANY: ONLY orders matching their verified shippingCompanyId AND operational stages.
 * 4. FACTORY_TRANSPORT / PRODUCT_WAREHOUSE / SECURITY_GATE: ONLY orders in stages relevant to their workflow.
 * 5. Unassigned or unknown roles receive zero orders (WHERE 1 = 0).
 */
export function buildOrderQueryForUser(user?: Express.Request['user']): OrderQueryAuthorization {
  if (!user) {
    return {
      sql: "SELECT * FROM orders WHERE 1 = 0 ORDER BY priorityIndex ASC, createdAt DESC",
      params: [],
      isRestricted: true,
      filterType: 'NONE',
      filterValue: null
    };
  }

  const role = normalizeRole(user.role);

  // 1. Management roles preserve full order visibility
  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER") {
    return {
      sql: "SELECT * FROM orders ORDER BY priorityIndex ASC, createdAt DESC",
      params: [],
      isRestricted: false,
      filterType: 'ALL',
      filterValue: null
    };
  }

  // 2. Representatives must only receive orders belonging to their authorized agentCode
  if (role === "REPRESENTATIVE") {
    const agentCode = user.agentCode && typeof user.agentCode === "string" ? user.agentCode.trim() : null;
    if (!agentCode) {
      return {
        sql: "SELECT * FROM orders WHERE 1 = 0 ORDER BY priorityIndex ASC, createdAt DESC",
        params: [],
        isRestricted: true,
        filterType: 'AGENT',
        filterValue: null
      };
    }
    return {
      sql: "SELECT * FROM orders WHERE agentCode = ? ORDER BY priorityIndex ASC, createdAt DESC",
      params: [agentCode],
      isRestricted: true,
      filterType: 'AGENT',
      filterValue: agentCode
    };
  }

  // 3. Shipping companies must only receive orders assigned to their authorized shippingCompanyId and in factory/transit stages
  if (role === "SHIPPING_COMPANY") {
    const shippingCompanyId = user.shippingCompanyId && typeof user.shippingCompanyId === "string" ? user.shippingCompanyId.trim() : null;
    const allowedStatuses = ORDER_VISIBLE_STATUSES_BY_ROLE.SHIPPING_COMPANY;
    if (!shippingCompanyId) {
      return {
        sql: "SELECT * FROM orders WHERE 1 = 0 ORDER BY priorityIndex ASC, createdAt DESC",
        params: [],
        isRestricted: true,
        filterType: 'SHIPPING_COMPANY',
        filterValue: null,
        allowedStatuses
      };
    }
    return {
      sql: "SELECT * FROM orders WHERE shippingCompanyId = ? AND status IN ('SENT_TO_FACTORY', 'VEHICLE_ASSIGNED', 'WAREHOUSE_LOADED', 'LOADED_AND_DISPATCHED') ORDER BY priorityIndex ASC, createdAt DESC",
      params: [shippingCompanyId],
      isRestricted: true,
      filterType: 'SHIPPING_COMPANY',
      filterValue: shippingCompanyId,
      allowedStatuses
    };
  }

  // 4. Factory Transport: sees only orders dispatched to factory and downstream logistics stages
  if (role === "FACTORY_TRANSPORT") {
    const allowedStatuses = ORDER_VISIBLE_STATUSES_BY_ROLE.FACTORY_TRANSPORT;
    return {
      sql: "SELECT * FROM orders WHERE status IN ('SENT_TO_FACTORY', 'VEHICLE_ASSIGNED', 'WAREHOUSE_LOADED', 'LOADED_AND_DISPATCHED') ORDER BY priorityIndex ASC, createdAt DESC",
      params: [],
      isRestricted: true,
      filterType: 'STAGE',
      filterValue: 'FACTORY_TRANSPORT',
      allowedStatuses
    };
  }

  // 5. Product Warehouse: sees only orders with vehicle assigned, warehouse loaded, or dispatched
  if (role === "PRODUCT_WAREHOUSE") {
    const allowedStatuses = ORDER_VISIBLE_STATUSES_BY_ROLE.PRODUCT_WAREHOUSE;
    return {
      sql: "SELECT * FROM orders WHERE status IN ('VEHICLE_ASSIGNED', 'WAREHOUSE_LOADED', 'LOADED_AND_DISPATCHED') ORDER BY priorityIndex ASC, createdAt DESC",
      params: [],
      isRestricted: true,
      filterType: 'STAGE',
      filterValue: 'PRODUCT_WAREHOUSE',
      allowedStatuses
    };
  }

  // 6. Security Gate: sees only orders ready for gate inspection or cleared history
  if (role === "SECURITY_GATE") {
    const allowedStatuses = ORDER_VISIBLE_STATUSES_BY_ROLE.SECURITY_GATE;
    return {
      sql: "SELECT * FROM orders WHERE status IN ('WAREHOUSE_LOADED', 'LOADED_AND_DISPATCHED') ORDER BY priorityIndex ASC, createdAt DESC",
      params: [],
      isRestricted: true,
      filterType: 'STAGE',
      filterValue: 'SECURITY_GATE',
      allowedStatuses
    };
  }

  // Default deny for any unknown role
  return {
    sql: "SELECT * FROM orders WHERE 1 = 0 ORDER BY priorityIndex ASC, createdAt DESC",
    params: [],
    isRestricted: true,
    filterType: 'NONE',
    filterValue: null
  };
}

/**
 * Builds role-scoped SQL query for agents table.
 */
export function buildAgentQueryForUser(user?: Express.Request['user']): { sql: string; params: any[]; allowed: boolean } {
  if (!user) return { sql: "SELECT * FROM agents WHERE 1 = 0", params: [], allowed: false };
  const role = normalizeRole(user.role);
  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER") {
    return { sql: "SELECT * FROM agents", params: [], allowed: true };
  }
  if (role === "REPRESENTATIVE") {
    const agentCode = user.agentCode && typeof user.agentCode === "string" ? user.agentCode.trim() : null;
    if (!agentCode) return { sql: "SELECT * FROM agents WHERE 1 = 0", params: [], allowed: true };
    return { sql: "SELECT * FROM agents WHERE agentCode = ?", params: [agentCode], allowed: true };
  }
  return { sql: "SELECT * FROM agents WHERE 1 = 0", params: [], allowed: false };
}

/**
 * Builds role-scoped SQL query for shipping_companies table.
 */
export function buildShippingCompanyQueryForUser(user?: Express.Request['user']): { sql: string; params: any[]; allowed: boolean } {
  if (!user) return { sql: "SELECT * FROM shipping_companies WHERE 1 = 0", params: [], allowed: false };
  const role = normalizeRole(user.role);
  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER") {
    return { sql: "SELECT * FROM shipping_companies", params: [], allowed: true };
  }
  if (role === "FACTORY_TRANSPORT") {
    return { sql: "SELECT * FROM shipping_companies WHERE isEnabled = 1", params: [], allowed: true };
  }
  if (role === "SHIPPING_COMPANY") {
    const scId = user.shippingCompanyId && typeof user.shippingCompanyId === "string" ? user.shippingCompanyId.trim() : null;
    if (!scId) return { sql: "SELECT * FROM shipping_companies WHERE 1 = 0", params: [], allowed: true };
    return { sql: "SELECT * FROM shipping_companies WHERE id = ?", params: [scId], allowed: true };
  }
  return { sql: "SELECT * FROM shipping_companies WHERE 1 = 0", params: [], allowed: false };
}

/**
 * Strips unit pricing (`p` / `pricePerUnit` / `price` / `unitPrice` / `totalPrice`)
 * from compact or expanded itemsJson (string, array, or object)
 * so non-commercial operational roles do not receive financial pricing details.
 */
export function stripPricesFromItemsJson(itemsJson: any): any {
  if (itemsJson === null || itemsJson === undefined || itemsJson === "") return null;

  const stripItem = (item: any) => {
    if (!item || typeof item !== "object") return item;
    const copy: any = { ...item };
    delete copy.p;
    delete copy.pricePerUnit;
    delete copy.price;
    delete copy.unitPrice;
    delete copy.totalPrice;
    return copy;
  };

  if (Array.isArray(itemsJson)) {
    return JSON.stringify(itemsJson.map(stripItem));
  }
  if (typeof itemsJson === "object") {
    return JSON.stringify(stripItem(itemsJson));
  }
  if (typeof itemsJson !== "string") return null;

  const trimmed = itemsJson.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return JSON.stringify(parsed.map(stripItem));
    }
    if (parsed && typeof parsed === "object") {
      return JSON.stringify(stripItem(parsed));
    }
    return itemsJson;
  } catch {
    return null;
  }
}

/**
 * Redacts sensitive commercial/payment/PII comments from statusHistory for operational roles.
 */
export function sanitizeStatusHistoryForRole(history: any, role: string): any[] {
  if (!Array.isArray(history)) return [];
  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER" || role === "REPRESENTATIVE") {
    return history;
  }
  return history.map((entry: any) => {
    if (!entry || typeof entry !== "object") return entry;
    const comment = typeof entry.comment === "string" ? entry.comment : "";
    let cleanComment = comment;
    if (
      comment.includes("کد رهگیری پرداخت") ||
      comment.includes("فیش واریزی") ||
      comment.includes("مستندات پرداخت")
    ) {
      cleanComment = "بروزرسانی مستندات مالی سفارش";
    }
    if (role === "SECURITY_GATE" && (comment.includes("خریدار") || comment.includes("تماس"))) {
      cleanComment = "بروزرسانی مشخصات تجاری سفارش";
    }
    return {
      status: entry.status,
      updatedAt: entry.updatedAt,
      comment: cleanComment
    };
  });
}

/**
 * Applies role-based field projection/redaction to a formatted order object.
 */
export function sanitizeOrderForRole(order: any, user?: Express.Request['user']): any {
  if (!order || typeof order !== "object") return order;
  const role = user ? normalizeRole(user.role) : "";

  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER") {
    return order;
  }

  if (role === "REPRESENTATIVE") {
    const copy = { ...order };
    delete copy.warehouseDetails;
    delete copy.securityGateDetails;
    return copy;
  }

  if (role === "FACTORY_TRANSPORT" || role === "SHIPPING_COMPANY") {
    const copy = { ...order };
    delete copy.paymentTrackingCode;
    delete copy.paymentReceiptUrl;
    delete copy.paymentReceiptName;
    delete copy.pendingEditData;
    delete copy.rejectionReason;
    delete copy.warehouseDetails;
    delete copy.securityGateDetails;
    if (copy.itemsJson !== undefined && copy.itemsJson !== null) {
      copy.itemsJson = stripPricesFromItemsJson(copy.itemsJson);
    }
    if (Array.isArray(copy.statusHistory)) {
      copy.statusHistory = sanitizeStatusHistoryForRole(copy.statusHistory, role);
    }
    return copy;
  }

  if (role === "PRODUCT_WAREHOUSE") {
    const copy = { ...order };
    delete copy.paymentTrackingCode;
    delete copy.paymentReceiptUrl;
    delete copy.paymentReceiptName;
    delete copy.pendingEditData;
    delete copy.rejectionReason;
    delete copy.deliveryLocationUrl;
    delete copy.securityGateDetails;
    if (copy.itemsJson !== undefined && copy.itemsJson !== null) {
      copy.itemsJson = stripPricesFromItemsJson(copy.itemsJson);
    }
    if (Array.isArray(copy.statusHistory)) {
      copy.statusHistory = sanitizeStatusHistoryForRole(copy.statusHistory, role);
    }
    return copy;
  }

  if (role === "SECURITY_GATE") {
    const copy = { ...order };
    delete copy.paymentTrackingCode;
    delete copy.paymentReceiptUrl;
    delete copy.paymentReceiptName;
    delete copy.pendingEditData;
    delete copy.rejectionReason;
    delete copy.deliveryLocationUrl;
    delete copy.notes;
    delete copy.buyerName;
    delete copy.phoneNumber;
    if (copy.warehouseDetails && typeof copy.warehouseDetails === "object") {
      const wh = copy.warehouseDetails;
      copy.warehouseDetails = {
        exitPermitNumber: wh.exitPermitNumber ?? null,
        loadedPalletsCount: wh.loadedPalletsCount ?? 0,
        actualQuantity: wh.actualQuantity ?? 0,
        packagingType: wh.packagingType ?? null,
        weighbridgeNet: wh.weighbridgeNet ?? 0,
        warehouseKeeperName: wh.warehouseKeeperName ?? null,
        loadedAt: wh.loadedAt ?? null,
        productionBatch: wh.productionBatch ?? null,
        packageQualityConfirmed: Boolean(wh.packageQualityConfirmed)
      };
    }
    if (copy.itemsJson !== undefined && copy.itemsJson !== null) {
      copy.itemsJson = stripPricesFromItemsJson(copy.itemsJson);
    }
    if (Array.isArray(copy.statusHistory)) {
      copy.statusHistory = sanitizeStatusHistoryForRole(copy.statusHistory, role);
    }
    return copy;
  }

  return null;
}

/**
 * Applies role-based field projection to a product record.
 */
export function sanitizeProductForRole(product: any, user?: Express.Request['user']): any {
  if (!product || typeof product !== "object") return product;
  const role = user ? normalizeRole(user.role) : "";

  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER" || role === "REPRESENTATIVE") {
    return {
      ...product,
      isEnabled: !!product.isEnabled
    };
  }

  // Operational & shipping roles only need logistics/hydration metadata, never commercial pricing
  if (
    role === "FACTORY_TRANSPORT" ||
    role === "SHIPPING_COMPANY" ||
    role === "PRODUCT_WAREHOUSE" ||
    role === "SECURITY_GATE"
  ) {
    return {
      id: product.id,
      name: product.name,
      category: product.category,
      unit: product.unit,
      weight: product.weight ?? null,
      dimensions: product.dimensions ?? null,
      coverageInfo: product.coverageInfo ?? null,
      primaryUnit: product.primaryUnit ?? null,
      secondaryUnit: product.secondaryUnit ?? null,
      conversionRatio: product.conversionRatio ?? null,
      isEnabled: !!product.isEnabled
    };
  }

  return null;
}

/**
 * Applies role-based projection to a shipping company record.
 */
export function sanitizeShippingCompanyForRole(sc: any, user?: Express.Request['user']): any {
  if (!sc || typeof sc !== "object") return null;
  const role = user ? normalizeRole(user.role) : "";

  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER") {
    return {
      ...sc,
      isEnabled: !!sc.isEnabled
    };
  }

  if (role === "SHIPPING_COMPANY") {
    const userScId = user?.shippingCompanyId ? String(user.shippingCompanyId).trim().toLowerCase() : null;
    if (!userScId || String(sc.id || "").trim().toLowerCase() !== userScId) {
      return null;
    }
    return {
      ...sc,
      isEnabled: !!sc.isEnabled
    };
  }

  if (role === "FACTORY_TRANSPORT") {
    if (!sc.isEnabled) return null;
    return {
      id: sc.id,
      name: sc.name,
      code: sc.code,
      phoneNumber: sc.phoneNumber,
      isEnabled: true
    };
  }

  return null;
}

/**
 * Checks whether a permanent driver record belongs to a shipping company caller.
 */
export function isDriverOwnedByShippingCompany(
  driver: { shippingCompanyId?: string | null; shippingAgency?: string | null },
  userScId?: string | null,
  companyName?: string | null
): boolean {
  const cleanUserScId = userScId ? String(userScId).trim().toLowerCase() : null;
  if (!cleanUserScId) return false;

  const drvScId = driver.shippingCompanyId ? String(driver.shippingCompanyId).trim().toLowerCase() : null;
  if (drvScId) {
    return drvScId === cleanUserScId;
  }

  if (companyName && driver.shippingAgency) {
    return String(driver.shippingAgency).trim().toLowerCase() === String(companyName).trim().toLowerCase();
  }
  return false;
}

/**
 * Applies role-based filtering and PII redaction to a permanent driver record.
 */
export function sanitizePermanentDriverForRole(
  driver: any,
  user?: Express.Request['user'],
  companyName?: string | null
): any {
  if (!driver || typeof driver !== "object") return null;
  const role = user ? normalizeRole(user.role) : "";

  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER") {
    return {
      ...driver,
      isEnabled: !!driver.isEnabled
    };
  }

  if (role === "SHIPPING_COMPANY") {
    if (!isDriverOwnedByShippingCompany(driver, user?.shippingCompanyId, companyName)) {
      return null;
    }
    return {
      ...driver,
      isEnabled: !!driver.isEnabled
    };
  }

  if (role === "FACTORY_TRANSPORT") {
    // Factory transport needs driver dispatch fields, NOT driver nationalCode or smartCardNumber PII
    return {
      id: driver.id,
      driverName: driver.driverName,
      driverPhone: driver.driverPhone,
      licensePlate: driver.licensePlate,
      vehicleType: driver.vehicleType,
      shippingAgency: driver.shippingAgency ?? null,
      shippingCompanyId: driver.shippingCompanyId ?? null,
      isEnabled: !!driver.isEnabled
    };
  }

  return null;
}

/**
 * Verifies ownership of a permanent driver for mutation endpoints.
 */
export function checkPermanentDriverOwnership(
  driver: { id?: string; shippingCompanyId?: string | null; shippingAgency?: string | null } | undefined | null,
  user: Express.Request['user'],
  companyName?: string | null
): { allowed: boolean; status: number; message: string } {
  if (!user) {
    return { allowed: false, status: 401, message: "احراز هویت الزامی است." };
  }
  if (!driver) {
    return { allowed: false, status: 404, message: "راننده مورد نظر یافت نشد." };
  }
  const role = normalizeRole(user.role);
  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER" || role === "FACTORY_TRANSPORT") {
    return { allowed: true, status: 200, message: "مجاز" };
  }
  if (role === "SHIPPING_COMPANY") {
    if (!isDriverOwnedByShippingCompany(driver, user.shippingCompanyId, companyName)) {
      return {
        allowed: false,
        status: 403,
        message: "دسترسی غیرمجاز. شما مجوز تغییر اطلاعات این راننده را ندارید."
      };
    }
    return { allowed: true, status: 200, message: "مجاز" };
  }
  return { allowed: false, status: 403, message: "دسترسی غیرمجاز. شما مجوز انجام این عملیات را ندارید." };
}

/**
 * Validates whether an order's current workflow status permits the requested mutation for the caller's role.
 */
export function checkOrderStageForMutation(
  orderStatus: string | null | undefined,
  user: Express.Request['user'],
  allowedStatusesByRole: { default: string[]; management?: string[] }
): { allowed: boolean; status: number; message: string } {
  if (!user) {
    return { allowed: false, status: 401, message: "احراز هویت الزامی است." };
  }
  const role = normalizeRole(user.role);
  const currentStatus = String(orderStatus || "").trim().toUpperCase();
  const isManagement = role === "SYSTEM_ADMIN" || role === "SALES_MANAGER";
  const allowedList = isManagement && allowedStatusesByRole.management
    ? allowedStatusesByRole.management
    : allowedStatusesByRole.default;

  if (!allowedList.includes(currentStatus)) {
    return {
      allowed: false,
      status: 403,
      message: "دسترسی غیرمجاز. این سفارش در مرحله کاری مجاز برای این عملیات قرار ندارد."
    };
  }
  return { allowed: true, status: 200, message: "مجاز" };
}

/**
 * Validates whether the authenticated user has permission to access or modify a specific order.
 * Enforces BOTH object ownership AND workflow stage restrictions per role:
 * - SYSTEM_ADMIN and SALES_MANAGER: full oversight across all orders and stages.
 * - REPRESENTATIVE: strictly restricted to orders matching their authorized agentCode.
 * - SHIPPING_COMPANY: strictly restricted to orders matching their authorized shippingCompanyId AND operational shipping stages.
 * - FACTORY_TRANSPORT / PRODUCT_WAREHOUSE / SECURITY_GATE: strictly restricted to orders in workflow stages allowed for their role.
 */
export function checkOrderOwnership(
  order: { agentCode?: string | null; shippingCompanyId?: string | null; status?: string | null } | undefined | null,
  user: Express.Request['user']
): { allowed: boolean; status: number; message: string } {
  if (!user) {
    return { allowed: false, status: 401, message: "احراز هویت الزامی است." };
  }

  if (!order) {
    return { allowed: false, status: 404, message: "سفارش مورد نظر یافت نشد." };
  }

  const role = normalizeRole(user.role);

  // Management roles have full administrative oversight
  if (role === "SYSTEM_ADMIN" || role === "SALES_MANAGER") {
    return { allowed: true, status: 200, message: "مجاز" };
  }

  // Representatives are strictly restricted to orders matching their authorized agentCode
  if (role === "REPRESENTATIVE") {
    const userAgent = user.agentCode ? String(user.agentCode).trim().toUpperCase() : null;
    const orderAgent = order.agentCode ? String(order.agentCode).trim().toUpperCase() : null;
    if (!userAgent || !orderAgent || userAgent !== orderAgent) {
      return {
        allowed: false,
        status: 403,
        message: "دسترسی غیرمجاز. مجوز دسترسی یا عملیات روی این سفارش برای حساب شما تایید نشد."
      };
    }
    return { allowed: true, status: 200, message: "مجاز" };
  }

  const orderStatus = order.status ? String(order.status).trim().toUpperCase() : "";

  // Shipping companies are strictly restricted to orders matching their authorized shippingCompanyId AND operational stages
  if (role === "SHIPPING_COMPANY") {
    const userScId = user.shippingCompanyId ? String(user.shippingCompanyId).trim().toLowerCase() : null;
    const orderScId = order.shippingCompanyId ? String(order.shippingCompanyId).trim().toLowerCase() : null;
    if (!userScId || !orderScId || userScId !== orderScId) {
      return {
        allowed: false,
        status: 403,
        message: "دسترسی غیرمجاز. مجوز دسترسی یا عملیات روی این سفارش برای حساب شما تایید نشد."
      };
    }
    const allowedStages = ORDER_VISIBLE_STATUSES_BY_ROLE.SHIPPING_COMPANY;
    if (!orderStatus || !allowedStages.includes(orderStatus)) {
      return {
        allowed: false,
        status: 403,
        message: "دسترسی غیرمجاز. این سفارش در مرحله کاری مجاز برای شرکت حمل‌ونقل قرار ندارد."
      };
    }
    return { allowed: true, status: 200, message: "مجاز" };
  }

  // Operational plant roles (FACTORY_TRANSPORT, PRODUCT_WAREHOUSE, SECURITY_GATE) are strictly stage-scoped
  if (role === "FACTORY_TRANSPORT" || role === "PRODUCT_WAREHOUSE" || role === "SECURITY_GATE") {
    const allowedStages = ORDER_VISIBLE_STATUSES_BY_ROLE[role];
    if (!orderStatus || !allowedStages.includes(orderStatus)) {
      return {
        allowed: false,
        status: 403,
        message: "دسترسی غیرمجاز. این سفارش در مرحله کاری مجاز برای نقش شما قرار ندارد."
      };
    }
    return { allowed: true, status: 200, message: "مجاز" };
  }

  return { allowed: false, status: 403, message: "دسترسی غیرمجاز. شما مجوز انجام این عملیات را ندارید." };
}
