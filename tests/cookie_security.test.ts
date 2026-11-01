import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import {
  AUTH_COOKIE_NAME,
  AUTH_COOKIE_PATH,
  AUTH_COOKIE_MAX_AGE,
  isSecureConnection,
  getAuthCookieOptions,
  serializeAuthCookie,
  serializeClearAuthCookie,
  isCookieAuthenticated
} from "../server/cookie";
import { generateToken } from "../server/auth";

const BASE_URL = process.env.TEST_API_URL || "http://127.0.0.1:3000";

describe("Authentication Cookie Security & Hardening Tests", () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;
  const originalForceSecure = process.env.FORCE_COOKIE_SECURE;

  after(() => {
    // Restore environment
    process.env.NODE_ENV = originalNodeEnv;
    process.env.APP_ENV = originalAppEnv;
    process.env.FORCE_COOKIE_SECURE = originalForceSecure;
  });

  describe("1. Unit Tests: Cookie Configuration & Environment Detection", () => {
    it("enforces Secure cookie attribute in production environment", () => {
      process.env.NODE_ENV = "production";
      process.env.FORCE_COOKIE_SECURE = undefined;
      assert.equal(isSecureConnection(), true, "Must be secure in NODE_ENV=production");

      const serialized = serializeAuthCookie("test-token-prod");
      assert.ok(serialized.includes("; Secure"), "Production cookie must include '; Secure'");
      assert.ok(serialized.includes("HttpOnly"), "Production cookie must include HttpOnly");
      assert.ok(serialized.includes("SameSite=Lax"), "Production cookie must include SameSite=Lax");
      assert.ok(serialized.includes("Path=/"), "Production cookie must include Path=/");
      assert.ok(serialized.includes(`Max-Age=${AUTH_COOKIE_MAX_AGE}`), "Production cookie must specify Max-Age");
    });

    it("omits Secure attribute in plain development HTTP to permit local development", () => {
      process.env.NODE_ENV = "development";
      process.env.APP_ENV = "development";
      process.env.FORCE_COOKIE_SECURE = undefined;

      const mockReq: any = { secure: false, headers: {} };
      assert.equal(isSecureConnection(mockReq), false, "Must not force secure on plain HTTP in development");

      const serialized = serializeAuthCookie("test-token-dev", mockReq);
      assert.ok(!serialized.includes("; Secure"), "Plain dev HTTP cookie must not mandate '; Secure'");
      assert.ok(serialized.includes("HttpOnly"), "Must still enforce HttpOnly in dev");
      assert.ok(serialized.includes("SameSite=Lax"), "Must still enforce SameSite=Lax in dev");
      assert.ok(serialized.includes("Path=/"), "Must still enforce Path=/ in dev");
    });

    it("detects TLS termination from reverse-proxy headers (X-Forwarded-Proto: https)", () => {
      process.env.NODE_ENV = "development";
      const proxyReq: any = {
        secure: false,
        headers: { "x-forwarded-proto": "https" }
      };
      assert.equal(isSecureConnection(proxyReq), true, "Reverse proxy X-Forwarded-Proto: https must enable Secure");

      const serialized = serializeAuthCookie("test-token-proxy", proxyReq);
      assert.ok(serialized.includes("; Secure"), "Cookie behind HTTPS reverse proxy must include '; Secure'");
    });

    it("detects TLS termination from comma-separated X-Forwarded-Proto header", () => {
      const multiProxyReq: any = {
        secure: false,
        headers: { "x-forwarded-proto": "https, http" }
      };
      assert.equal(isSecureConnection(multiProxyReq), true);
    });

    it("guarantees exact attribute symmetry between setting and clearing cookies", () => {
      process.env.NODE_ENV = "production";
      const setCookie = serializeAuthCookie("dummy-token");
      const clearCookie = serializeClearAuthCookie();

      // Check name, path, HttpOnly, SameSite, and Secure
      assert.ok(setCookie.startsWith(`${AUTH_COOKIE_NAME}=`));
      assert.ok(clearCookie.startsWith(`${AUTH_COOKIE_NAME}=;`));
      assert.ok(setCookie.includes("Path=/") && clearCookie.includes("Path=/"));
      assert.ok(setCookie.includes("HttpOnly") && clearCookie.includes("HttpOnly"));
      assert.ok(setCookie.includes("SameSite=Lax") && clearCookie.includes("SameSite=Lax"));
      assert.ok(setCookie.includes("; Secure") && clearCookie.includes("; Secure"));

      // Clearing cookie must have Max-Age=0 and expired date
      assert.ok(clearCookie.includes("Max-Age=0"), "Clear cookie must specify Max-Age=0");
      assert.ok(clearCookie.includes("Expires=Thu, 01 Jan 1970 00:00:00 GMT"), "Clear cookie must have epoch expiration");
    });

    it("correctly identifies cookie-authenticated requests versus header-authenticated requests", () => {
      // 1. Header only -> false (not cookie auth)
      const reqHeader: any = {
        headers: { authorization: "Bearer some-token" }
      };
      assert.equal(isCookieAuthenticated(reqHeader), false);

      // 2. Cookie only -> true
      const reqCookie: any = {
        headers: { cookie: "other=val; auth_token=token-123; theme=dark" }
      };
      assert.equal(isCookieAuthenticated(reqCookie), true);

      // 3. Both Header and Cookie -> false (header takes precedence, immune to auto-attach CSRF)
      const reqBoth: any = {
        headers: {
          authorization: "Bearer some-token",
          cookie: "auth_token=token-123"
        }
      };
      assert.equal(isCookieAuthenticated(reqBoth), false);

      // 4. Neither -> false
      const reqNone: any = { headers: {} };
      assert.equal(isCookieAuthenticated(reqNone), false);
    });
  });

  describe("2. End-to-End API Cookie Configuration & Hardening", () => {
    before(() => {
      // Restore dev env for live server testing
      process.env.NODE_ENV = "test";
      process.env.FORCE_COOKIE_SECURE = undefined;
    });

    it("sets hardened HttpOnly, SameSite=Lax auth_token cookie on successful password login", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginKey: "admin",
          password: "123456"
        })
      });

      assert.equal(res.status, 200);
      const setCookieHeader = res.headers.get("set-cookie");
      assert.ok(setCookieHeader, "Must return Set-Cookie header on successful login");

      // Verify all required cookie flags
      assert.ok(setCookieHeader.includes("auth_token="), "Must set auth_token");
      assert.ok(setCookieHeader.includes("HttpOnly"), "Must include HttpOnly flag");
      assert.ok(setCookieHeader.includes("SameSite=Lax"), "Must include SameSite=Lax flag");
      assert.ok(setCookieHeader.includes("Path=/"), "Must specify Path=/");
      assert.ok(setCookieHeader.includes("Max-Age=2592000"), "Must set 30-day Max-Age");
    });

    it("enables Secure flag when request includes X-Forwarded-Proto: https", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/login-password`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-Proto": "https"
        },
        body: JSON.stringify({
          loginKey: "admin",
          password: "123456"
        })
      });

      assert.equal(res.status, 200);
      const setCookieHeader = res.headers.get("set-cookie");
      assert.ok(setCookieHeader, "Must return Set-Cookie");
      assert.ok(setCookieHeader.includes("; Secure") || setCookieHeader.includes("; secure"), "Must set Secure flag when HTTPS is terminated at proxy");
    });

    it("clears auth_token cookie with matching attributes on /api/auth/logout", async () => {
      const res = await fetch(`${BASE_URL}/api/auth/logout`, {
        method: "POST"
      });

      assert.equal(res.status, 200);
      const setCookieHeader = res.headers.get("set-cookie");
      assert.ok(setCookieHeader, "Must return Set-Cookie on logout");
      assert.ok(setCookieHeader.includes("auth_token="), "Must clear auth_token");
      assert.ok(setCookieHeader.includes("Max-Age=0"), "Must set Max-Age=0 to clear cookie");
      assert.ok(setCookieHeader.includes("HttpOnly"), "Must retain HttpOnly on clearing");
      assert.ok(setCookieHeader.includes("SameSite=Lax"), "Must retain SameSite=Lax on clearing");
      assert.ok(setCookieHeader.includes("Path=/"), "Must retain Path=/ on clearing");
    });

    it("clears stale/expired auth_token cookie when an invalid cookie is presented to authenticate", async () => {
      const forgedCookie = "auth_token=invalid.jwt.token; Path=/";
      const res = await fetch(`${BASE_URL}/api/auth/me`, {
        headers: {
          "Cookie": forgedCookie
        }
      });

      assert.equal(res.status, 401, "Must reject invalid token with 401");
      const setCookieHeader = res.headers.get("set-cookie");
      assert.ok(setCookieHeader, "Must return Set-Cookie to clear invalid cookie");
      assert.ok(setCookieHeader.includes("auth_token="));
      assert.ok(setCookieHeader.includes("Max-Age=0"), "Must actively clear expired/invalid cookie");
    });

    it("enforces CSRF defense by blocking cross-site state-changing requests using cookie auth (Sec-Fetch-Site: cross-site)", async () => {
      // Generate a legitimate token for admin
      const token = generateToken({ id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" });

      // An attacker site triggers a POST request to an authenticated state-changing endpoint with ambient cookie
      const res = await fetch(`${BASE_URL}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": `auth_token=${token}`,
          "Sec-Fetch-Site": "cross-site" // Modern browser flags request as cross-site
        },
        body: JSON.stringify({
          username: "csrf_victim",
          fullName: "قربانی CSRF",
          phoneNumber: "09129998877",
          role: "REPRESENTATIVE"
        })
      });

      assert.equal(res.status, 403, "Cross-site state-changing request must be rejected with 403 Forbidden");
      const body = await res.json();
      assert.equal(body.success, false);
      assert.ok(body.message.includes("CSRF"));
    });

    it("enforces CSRF defense by blocking cross-origin requests using cookie auth with untrusted Origin", async () => {
      const token = generateToken({ id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" });

      const res = await fetch(`${BASE_URL}/api/users`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Cookie": `auth_token=${token}`,
          "Origin": "https://malicious-evil-site.com",
          "Host": "localhost:3000"
        },
        body: JSON.stringify({
          username: "evil_csrf",
          fullName: "حمله CSRF",
          phoneNumber: "09128887766",
          role: "REPRESENTATIVE"
        })
      });

      assert.equal(res.status, 403, "Untrusted cross-origin request must be rejected with 403 Forbidden");
      const body = await res.json();
      assert.equal(body.success, false);
    });

    it("permits legitimate same-origin requests using cookie auth", async () => {
      const token = generateToken({ id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" });

      // State-changing request with same origin
      const res = await fetch(`${BASE_URL}/api/users/usr-0`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "Cookie": `auth_token=${token}`,
          "Origin": "http://127.0.0.1:3000",
          "Host": "127.0.0.1:3000",
          "Sec-Fetch-Site": "same-origin"
        },
        body: JSON.stringify({
          fullName: "مدیر ارشد سیستم (طبرستان)"
        })
      });

      assert.equal(res.status, 200, "Legitimate same-origin cookie request must succeed");
    });

    it("never leaks raw tokens or secrets in error responses or logs", async () => {
      // Send bad request
      const res = await fetch(`${BASE_URL}/api/auth/login-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginKey: "nonexistent_user", password: "wrong_password" })
      });

      assert.equal(res.status, 404);
      const text = await res.text();
      assert.ok(!text.includes("JWT_SECRET"), "Error response must never leak JWT_SECRET");
      assert.ok(!text.includes("token"), "Error response must not expose token fragments");
    });
  });
});
