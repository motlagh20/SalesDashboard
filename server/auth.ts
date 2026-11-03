import express from "express";
import crypto from "crypto";
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
        role: string;
        agentCode?: string | null;
        shippingCompanyId?: string | null;
        isEnabled?: boolean;
        mustChangePassword?: boolean;
      };
    }
  }
}

export interface TokenPayload {
  userId: string;
  username: string;
  role: string;
  iat: number;
  exp: number;
}

function base64UrlEncode(str: string): string {
  return Buffer.from(str).toString("base64url");
}

function base64UrlDecode(str: string): string {
  return Buffer.from(str, "base64url").toString("utf8");
}

/**
 * Generates a signed tamper-proof JWT token using HMAC-SHA256
 */
export function generateToken(
  user: { id: string; username: string; role: string },
  expiresInSeconds: number = 30 * 24 * 3600
): string {
  const secret = getJwtSecret();
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const now = Math.floor(Date.now() / 1000);
  const payload: TokenPayload = {
    userId: String(user.id),
    username: String(user.username),
    role: String(user.role),
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

    return {
      userId: payload.userId,
      username: payload.username,
      role: payload.role,
      iat,
      exp
    };
  } catch {
    return null;
  }
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

    const mustChange = Boolean(user.mustChangePassword) || (isProductionEnvironment() && isDefaultPasswordOrMatches(user.password));

    // Role and identity strictly come from verified database record
    req.user = {
      id: String(user.id),
      username: String(user.username),
      fullName: user.fullName || user.username,
      phoneNumber: user.phoneNumber,
      role: normalizeRole(user.role),
      agentCode: user.agentCode || null,
      shippingCompanyId: user.shippingCompanyId || null,
      isEnabled: !!user.isEnabled,
      mustChangePassword: Boolean(mustChange)
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
  filterType: 'ALL' | 'AGENT' | 'SHIPPING_COMPANY' | 'NONE';
  filterValue: string | null;
}

/**
 * Builds the database query and parameter bindings for orders based strictly
 * on the verified server-side identity in req.user.
 * 
 * Enforces:
 * 1. Representatives (or AGENT) ONLY receive orders matching their assigned agentCode.
 * 2. Shipping companies ONLY receive orders matching their assigned shippingCompanyId.
 * 3. Legitimate internal roles (SYSTEM_ADMIN, SALES_MANAGER, etc.) preserve existing access.
 * 4. Never trusts caller-supplied agent codes or company IDs from request body/query.
 * 5. Unassigned representatives or shipping companies receive zero orders (WHERE 1 = 0).
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

  // 1. Representatives must only receive orders belonging to their authorized agentCode
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

  // 2. Shipping companies must only receive orders assigned to their authorized shippingCompanyId
  if (role === "SHIPPING_COMPANY") {
    const shippingCompanyId = user.shippingCompanyId && typeof user.shippingCompanyId === "string" ? user.shippingCompanyId.trim() : null;
    if (!shippingCompanyId) {
      return {
        sql: "SELECT * FROM orders WHERE 1 = 0 ORDER BY priorityIndex ASC, createdAt DESC",
        params: [],
        isRestricted: true,
        filterType: 'SHIPPING_COMPANY',
        filterValue: null
      };
    }
    return {
      sql: "SELECT * FROM orders WHERE shippingCompanyId = ? ORDER BY priorityIndex ASC, createdAt DESC",
      params: [shippingCompanyId],
      isRestricted: true,
      filterType: 'SHIPPING_COMPANY',
      filterValue: shippingCompanyId
    };
  }

  // 3. Legitimate management and internal roles (SYSTEM_ADMIN, SALES_MANAGER, FACTORY_TRANSPORT, PRODUCT_WAREHOUSE, SECURITY_GATE, etc.)
  return {
    sql: "SELECT * FROM orders ORDER BY priorityIndex ASC, createdAt DESC",
    params: [],
    isRestricted: false,
    filterType: 'ALL',
    filterValue: null
  };
}

/**
 * Validates whether the authenticated user has permission to access or modify a specific order.
 * - SYSTEM_ADMIN and SALES_MANAGER have full permissions.
 * - Plant/operational roles (FACTORY_TRANSPORT, PRODUCT_WAREHOUSE, SECURITY_GATE) have operational permissions.
 * - REPRESENTATIVE is strictly restricted to orders matching their authorized agentCode.
 * - SHIPPING_COMPANY is strictly restricted to orders assigned to their authorized shippingCompanyId.
 */
export function checkOrderOwnership(
  order: { agentCode?: string | null; shippingCompanyId?: string | null } | undefined | null,
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
        message: "دسترسی غیرمجاز. این سفارش متعلق به نمایندگی شما نمی‌باشد."
      };
    }
    return { allowed: true, status: 200, message: "مجاز" };
  }

  // Shipping companies are strictly restricted to orders matching their authorized shippingCompanyId
  if (role === "SHIPPING_COMPANY") {
    const userScId = user.shippingCompanyId ? String(user.shippingCompanyId).trim().toLowerCase() : null;
    const orderScId = order.shippingCompanyId ? String(order.shippingCompanyId).trim().toLowerCase() : null;
    if (!userScId || !orderScId || userScId !== orderScId) {
      return {
        allowed: false,
        status: 403,
        message: "دسترسی غیرمجاز. این سفارش به شرکت باربری شما تخصیص نیافته است."
      };
    }
    return { allowed: true, status: 200, message: "مجاز" };
  }

  // Operational plant roles (FACTORY_TRANSPORT, PRODUCT_WAREHOUSE, SECURITY_GATE)
  return { allowed: true, status: 200, message: "مجاز" };
}

