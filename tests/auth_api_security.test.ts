import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { generateToken, JWT_SECRET } from "../server/auth";
import crypto from "crypto";

const BASE_URL = process.env.TEST_API_URL || "http://127.0.0.1:3000";

// Helper function for sending HTTP JSON requests to the API
async function apiRequest(endpoint: string, options: {
  method?: string;
  token?: string;
  body?: any;
  headers?: Record<string, string>;
} = {}): Promise<{ status: number; headers: Headers; data: any }> {
  const { method = "GET", token, body, headers = {} } = options;
  const reqHeaders: Record<string, string> = {
    "Accept": "application/json",
    ...headers
  };

  if (body !== undefined) {
    reqHeaders["Content-Type"] = "application/json";
  }

  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
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

describe("Automated Authentication & Security API Tests", () => {
  // Pre-configured test tokens for different role levels
  const adminToken = generateToken({ id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" });
  const managerToken = generateToken({ id: "usr-1", username: "manager", role: "SALES_MANAGER" });
  const representativeToken = generateToken({ id: "usr-2", username: "rep_tehran", role: "REPRESENTATIVE" });
  const factoryToken = generateToken({ id: "usr-6", username: "factory", role: "FACTORY_TRANSPORT" });

  describe("1. Unauthorized Access Tests", () => {
    it("rejects request to protected endpoints when no token is provided (401)", async () => {
      const endpoints = [
        "/api/products",
        "/api/orders",
        "/api/users",
        "/api/system/monitor-data",
        "/api/system-settings"
      ];

      for (const ep of endpoints) {
        const res = await apiRequest(ep);
        assert.equal(res.status, 401, `Endpoint ${ep} must return 401 when unauthenticated`);
        assert.equal(res.data?.success, false);
        assert.ok(res.data?.message, "Must return descriptive Iranian/standard error message");
      }
    });

    it("rejects requests with malformed or fake token (401)", async () => {
      const res = await apiRequest("/api/products", { token: "invalid.jwt.token" });
      assert.equal(res.status, 401);
      assert.equal(res.data?.success, false);
    });

    it("rejects requests with expired token (401)", async () => {
      // Token expired 1 hour ago
      const expiredToken = generateToken({ id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" }, -3600);
      const res = await apiRequest("/api/products", { token: expiredToken });
      assert.equal(res.status, 401);
      assert.equal(res.data?.success, false);
      assert.ok(res.data?.message?.includes("منقضی") || res.data?.message?.includes("نامعتبر"));
    });

    it("rejects requests with forged signature (401)", async () => {
      const validParts = adminToken.split(".");
      // Tamper signature with wrong secret
      const fakeSig = crypto.createHmac("sha256", "wrong-secret").update(`${validParts[0]}.${validParts[1]}`).digest("base64url");
      const forgedToken = `${validParts[0]}.${validParts[1]}.${fakeSig}`;

      const res = await apiRequest("/api/users", { token: forgedToken });
      assert.equal(res.status, 401);
      assert.equal(res.data?.success, false);
    });
  });

  describe("2. Forbidden Access Tests (Role Enforcement)", () => {
    it("rejects REPRESENTATIVE from accessing admin-only user creation endpoint (403)", async () => {
      const res = await apiRequest("/api/users", {
        method: "POST",
        token: representativeToken,
        body: {
          username: "hacked_user",
          fullName: "کاربر نفوذی",
          phoneNumber: "09120009999",
          role: "SYSTEM_ADMIN"
        }
      });
      assert.equal(res.status, 403, "REPRESENTATIVE must receive 403 Forbidden for POST /api/users");
      assert.equal(res.data?.success, false);
    });

    it("rejects REPRESENTATIVE from accessing admin system reset endpoint (403)", async () => {
      const res = await apiRequest("/api/system/reset-demo", {
        method: "POST",
        token: representativeToken
      });
      assert.equal(res.status, 403, "REPRESENTATIVE must be blocked from resetting demo data");
      assert.equal(res.data?.success, false);
    });

    it("rejects FACTORY_TRANSPORT from modifying product catalog (403)", async () => {
      const res = await apiRequest("/api/products", {
        method: "POST",
        token: factoryToken,
        body: {
          id: "prod-hack-1",
          name: "محصول غیرمجاز",
          category: "bricks",
          pricePerUnit: 1000,
          unit: "عدد"
        }
      });
      assert.equal(res.status, 403, "Factory operator cannot add products");
      assert.equal(res.data?.success, false);
    });

    it("allows authorized roles (SALES_MANAGER, SYSTEM_ADMIN) access to their respective resources", async () => {
      const res = await apiRequest("/api/users", {
        method: "GET",
        token: managerToken
      });
      assert.equal(res.status, 200, "SALES_MANAGER must be allowed to read users list");
      assert.ok(Array.isArray(res.data), "Expected array of users");
    });
  });

  describe("3. Login Flow Security Tests", () => {
    it("rejects login with non-existent username (404)", async () => {
      const res = await apiRequest("/api/auth/login-password", {
        method: "POST",
        body: {
          loginKey: "non_existent_user_9999",
          password: "SomePassword123!"
        }
      });
      assert.equal(res.status, 404);
      assert.equal(res.data?.success, false);
      assert.equal(res.data?.token, undefined);
    });

    it("rejects login with incorrect password (400)", async () => {
      const res = await apiRequest("/api/auth/login-password", {
        method: "POST",
        body: {
          loginKey: "admin",
          password: "definitely_wrong_password"
        }
      });
      assert.equal(res.status, 400);
      assert.equal(res.data?.success, false);
      assert.equal(res.data?.token, undefined);
    });

    it("verifies OTP-based login lifecycle securely", async () => {
      // Step 1: Request OTP for registered user
      const sendRes = await apiRequest("/api/auth/send-otp", {
        method: "POST",
        body: { phoneNumber: "09120000000" }
      });
      assert.equal(sendRes.status, 200);
      assert.equal(sendRes.data?.success, true);
      assert.ok(sendRes.data?.devOtp, "Dev OTP should be returned in development mode");

      const otpCode = sendRes.data.devOtp;

      // Step 2: Attempt verification with incorrect code -> must fail
      const failVerify = await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: { phoneNumber: "09120000000", code: "000000" }
      });
      assert.equal(failVerify.status, 400);
      assert.equal(failVerify.data?.success, false);

      // Step 3: Verify with correct code -> must succeed, return token & sanitized user
      const successVerify = await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: { phoneNumber: "09120000000", code: otpCode }
      });
      assert.equal(successVerify.status, 200);
      assert.equal(successVerify.data?.success, true);
      assert.ok(successVerify.data?.token, "Must return valid session JWT");
      assert.ok(successVerify.data?.user, "Must return user profile");
    });
  });

  describe("4. OTP Expiration & Lockout Security Tests", () => {
    it("rejects verification of non-existent or expired OTP", async () => {
      const res = await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: {
          phoneNumber: "09120000000",
          code: "999999"
        }
      });
      assert.equal(res.status, 400);
      assert.equal(res.data?.success, false);
    });

    it("verifies single-use OTP property: cannot be reused after verification", async () => {
      // Send OTP
      const sendRes = await apiRequest("/api/auth/send-otp", {
        method: "POST",
        body: { phoneNumber: "09120000000" }
      });
      const code = sendRes.data?.devOtp;

      // First verification succeeds
      const firstRes = await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: { phoneNumber: "09120000000", code }
      });
      assert.equal(firstRes.status, 200);

      // Immediate second verification with same code must be rejected (single-use)
      const secondRes = await apiRequest("/api/auth/verify-otp", {
        method: "POST",
        body: { phoneNumber: "09120000000", code }
      });
      assert.equal(secondRes.status, 400, "Replayed OTP must be rejected");
      assert.equal(secondRes.data?.success, false);
    });
  });

  describe("5. Password Reset Flow Security Tests", () => {
    it("rejects password reset with weak or default password like '123456'", async () => {
      // Request recovery code
      const sendRes = await apiRequest("/api/auth/forgot-password-send", {
        method: "POST",
        body: { phoneNumber: "09120000001" }
      });
      assert.equal(sendRes.status, 200);
      const code = sendRes.data?.devOtp;

      // Attempt to set password back to default "123456"
      const resetRes = await apiRequest("/api/auth/forgot-password-reset", {
        method: "POST",
        body: {
          phoneNumber: "09120000001",
          code,
          newPassword: "123456" // Forbidden default password
        }
      });
      assert.equal(resetRes.status, 400, "Setting default password 123456 must be rejected");
      assert.equal(resetRes.data?.success, false);
      assert.ok(resetRes.data?.message?.includes("پیش‌فرض") || resetRes.data?.message?.includes("123456"));
    });

    it("rejects password reset with invalid/fabricated OTP code", async () => {
      const resetRes = await apiRequest("/api/auth/forgot-password-reset", {
        method: "POST",
        body: {
          phoneNumber: "09120000001",
          code: "999888",
          newPassword: "ValidNewP@ssw0rd!2026"
        }
      });
      assert.equal(resetRes.status, 400);
      assert.equal(resetRes.data?.success, false);
    });
  });

  describe("6. Secure User Creation Tests", () => {
    const testUsername = `test_qa_${Date.now()}`;
    let createdUserId: string | null = null;

    it("creates a user with a secure temporary password and flags mustChangePassword = true", async () => {
      const res = await apiRequest("/api/users", {
        method: "POST",
        token: adminToken,
        body: {
          username: testUsername,
          fullName: "کاربر آزمون امنیتی",
          phoneNumber: "09199990011",
          role: "REPRESENTATIVE"
        }
      });

      assert.equal(res.status, 201, "Admin must be able to create user");
      assert.equal(res.data?.success, true);
      assert.ok(res.data?.user, "Must return created user object");
      assert.ok(res.data?.tempPassword, "Must generate and return a temporary password");

      // Verify temporary password is strong and NOT default
      const tempPass = res.data.tempPassword;
      assert.notEqual(tempPass, "123456", "Must NEVER assign 123456 as default password");
      assert.ok(tempPass.length >= 10, "Temporary password must be sufficiently long");
      assert.equal(res.data.user.mustChangePassword, true, "First login must require password update");

      createdUserId = res.data.user.id;
    });

    it("rejects user creation with missing required fields (400)", async () => {
      const res = await apiRequest("/api/users", {
        method: "POST",
        token: adminToken,
        body: {
          username: "missing_fields"
          // Missing fullName, phoneNumber, role
        }
      });
      assert.equal(res.status, 400);
      assert.equal(res.data?.success, false);
    });

    after(async () => {
      // Clean up test user
      if (createdUserId) {
        await apiRequest(`/api/users/${createdUserId}`, {
          method: "DELETE",
          token: adminToken
        });
      }
    });
  });

  describe("7. Sensitive Field Exposure Prevention Tests", () => {
    it("never exposes password or password hashes in GET /api/users response", async () => {
      const res = await apiRequest("/api/users", {
        token: adminToken
      });
      assert.equal(res.status, 200);
      const rawText = JSON.stringify(res.data);

      // Check for password leaks
      assert.ok(!rawText.includes("\"password\""), "Response must NOT contain 'password' field");
      assert.ok(!rawText.includes("$2b$"), "Response must NOT contain bcrypt hash signature '$2b$'");
      assert.ok(!rawText.includes("$2a$"), "Response must NOT contain bcrypt hash signature '$2a$'");
      assert.ok(!rawText.includes("$2y$"), "Response must NOT contain bcrypt hash signature '$2y$'");
      assert.ok(!rawText.includes("passwordHash"), "Response must NOT contain 'passwordHash'");
    });

    it("never exposes password or password hashes in GET /api/sync/bootstrap response", async () => {
      const res = await apiRequest("/api/sync/bootstrap", {
        token: adminToken
      });
      assert.equal(res.status, 200);
      const rawText = JSON.stringify(res.data);

      assert.ok(!rawText.includes("\"password\""), "Sync bootstrap must NOT leak password field");
      assert.ok(!rawText.includes("$2b$"), "Sync bootstrap must NOT leak bcrypt hashes");
    });

    it("never exposes password or password hashes in /api/auth/me response", async () => {
      const res = await apiRequest("/api/auth/me", {
        token: representativeToken
      });
      assert.equal(res.status, 200);
      const rawText = JSON.stringify(res.data);

      assert.ok(!rawText.includes("\"password\""), "/api/auth/me must NOT leak password field");
      assert.ok(!rawText.includes("$2b$"), "/api/auth/me must NOT leak bcrypt hashes");
    });
  });

  describe("8. Role Escalation Prevention Tests", () => {
    it("prevents self-role-escalation via profile update endpoint", async () => {
      // User usr-2 (REPRESENTATIVE) attempts to update their own profile and inject role: SYSTEM_ADMIN
      const res = await apiRequest("/api/users/usr-2/profile", {
        method: "POST",
        token: representativeToken,
        body: {
          phoneNumber: "09120000001",
          address: "آدرس تستی",
          role: "SYSTEM_ADMIN" // Malicious escalation attempt
        }
      });

      assert.equal(res.status, 200);
      // Verify user's actual role remains REPRESENTATIVE and did not escalate
      assert.equal(res.data?.user?.role, "REPRESENTATIVE", "Role must NOT be modified via profile update");
    });

    it("prevents regular users from modifying another user's profile (403)", async () => {
      // User usr-2 (REPRESENTATIVE) attempts to modify usr-0 (admin) profile
      const res = await apiRequest("/api/users/usr-0/profile", {
        method: "POST",
        token: representativeToken,
        body: {
          phoneNumber: "09129990000",
          address: "تهران"
        }
      });
      assert.equal(res.status, 403, "Users must not be allowed to edit other users' profiles");
      assert.equal(res.data?.success, false);
    });

    it("prevents regular users from modifying user records or roles via PUT /api/users/:id (403)", async () => {
      // User usr-2 (REPRESENTATIVE) attempts to call PUT /api/users/usr-2 with role: SYSTEM_ADMIN
      const res = await apiRequest("/api/users/usr-2", {
        method: "PUT",
        token: representativeToken,
        body: {
          username: "rep_tehran",
          fullName: "آقای حمیدرضا احمدی",
          phoneNumber: "09120000001",
          role: "SYSTEM_ADMIN" // Malicious escalation attempt
        }
      });
      assert.equal(res.status, 403, "Non-managers must receive 403 on PUT /api/users/:id");
      assert.equal(res.data?.success, false);
    });
  });
});
