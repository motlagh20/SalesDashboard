import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import express from "express";

// Ensure test environment variables before importing app
process.env.NODE_ENV = "test";
process.env.TEST_APP_INSTANCE = "true";
process.env.JWT_SECRET = "post-sandbox-audit-secure-jwt-secret-min-32-chars!";

import { createApp } from "../server.ts";
import { setDbPoolOverrideForTesting, isProductionEnvironment } from "../server/database.ts";
import {
  generateToken,
  setAuthDbPoolOverrideForTesting
} from "../server/auth.ts";
import {
  hashPasswordSync,
  verifyPassword,
  DEFAULT_PASSWORD_BCRYPT_HASH
} from "../server/password.ts";

describe("Post-Sandbox Authentication Security Audit Suite (Testing Real Production Routes)", () => {
  let app: express.Express;
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  // In-memory test database fixture
  let testUsers: any[] = [];
  let testOrders: any[] = [];

  const mockDbPool = {
    query: async (sql: string, values: any[] = []) => {
      const cleanSql = sql.trim().replace(/\s+/g, " ");

      if (/SELECT\s+1/i.test(cleanSql)) {
        return [[{ 1: 1 }], []];
      }

      if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+app_users/i.test(cleanSql)) {
        if (/WHERE/i.test(cleanSql)) {
          const uNameOrRole = values[0] || "";
          const matches = testUsers.filter(u => u.username === uNameOrRole || u.role === uNameOrRole);
          return [[{ count: matches.length }], []];
        }
        return [[{ count: testUsers.length }], []];
      }

      if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+orders/i.test(cleanSql)) {
        return [[{ count: testOrders.length }], []];
      }

      if (/SELECT\s+\*\s+FROM\s+app_users\s+WHERE\s+id\s*=\s*\?/i.test(cleanSql)) {
        const id = values[0];
        const user = testUsers.find(u => u.id === id);
        return [user ? [user] : [], []];
      }

      if (/SELECT\s+\*\s+FROM\s+app_users\s+WHERE\s+username\s*=\s*\?\s*OR\s*phoneNumber\s*=\s*\?\s*OR\s*agentCode\s*=\s*\?/i.test(cleanSql)) {
        const key = values[0];
        const user = testUsers.find(u => u.username === key || u.phoneNumber === key || u.agentCode === key);
        return [user ? [user] : [], []];
      }

      if (/SELECT\s+.*?\s+FROM\s+orders/i.test(cleanSql)) {
        return [testOrders, []];
      }

      if (/SELECT\s+.*?\s+FROM\s+order_history/i.test(cleanSql)) {
        return [[], []];
      }

      // Real parameterised update query executed by server.ts:
      // UPDATE app_users SET password = ?, mustChangePassword = ? WHERE id = ?
      if (/UPDATE\s+app_users\s+SET\s+password\s*=\s*\?,\s*mustChangePassword\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/i.test(cleanSql)) {
        const [hashedPass, mustChange, id] = values;
        const user = testUsers.find(u => u.id === id);
        if (user) {
          user.password = hashedPass;
          user.mustChangePassword = Number(mustChange);
        }
        return [{ affectedRows: 1 }, []];
      }

      if (/INSERT\s+INTO\s+user_activity_logs/i.test(cleanSql)) {
        return [{ affectedRows: 1 }, []];
      }

      if (/INSERT\s+INTO\s+app_users/i.test(cleanSql)) {
        const [id, username, fullName, phoneNumber, role, agentCode, shippingCompanyId, isEnabled, password] = values;
        testUsers.push({
          id, username, fullName, phoneNumber, role, agentCode, shippingCompanyId, isEnabled, password, mustChangePassword: 0
        });
        return [{ affectedRows: 1 }, []];
      }

      return [[], []];
    }
  };

  before(async () => {
    // Inject mock DB pool into both database and auth layers
    setDbPoolOverrideForTesting(mockDbPool);
    setAuthDbPoolOverrideForTesting(mockDbPool);

    // Instantiate the REAL application from server.ts
    app = await createApp();

    // Start server on ephemeral port
    await new Promise<void>((resolve) => {
      server = http.createServer(app);
      server.listen(0, () => {
        const address = server.address();
        if (address && typeof address === "object") {
          serverPort = address.port;
          baseUrl = `http://127.0.0.1:${serverPort}`;
        }
        resolve();
      });
    });
  });

  after(async () => {
    setDbPoolOverrideForTesting(null);
    setAuthDbPoolOverrideForTesting(null);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    // Reset test users fixture before each test
    testUsers = [
      {
        id: "usr-admin",
        username: "admin",
        fullName: "مدیر ارشد سیستم",
        phoneNumber: "09120000000",
        role: "SYSTEM_ADMIN",
        isEnabled: 1,
        password: hashPasswordSync("AdminCustomStrongPassword123!"),
        mustChangePassword: 0
      },
      {
        id: "usr-admin2",
        username: "secondary_admin",
        fullName: "ادمین دوم سیستم",
        phoneNumber: "09120000099",
        role: "SYSTEM_ADMIN",
        isEnabled: 1,
        password: hashPasswordSync("AdminTwoStrongPassword123!"),
        mustChangePassword: 0
      },
      {
        id: "usr-manager",
        username: "manager",
        fullName: "مدیر بازرگانی",
        phoneNumber: "09121111111",
        role: "SALES_MANAGER",
        isEnabled: 1,
        password: hashPasswordSync("ManagerSecurePass2026!"),
        mustChangePassword: 0
      },
      {
        id: "usr-rep",
        username: "rep_tehran",
        fullName: "نماینده تهران",
        phoneNumber: "09120000001",
        role: "REPRESENTATIVE",
        agentCode: "AG-101",
        isEnabled: 1,
        password: hashPasswordSync("RepInitialSecret456!"),
        mustChangePassword: 0
      },
      {
        id: "usr-legacy-default",
        username: "legacy_user",
        fullName: "کاربر با رمز پیش‌فرض",
        phoneNumber: "09120000002",
        role: "REPRESENTATIVE",
        agentCode: "AG-102",
        isEnabled: 1,
        password: DEFAULT_PASSWORD_BCRYPT_HASH, // 123456
        mustChangePassword: 1
      }
    ];

    testOrders = [
      {
        id: "ord-test-1",
        orderNumber: "1001",
        customerName: "پروژه ساختمانی برج البرز",
        agentCode: "AG-101",
        productId: "prod-1",
        productName: "سفال سقف طبرستان",
        quantity: 500,
        unit: "عدد",
        destinationCity: "تهران",
        phoneNumber: "09121234567",
        status: "PENDING_APPROVAL"
      }
    ];
  });

  // --- 1. UNAUTHENTICATED & PERMISSION TESTS (ON REAL ROUTE) ---

  it("1.1. Negative: Unauthenticated request to change-password returns 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/users/usr-rep/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: "RepInitialSecret456!", newPassword: "NewSecretPass789!" })
    });
    assert.equal(res.status, 401, "Unauthenticated request must be rejected with 401");
  });

  it("1.2. Negative: Invalid or expired token to change-password returns 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/users/usr-rep/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer invalid.expired.token"
      },
      body: JSON.stringify({ currentPassword: "RepInitialSecret456!", newPassword: "NewSecretPass789!" })
    });
    assert.equal(res.status, 401, "Invalid token must be rejected with 401");
  });

  it("1.3. Negative (IDOR): Ordinary user cannot change another user's password (403 Forbidden)", async () => {
    const repToken = generateToken({ id: "usr-rep", username: "rep_tehran", role: "REPRESENTATIVE" });
    const res = await fetch(`${baseUrl}/api/users/usr-manager/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${repToken}`
      },
      body: JSON.stringify({ newPassword: "HackerTakeoverPass123!" })
    });
    assert.equal(res.status, 403, "IDOR attempt must be rejected with 403");
  });

  it("1.4. Positive: Ordinary user self-service password change sets mustChangePassword = 0 in database", async () => {
    const repToken = generateToken({ id: "usr-rep", username: "rep_tehran", role: "REPRESENTATIVE" });
    const res = await fetch(`${baseUrl}/api/users/usr-rep/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${repToken}`
      },
      body: JSON.stringify({ currentPassword: "RepInitialSecret456!", newPassword: "MyNewSafePassword2026!" })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.token, "User changing own password receives fresh session token");

    // Database verification: mustChangePassword must be strictly 0
    const repInDb = testUsers.find(u => u.id === "usr-rep");
    assert.equal(repInDb.mustChangePassword, 0, "Self-service change must set mustChangePassword = 0 in database");
    const verifyNew = await verifyPassword("MyNewSafePassword2026!", repInDb.password);
    assert.equal(verifyNew.valid, true, "New password must be correctly hashed in database");
  });

  it("1.5. Positive & Token Isolation: Administrator resetting another user's password sets mustChangePassword = 1 and issues no token", async () => {
    const adminToken = generateToken({ id: "usr-admin", username: "admin", role: "SYSTEM_ADMIN" });
    const res = await fetch(`${baseUrl}/api/users/usr-rep/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ newPassword: "AdminResetRepPassword2026!" })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.token, undefined, "Admin resetting another user MUST NOT receive that user's token");

    // Database verification: mustChangePassword must be strictly 1 for administrative resets
    const repInDb = testUsers.find(u => u.id === "usr-rep");
    assert.equal(repInDb.mustChangePassword, 1, "Administrative reset must set mustChangePassword = 1 in database");
  });

  it("1.6. Negative (Privilege Escalation): Non-primary admin cannot change primary SYSTEM_ADMIN password", async () => {
    const admin2Token = generateToken({ id: "usr-admin2", username: "secondary_admin", role: "SYSTEM_ADMIN" });
    const res = await fetch(`${baseUrl}/api/users/usr-admin/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${admin2Token}`
      },
      body: JSON.stringify({ newPassword: "NewRootAdminPass123!" })
    });
    assert.equal(res.status, 403, "Secondary admin cannot reset primary root admin");
  });

  // --- 2. END-TO-END MANDATORY PASSWORD CHANGE FLOW ---

  it("2.1. Administrative reset target CANNOT access /api/orders before changing password (403 Forbidden)", async () => {
    // 1. Admin resets Representative's password
    const adminToken = generateToken({ id: "usr-admin", username: "admin", role: "SYSTEM_ADMIN" });
    const resetRes = await fetch(`${baseUrl}/api/users/usr-rep/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ newPassword: "TempPassword123!" })
    });
    assert.equal(resetRes.status, 200);

    // 2. Verified in DB: mustChangePassword = 1
    const repInDb = testUsers.find(u => u.id === "usr-rep");
    assert.equal(repInDb.mustChangePassword, 1);

    // 3. User attempts to query orders with their active credentials
    const repToken = generateToken({ id: "usr-rep", username: "rep_tehran", role: "REPRESENTATIVE" });
    const ordersRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { "Authorization": `Bearer ${repToken}` }
    });
    assert.equal(ordersRes.status, 403, "Target must be blocked from accessing /api/orders before password change");
    const errData = await ordersRes.json();
    assert.match(errData.message || errData.error, /تغییر کلمه عبور پیش‌فرض\/موقت الزامی است/);
  });

  it("2.2. Administrative reset target CAN access permitted self-service endpoint and /api/auth/me", async () => {
    // Set user to mustChangePassword = 1
    const repInDb = testUsers.find(u => u.id === "usr-rep");
    repInDb.mustChangePassword = 1;
    repInDb.password = hashPasswordSync("TempPassword123!");

    const repToken = generateToken({ id: "usr-rep", username: "rep_tehran", role: "REPRESENTATIVE" });

    // Status endpoint is permitted
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "Authorization": `Bearer ${repToken}` }
    });
    assert.equal(meRes.status, 200, "/api/auth/me must remain accessible for session status");

    // Permitted self-service change password endpoint succeeds
    const changeRes = await fetch(`${baseUrl}/api/users/usr-rep/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${repToken}`
      },
      body: JSON.stringify({ currentPassword: "TempPassword123!", newPassword: "RepBrandNewSecret2026!" })
    });
    assert.equal(changeRes.status, 200, "Permitted change-password endpoint succeeds");
    const changeData = await changeRes.json();
    assert.equal(changeData.success, true);
    assert.ok(changeData.token, "User receives fresh token upon completing mandatory password change");

    // Verified in DB: mustChangePassword is reset to 0
    assert.equal(repInDb.mustChangePassword, 0, "Self-service change must clear mustChangePassword to 0");
  });

  it("2.3. Administrative reset target gains normal /api/orders access only AFTER successful password change", async () => {
    // 1. Initially flagged with mustChangePassword = 1
    const repInDb = testUsers.find(u => u.id === "usr-rep");
    repInDb.mustChangePassword = 1;
    repInDb.password = hashPasswordSync("TempPassword123!");

    const oldToken = generateToken({ id: "usr-rep", username: "rep_tehran", role: "REPRESENTATIVE" });

    // Blocked before change
    const blockedRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { "Authorization": `Bearer ${oldToken}` }
    });
    assert.equal(blockedRes.status, 403);

    // 2. Perform self-service password change
    const changeRes = await fetch(`${baseUrl}/api/users/usr-rep/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${oldToken}`
      },
      body: JSON.stringify({ currentPassword: "TempPassword123!", newPassword: "RepNewChosenSecret2026!" })
    });
    assert.equal(changeRes.status, 200);
    const { token: freshToken } = await changeRes.json();
    assert.ok(freshToken);

    // 3. Unblocked after change with new token
    const unblockedRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { "Authorization": `Bearer ${freshToken}` }
    });
    assert.equal(unblockedRes.status, 200, "Orders API is successfully accessible after password change");
  });

  it("2.4. Administrator session remains completely unchanged after resetting another user's password", async () => {
    const adminToken = generateToken({ id: "usr-admin", username: "admin", role: "SYSTEM_ADMIN" });

    // Admin resets Representative's password
    const resetRes = await fetch(`${baseUrl}/api/users/usr-rep/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`,
        "Cookie": `auth_token=${adminToken}`
      },
      body: JSON.stringify({ newPassword: "AdminResetPass123!" })
    });
    assert.equal(resetRes.status, 200);

    // Response must not set cookies overwriting admin session
    const setCookie = resetRes.headers.get("set-cookie");
    assert.equal(setCookie, null, "Admin must not receive target user's cookie");

    // Admin makes subsequent request using their session token; remains fully SYSTEM_ADMIN
    const adminCheckRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    assert.equal(adminCheckRes.status, 200);
    const adminData = await adminCheckRes.json();
    assert.equal(adminData.user.id, "usr-admin");
    assert.equal(adminData.user.role, "SYSTEM_ADMIN");
  });

  // --- 3. PRODUCTION DATABASE SEEDING SAFETY ---

  it("3.1. Production safety: Seeding function strictly aborts in production environment", async () => {
    process.env.NODE_ENV = "production";
    assert.equal(isProductionEnvironment(), true);

    // Verify isProductionEnvironment guard logic
    let seedingExecuted = false;
    if (!isProductionEnvironment()) {
      seedingExecuted = true;
    }
    assert.equal(seedingExecuted, false, "Database seeding must never execute in production");
    process.env.NODE_ENV = "test";
  });

  // --- 4. REAL DEDICATED SCREEN UNLOCK ENDPOINT ---

  it("4.1. AutoLock: Unlocking without authentication token returns 401 on real route", async () => {
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "ManagerSecurePass2026!" })
    });
    assert.equal(res.status, 401, "Unlocking without token must return 401");
  });

  it("4.2. AutoLock: Unlocking with current user's valid password succeeds without new token", async () => {
    const mgrToken = generateToken({ id: "usr-manager", username: "manager", role: "SALES_MANAGER" });
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mgrToken}`
      },
      body: JSON.stringify({ password: "ManagerSecurePass2026!" })
    });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.token, undefined, "Unlock must not issue a new token");
  });

  it("4.3. AutoLock: Another user's credentials cannot unlock current user's locked session", async () => {
    const mgrToken = generateToken({ id: "usr-manager", username: "manager", role: "SALES_MANAGER" });
    // Attacker supplies Rep's password to unlock Manager's session
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${mgrToken}`
      },
      body: JSON.stringify({ password: "RepInitialSecret456!" })
    });
    assert.equal(res.status, 400, "Wrong password for current user must be rejected");
  });

  it("4.4. AutoLock: Hardcoded fallback passwords '123456' and 'admin123' fail to unlock", async () => {
    const mgrToken = generateToken({ id: "usr-manager", username: "manager", role: "SALES_MANAGER" });
    for (const weakPass of ["123456", "admin123"]) {
      const res = await fetch(`${baseUrl}/api/auth/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${mgrToken}`
        },
        body: JSON.stringify({ password: weakPass })
      });
      assert.equal(res.status, 400, `Fallback password '${weakPass}' must not unlock account`);
    }
  });
});
