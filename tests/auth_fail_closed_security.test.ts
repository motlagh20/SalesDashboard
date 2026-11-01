import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import {
  authenticate,
  authorize,
  generateToken,
  setAuthDbPoolOverrideForTesting,
  normalizeRole
} from "../server/auth";
import { DatabaseMaintenanceError } from "../server/errorHandler";

// Helper to create mock Express request and response
function createMockHttp(options: {
  token?: string;
  cookie?: string;
  dbPool?: any;
}) {
  const req: any = {
    headers: {},
    cookies: {}
  };

  if (options.token) {
    req.headers["authorization"] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    req.headers["cookie"] = options.cookie;
  }
  if (options.dbPool) {
    req._dbPool = options.dbPool;
  }

  let statusCode = 200;
  let responseData: any = null;
  const headersSent: Record<string, string> = {};

  const res: any = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      responseData = data;
      return this;
    },
    setHeader(name: string, value: string) {
      headersSent[name] = value;
      return this;
    },
    getHeader(name: string) {
      return headersSent[name];
    },
    get statusCode() {
      return statusCode;
    },
    get responseData() {
      return responseData;
    },
    get headersSent() {
      return headersSent;
    }
  };

  let nextCalled = false;
  let nextError: any = null;
  const next: express.NextFunction = (err?: any) => {
    nextCalled = true;
    nextError = err;
  };

  return { req, res, next, getNextCalled: () => nextCalled, getNextError: () => nextError };
}

