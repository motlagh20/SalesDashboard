import express from "express";
import { isProductionEnvironment } from "./auth";
import { sendApiError } from "./errorHandler";

/**
 * Standard cookie name for SalesDashboard authentication
 */
export const AUTH_COOKIE_NAME = "auth_token";

/**
 * Default cookie path
 */
export const AUTH_COOKIE_PATH = "/";

/**
 * Default cookie lifespan: 30 days (in seconds), aligned with JWT token lifespan
 */
export const AUTH_COOKIE_MAX_AGE = 2592000; // 30 * 24 * 60 * 60

/**
 * Cookie configuration options interface
 */
export interface CookieConfig {
  name?: string;
  path?: string;
  httpOnly?: boolean;
  sameSite?: "Lax" | "Strict" | "None";
  secure?: boolean;
  maxAge?: number;
}

/**
 * Determines whether a connection is secure (TLS/HTTPS).
 * Correctly accounts for:
 * 1. Production environments (Cloud Run / TLS load balancers always require Secure).
 * 2. TLS termination at reverse proxies (via req.secure, X-Forwarded-Proto: https, etc.).
 * 3. Explicit environment overrides (FORCE_COOKIE_SECURE / COOKIE_SECURE).
 * 4. Local development / testing over HTTP (where Secure is omitted unless HTTPS).
 */
export function isSecureConnection(req?: express.Request): boolean {
  // 1. Explicit environment overrides take highest precedence
  if (process.env.FORCE_COOKIE_SECURE === "true" || process.env.COOKIE_SECURE === "true") {
    return true;
  }
  if (process.env.FORCE_COOKIE_SECURE === "false" || process.env.COOKIE_SECURE === "false") {
    return false;
  }

  // 2. Production environments are always served over HTTPS
  if (isProductionEnvironment()) {
    return true;
  }

  // 3. Inspect request if provided (handles TLS-terminated reverse proxies)
  if (req) {
    if (req.secure) {
      return true;
    }
    const forwardedProto = req.headers["x-forwarded-proto"];
    if (typeof forwardedProto === "string") {
      const protos = forwardedProto.split(",").map((p) => p.trim().toLowerCase());
      if (protos.includes("https")) {
        return true;
      }
    }
    const forwardedSsl = req.headers["x-forwarded-ssl"];
    if (typeof forwardedSsl === "string" && forwardedSsl.toLowerCase() === "on") {
      return true;
    }
    if ((req.socket as any)?.encrypted || (req.connection as any)?.encrypted) {
      return true;
    }
  }

  return false;
}

/**
 * Returns standardized options for the authentication cookie.
 * Ensures identical attributes (name, path, httpOnly, sameSite, secure) across
 * setting, refreshing, and clearing cookies.
 */
export function getAuthCookieOptions(
  req?: express.Request,
  overrides?: Partial<CookieConfig>
): Required<CookieConfig> {
  const secure = overrides?.secure !== undefined ? overrides.secure : isSecureConnection(req);

  return {
    name: overrides?.name || AUTH_COOKIE_NAME,
    path: overrides?.path || AUTH_COOKIE_PATH,
    httpOnly: overrides?.httpOnly !== undefined ? overrides.httpOnly : true,
    sameSite: overrides?.sameSite || "Lax",
    secure,
    maxAge: overrides?.maxAge !== undefined ? overrides.maxAge : AUTH_COOKIE_MAX_AGE,
  };
}

/**
 * Serializes an auth token into a Set-Cookie header string with all hardened attributes.
 */
export function serializeAuthCookie(
  token: string,
  req?: express.Request,
  overrides?: Partial<CookieConfig>
): string {
  const opts = getAuthCookieOptions(req, overrides);
  let cookie = `${opts.name}=${token}; Path=${opts.path}; HttpOnly; SameSite=${opts.sameSite}; Max-Age=${opts.maxAge}`;
  if (opts.secure) {
    cookie += "; Secure";
  }
  return cookie;
}

/**
 * Serializes a cookie-clearing header string with exact matching attributes.
 * Sets Max-Age=0 and an expired date to guarantee immediate invalidation across all browsers.
 */
export function serializeClearAuthCookie(
  req?: express.Request,
  overrides?: Partial<CookieConfig>
): string {
  const opts = getAuthCookieOptions(req, overrides);
  let cookie = `${opts.name}=; Path=${opts.path}; HttpOnly; SameSite=${opts.sameSite}; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  if (opts.secure) {
    cookie += "; Secure";
  }
  return cookie;
}

/**
 * Sets the hardened auth cookie on the HTTP response.
 */
export function setAuthCookie(
  res: express.Response,
  token: string,
  req?: express.Request,
  overrides?: Partial<CookieConfig>
): void {
  res.setHeader("Set-Cookie", serializeAuthCookie(token, req, overrides));
}

/**
 * Clears the auth cookie on the HTTP response with identical attributes.
 */
export function clearAuthCookie(
  res: express.Response,
  req?: express.Request,
  overrides?: Partial<CookieConfig>
): void {
  res.setHeader("Set-Cookie", serializeClearAuthCookie(req, overrides));
}

/**
 * Checks if a request is authenticated via the ambient cookie (vulnerable to CSRF)
 * as opposed to an explicit Authorization header (immune to browser auto-submission CSRF).
 */
export function isCookieAuthenticated(req: express.Request): boolean {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.trim().length > 0) {
    return false;
  }
  const xAuthToken = req.headers["x-auth-token"];
  if (typeof xAuthToken === "string" && xAuthToken.trim().length > 0) {
    return false;
  }

  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return false;
  return /(?:^|;\s*)auth_token=/.test(cookieHeader);
}

/**
 * CSRF Protection Middleware:
 * Inspects state-changing requests (POST, PUT, PATCH, DELETE) that rely on ambient cookie authentication.
 * 
 * Defenses:
 * 1. SameSite=Lax cookie attribute natively prevents cross-site POST/PUT/DELETE in modern browsers.
 * 2. Sec-Fetch-Site validation rejects any request initiated from 'cross-site'.
 * 3. Origin / Host matching rejects requests originating from unauthorized external domains.
 */
export function csrfProtectionMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  const method = req.method.toUpperCase();
  // Safe HTTP read methods are exempt from CSRF checks
  if (["GET", "HEAD", "OPTIONS"].includes(method)) {
    return next();
  }

  // Public authentication endpoints (e.g. login, verify OTP, forgot password) don't have an established cookie session
  if (
    req.path === "/api/auth/login-password" ||
    req.path === "/api/auth/verify-otp" ||
    req.path === "/api/auth/send-otp" ||
    req.path === "/api/auth/forgot-password-send" ||
    req.path === "/api/auth/forgot-password-reset"
  ) {
    return next();
  }

  // If request is not authenticated via cookie (e.g. uses Authorization: Bearer <token>), it is immune to CSRF
  if (!isCookieAuthenticated(req)) {
    return next();
  }

  // 1. Origin / Referer verification against Host
  const origin = req.headers.origin;
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  let isOriginMatch = false;

  if (origin && host) {
    try {
      const originUrl = new URL(origin);
      const originHost = originUrl.host.toLowerCase();
      const expectedHost = String(host).split(",")[0].trim().toLowerCase();

      if (originHost === expectedHost) {
        isOriginMatch = true;
      } else {
        const isLocalOrigin = originHost.startsWith("localhost") || originHost.startsWith("127.0.0.1");
        const isLocalHost = expectedHost.startsWith("localhost") || expectedHost.startsWith("127.0.0.1");
        if (isLocalOrigin && isLocalHost) {
          isOriginMatch = true;
        }
      }
    } catch {
      return sendApiError(res, 403, "فرمت مبدا درخواست نامعتبر است.");
    }
  }

  // 2. Reject untrusted cross-origin requests
  if (origin && !isOriginMatch) {
    return sendApiError(res, 403, "مبدا ارسال درخواست معتبر نمی‌باشد (Cross-Origin Request Blocked).");
  }

  // 3. Sec-Fetch-Site verification:
  // If the request has Sec-Fetch-Site: cross-site and Origin does NOT match our host, block it.
  // In an iframe (e.g. AI Studio preview), browsers set Sec-Fetch-Site: cross-site because
  // the parent window differs, but the request's Origin matches the application's own host!
  const secFetchSite = req.headers["sec-fetch-site"];
  if (typeof secFetchSite === "string" && secFetchSite.toLowerCase() === "cross-site" && !isOriginMatch) {
    return sendApiError(res, 403, "درخواست بین‌سایتی غیرمجاز شناسایی و مسدود گردید (CSRF Protection).");
  }

  next();
}