describe("Fail-Closed Authentication & Database User Verification Security Tests", () => {
  beforeEach(() => {
    setAuthDbPoolOverrideForTesting(null);
  });

  describe("1. Token Validation & Rejection (Fails Closed)", () => {
    it("fails closed with 401 when token is missing entirely", async () => {
      const { req, res, next, getNextCalled } = createMockHttp({});
      await authenticate(req, res, next);

      assert.equal(getNextCalled(), false, "next() must not be called when token is missing");
      assert.equal(req.user, undefined, "req.user must not be set");
      assert.equal(res.statusCode, 401);
      assert.equal(res.responseData?.success, false);
      assert.ok(res.responseData?.message.includes("احراز هویت الزامی است"));
    });

    it("fails closed with 401 when token signature is forged or invalid", async () => {
      const { req, res, next, getNextCalled } = createMockHttp({
        token: "invalid.forged.signature",
        cookie: "auth_token=invalid.forged.signature"
      });
      await authenticate(req, res, next);

      assert.equal(getNextCalled(), false, "next() must not be called for invalid token");
      assert.equal(req.user, undefined, "req.user must not be set");
      assert.equal(res.statusCode, 401);
      assert.equal(res.responseData?.success, false);
      assert.ok(res.responseData?.message.includes("نامعتبر یا منقضی"));
      assert.ok(res.headersSent["Set-Cookie"]?.includes("Max-Age=0"), "Must clear invalid cookie");
    });

    it("fails closed with 401 when token is expired", async () => {
      const expiredToken = generateToken({ id: "usr-expired", username: "expired", role: "SALES_MANAGER" }, -100);
      const { req, res, next, getNextCalled } = createMockHttp({
        token: expiredToken,
        cookie: `auth_token=${expiredToken}`
      });
      await authenticate(req, res, next);

      assert.equal(getNextCalled(), false, "next() must not be called for expired token");
      assert.equal(req.user, undefined);
      assert.equal(res.statusCode, 401);
      assert.equal(res.responseData?.success, false);
      assert.ok(res.headersSent["Set-Cookie"]?.includes("Max-Age=0"), "Must clear expired cookie");
    });
  });

  describe("2. Database User Identity & Status Verification (Fails Closed)", () => {
    it("fails closed with 401 when user does not exist in the database", async () => {
      const validToken = generateToken({ id: "usr-deleted", username: "deleted_user", role: "SYSTEM_ADMIN" });
      const mockDb = {
        query: async () => [[]] // User not found in database
      };

      const { req, res, next, getNextCalled } = createMockHttp({
        token: validToken,
        cookie: `auth_token=${validToken}`,
        dbPool: mockDb
      });

      await authenticate(req, res, next);

      assert.equal(getNextCalled(), false, "next() must not be called for nonexistent user");
      assert.equal(req.user, undefined, "req.user must not be populated");
      assert.equal(res.statusCode, 401);
      assert.equal(res.responseData?.success, false);
      assert.ok(res.responseData?.message.includes("کاربر معتبر در سامانه یافت نشد"));
      assert.ok(res.headersSent["Set-Cookie"]?.includes("Max-Age=0"), "Must clear cookie for deleted user");
    });

    it("fails closed with 403 when user is disabled (isEnabled = 0)", async () => {
      const validToken = generateToken({ id: "usr-disabled", username: "disabled_user", role: "SALES_MANAGER" });
      const mockDb = {
        query: async () => [[{
          id: "usr-disabled",
          username: "disabled_user",
          fullName: "کاربر مسدود شده",
          role: "SALES_MANAGER",
          isEnabled: 0
        }]]
      };

      const { req, res, next, getNextCalled } = createMockHttp({
        token: validToken,
        cookie: `auth_token=${validToken}`,
        dbPool: mockDb
      });

      await authenticate(req, res, next);

      assert.equal(getNextCalled(), false, "next() must not be called for disabled user");
      assert.equal(req.user, undefined, "req.user must not be populated for disabled user");
      assert.equal(res.statusCode, 403);
      assert.equal(res.responseData?.success, false);
      assert.ok(res.responseData?.message.includes("غیرفعال شده است"));
      assert.ok(res.headersSent["Set-Cookie"]?.includes("Max-Age=0"), "Must clear cookie for disabled user");
    });
  });

  describe("3. Database Query Error & Outage Fail-Closed Defenses", () => {
    it("fails closed with 500 when database query rejects with an error (Never constructs user from claims)", async () => {
      // Attacker possesses a valid token claiming to be SYSTEM_ADMIN
      const adminToken = generateToken({ id: "usr-99", username: "admin_claim", role: "SYSTEM_ADMIN" });
      const mockDb = {
        query: async () => {
          throw new Error("Fatal: Database disk I/O failure");
        }
      };

      const { req, res, next, getNextCalled } = createMockHttp({
        token: adminToken,
        dbPool: mockDb
      });

      await authenticate(req, res, next);

      assert.equal(getNextCalled(), false, "next() MUST NOT be called when database query fails");
      assert.equal(req.user, undefined, "req.user MUST NOT be constructed from JWT claims alone!");
      assert.equal(res.statusCode, 500);
      assert.equal(res.responseData?.success, false);
      assert.ok(res.responseData?.message.includes("خطای سرور در بررسی اطلاعات کاربری"));
    });

    it("fails closed with 503 when database query times out (ETIMEDOUT)", async () => {
      const managerToken = generateToken({ id: "usr-1", username: "manager", role: "SALES_MANAGER" });
      const mockDb = {
        query: async () => {
          const timeoutErr: any = new Error("Query execution timed out after 3000ms");
          timeoutErr.code = "ETIMEDOUT";
          throw timeoutErr;
        }
      };

      const { req, res, next, getNextCalled } = createMockHttp({
        token: managerToken,
        dbPool: mockDb
      });

      await authenticate(req, res, next);

      assert.equal(getNextCalled(), false, "next() must not be called during database timeout");
      assert.equal(req.user, undefined, "req.user must not be set");
      assert.equal(res.statusCode, 503, "Must return HTTP 503 for database timeout");
      assert.equal(res.responseData?.success, false);
      assert.ok(res.responseData?.message.includes("پایگاه داده"));
      // Temporary outage should NOT clear valid session cookie
      assert.equal(res.headersSent["Set-Cookie"], undefined, "Must not destroy user session cookie on transient timeout");
    });

    it("fails closed with 503 on database connection refused (ECONNREFUSED)", async () => {
      const userToken = generateToken({ id: "usr-2", username: "rep_user", role: "REPRESENTATIVE" });
      const mockDb = {
        query: async () => {
          const connErr: any = new Error("connect ECONNREFUSED 127.0.0.1:3306");
          connErr.code = "ECONNREFUSED";
          throw connErr;
        }
      };

      const { req, res, next, getNextCalled } = createMockHttp({
        token: userToken,
        dbPool: mockDb
      });

      await authenticate(req, res, next);

      assert.equal(getNextCalled(), false);
      assert.equal(req.user, undefined);
      assert.equal(res.statusCode, 503);
      assert.equal(res.responseData?.success, false);
      assert.ok(res.responseData?.message.includes("پایگاه داده"));
    });

    it("fails closed with 503 on DatabaseMaintenanceError", async () => {
      const token = generateToken({ id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" });
      const mockDb = {
        query: async () => {
          throw new DatabaseMaintenanceError();
        }
      };

      const { req, res, next, getNextCalled } = createMockHttp({
        token,
        dbPool: mockDb
      });

      await authenticate(req, res, next);

      assert.equal(getNextCalled(), false);
      assert.equal(req.user, undefined);
      assert.equal(res.statusCode, 503);
      assert.equal(res.responseData?.success, false);
    });
  });

  describe("4. Legitimate Authenticated User Flow & Role Normalization", () => {
    it("successfully verifies and populates req.user from database record for valid active user", async () => {
      const validToken = generateToken({ id: "usr-legit", username: "legit_user", role: "SALES_MANAGER" });
      const mockDb = {
        query: async () => [[{
          id: "usr-legit",
          username: "legit_user",
          fullName: "مدیر بازرگانی",
          phoneNumber: "09121234567",
          role: "SALES_MANAGER",
          agentCode: null,
          shippingCompanyId: null,
          isEnabled: 1
        }]]
      };

      const { req, res, next, getNextCalled } = createMockHttp({
        token: validToken,
        dbPool: mockDb
      });

      await authenticate(req, res, next);

      assert.equal(getNextCalled(), true, "next() must be called for valid user");
      assert.ok(req.user, "req.user must be populated");
      assert.equal(req.user.id, "usr-legit");
      assert.equal(req.user.username, "legit_user");
      assert.equal(req.user.role, "SALES_MANAGER");
      assert.equal(req.user.fullName, "مدیر بازرگانی");
      assert.equal(req.user.isEnabled, true);
    });

    it("strictly takes role from database, ignoring stale or elevated token claims", async () => {
      // Stale token has SYSTEM_ADMIN claim
      const staleElevatedToken = generateToken({ id: "usr-demoted", username: "demoted_user", role: "SYSTEM_ADMIN" });
      // Database has demoted role: REPRESENTATIVE
      const mockDb = {
        query: async () => [[{
          id: "usr-demoted",
          username: "demoted_user",
          fullName: "نماینده فروش",
          phoneNumber: "09129998877",
          role: "REPRESENTATIVE",
          agentCode: "AG-101",
          shippingCompanyId: null,
          isEnabled: 1
        }]]
      };

      const { req, res, next, getNextCalled } = createMockHttp({
        token: staleElevatedToken,
        dbPool: mockDb
      });

      await authenticate(req, res, next);

      assert.equal(getNextCalled(), true);
      assert.ok(req.user);
      // Identity MUST be REPRESENTATIVE from DB, NOT SYSTEM_ADMIN from stale token
      assert.equal(req.user.role, "REPRESENTATIVE");

      // Verify authorization downstream blocks SYSTEM_ADMIN actions
      let authNextCalled = false;
      const authMiddleware = authorize("SYSTEM_ADMIN");
      const authRes: any = {
        status(code: number) { this.statusCode = code; return this; },
        json(data: any) { this.data = data; return this; }
      };

      authMiddleware(req, authRes, () => { authNextCalled = true; });
      assert.equal(authNextCalled, false, "Downstream authorize must block demoted user from admin actions");
      assert.equal(authRes.statusCode, 403);
    });

    it("normalizes legacy role names from database (e.g. AGENT -> REPRESENTATIVE, ADMIN -> SYSTEM_ADMIN)", async () => {
      const token = generateToken({ id: "usr-agent", username: "agent_legacy", role: "AGENT" });
      const mockDb = {
        query: async () => [[{
          id: "usr-agent",
          username: "agent_legacy",
          fullName: "نمایندگی",
          role: "AGENT", // legacy DB name
          agentCode: "AG-500",
          isEnabled: 1
        }]]
      };

      const { req, res, next, getNextCalled } = createMockHttp({
        token,
        dbPool: mockDb
      });

      await authenticate(req, res, next);

      assert.equal(getNextCalled(), true);
      assert.equal(req.user?.role, "REPRESENTATIVE", "AGENT role must be normalized to REPRESENTATIVE");
    });
  });
});
