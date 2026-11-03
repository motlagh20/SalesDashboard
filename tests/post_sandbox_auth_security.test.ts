import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import {
  generateToken,
  setAuthDbPoolOverrideForTesting,
  PRIMARY_ADMIN_ID
} from "../server/auth";
import {
  hashPasswordSync,
  DEFAULT_PASSWORD_BCRYPT_HASH
} from "../server/password";
import {
  setDbPoolForTesting,
  resetDatabaseStateForTesting,
  setDbHealthyForTesting,
  seedDatabaseIfEmpty,
  isProductionEnvironment
} from "../server/database";
import { createExpressApp } from "../server";

describe("Post-Sandbox Authentication Security Audit Suite (Real Backend Routes)", () => {
  let server: http.Server;
  let baseUrl: string;

  // In-memory isolated test database fixture
  let testUsers: any[] = [];

  const strongPassHash1 = hashPasswordSync("StrongPassUser1!#2026");
  const strongPassHashAdmin = hashPasswordSync("StrongAdminPassword!2026");
  const strongPassHashTarget = hashPasswordSync("TargetInitialPass!2026");

  const mockDbPool: any = {
    query: async (sql: string, values: any[] = []) => {
      const cleanSql = sql.trim().replace(/\s+/g, " ");

      if (/SELECT\s+1/i.test(cleanSql)) {
        return [[{ 1: 1 }], []];
      }

      if (/SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+app_users/i.test(cleanSql)) {
        return [[{ count: testUsers.length }], []];
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

      if (/UPDATE\s+app_users\s+SET\s+password\s*=\s*\?,\s*mustChangePassword\s*=\s*\?\s+WHERE\s+id\s*=\s*\?/i.test(cleanSql)) {
        const [hashedPass, mustChangeVal, id] = values;
        const user = testUsers.find(u => u.id === id);
        if (user) {
          user.password = hashedPass;
          user.mustChangePassword = Number(mustChangeVal);
        }
        return [{ affectedRows: 1 }, []];
      }

      if (/UPDATE\s+app_users\s+SET\s+password\s*=\s*\?,\s*mustChangePassword\s*=\s*0\s+WHERE\s+id\s*=\s*\?/i.test(cleanSql)) {
        const [hashedPass, id] = values;
        const user = testUsers.find(u => u.id === id);
        if (user) {
          user.password = hashedPass;
          user.mustChangePassword = 0;
        }
        return [{ affectedRows: 1 }, []];
      }

      if (/SELECT.*FROM\s+orders/i.test(cleanSql)) {
        return [[], []];
      }

      if (/INSERT\s+INTO\s+user_activity_logs/i.test(cleanSql)) {
        return [{ affectedRows: 1 }, []];
      }

      if (/INSERT\s+INTO\s+app_users/i.test(cleanSql)) {
        return [{ affectedRows: 1 }, []];
      }

      return [[], []];
    }
  };

  before(async () => {
    process.env.JWT_SECRET = "post-sandbox-audit-secure-jwt-secret-min-32-chars!";
    process.env.NODE_ENV = "test";

    // Bind real server database access to isolated test fixture
    setDbHealthyForTesting(true);
    setDbPoolForTesting(mockDbPool);
    setAuthDbPoolOverrideForTesting(mockDbPool);

    // Create real Express app from server.ts with real production route handlers
    const app = await createExpressApp({ skipDatabaseBootstrap: true });

    server = http.createServer(app);
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    resetDatabaseStateForTesting();
    setAuthDbPoolOverrideForTesting(null);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    // Reset test users fixture before each test
    testUsers = [
      {
        id: PRIMARY_ADMIN_ID,
        username: "admin",
        fullName: "مدیر ارشد سیستم",
        phoneNumber: "09120000000",
        role: "SYSTEM_ADMIN",
        isEnabled: 1,
        password: strongPassHashAdmin,
        mustChangePassword: 0
      },
      {
        id: "usr-admin-2",
        username: "sub_admin",
        fullName: "مدیر سیستم کمکی",
        phoneNumber: "09120000099",
        role: "SYSTEM_ADMIN",
        isEnabled: 1,
        password: strongPassHashAdmin,
        mustChangePassword: 0
      },
      {
        id: "usr-manager",
        username: "manager",
        fullName: "مدیر بازرگانی",
        phoneNumber: "09121111111",
        role: "SALES_MANAGER",
        isEnabled: 1,
        password: strongPassHash1,
        mustChangePassword: 0
      },
      {
        id: "usr-rep-1",
        username: "rep_tehran",
        fullName: "نماینده فروش تهران",
        phoneNumber: "09120000001",
        role: "REPRESENTATIVE",
        agentCode: "AG-9081",
        isEnabled: 1,
        password: strongPassHash1,
        mustChangePassword: 0
      },
      {
        id: "usr-target",
        username: "target_rep",
        fullName: "نماینده هدف بازنشانی",
        phoneNumber: "09120000002",
        role: "REPRESENTATIVE",
        agentCode: "AG-9082",
        isEnabled: 1,
        password: strongPassHashTarget,
        mustChangePassword: 0
      },
      {
        id: "usr-legacy-default",
        username: "legacy_user",
        fullName: "کاربر با کلمه عبور پیش‌فرض",
        phoneNumber: "09120000003",
        role: "REPRESENTATIVE",
        isEnabled: 1,
        password: DEFAULT_PASSWORD_BCRYPT_HASH,
        mustChangePassword: 1
      }
    ];
  });

  // --- 1. REAL ROUTE PASSWORD CHANGE & AUTHORIZATION TESTS ---

  it("1.1. Negative: Unauthenticated request to change-password returns 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/users/usr-rep-1/change-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newPassword: "NewSecretPassword123!" })
    });
    assert.equal(res.status, 401, "Must require authentication");
    const data = await res.json();
    assert.equal(data.success, false);
  });

  it("1.2. Negative: Invalid or expired token to change-password returns 401 Unauthorized", async () => {
    const res = await fetch(`${baseUrl}/api/users/usr-rep-1/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer invalid.expired.token"
      },
      body: JSON.stringify({ newPassword: "NewSecretPassword123!" })
    });
    assert.equal(res.status, 401, "Must reject invalid token");
  });

  it("1.3. Negative (IDOR): Ordinary user cannot change another user's password (403 Forbidden)", async () => {
    const repToken = generateToken({ id: "usr-rep-1", username: "rep_tehran", role: "REPRESENTATIVE" });
    const res = await fetch(`${baseUrl}/api/users/usr-target/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${repToken}`
      },
      body: JSON.stringify({ newPassword: "HackedPassword123!" })
    });
    assert.equal(res.status, 403, "Ordinary user must not be permitted to change another user's password");
  });

  it("1.4. Negative (Privilege Escalation): Sales Manager cannot change another user's password (403 Forbidden)", async () => {
    const managerToken = generateToken({ id: "usr-manager", username: "manager", role: "SALES_MANAGER" });
    const res = await fetch(`${baseUrl}/api/users/usr-target/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${managerToken}`
      },
      body: JSON.stringify({ newPassword: "ManagerResetPass123!" })
    });
    assert.equal(res.status, 403, "SALES_MANAGER must be forbidden from administrative resets (only SYSTEM_ADMIN permitted)");
  });

  it("1.5. Negative (Privilege Escalation): Non-primary admin cannot change another SYSTEM_ADMIN's password", async () => {
    const subAdminToken = generateToken({ id: "usr-admin-2", username: "sub_admin", role: "SYSTEM_ADMIN" });
    const res = await fetch(`${baseUrl}/api/users/${PRIMARY_ADMIN_ID}/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${subAdminToken}`
      },
      body: JSON.stringify({ newPassword: "AttackerRootPass123!" })
    });
    assert.equal(res.status, 403, "Only primary admin can change root admin password");
  });

  it("1.6. Positive: Self-service password change sets mustChangePassword = 0 in database", async () => {
    const repToken = generateToken({ id: "usr-rep-1", username: "rep_tehran", role: "REPRESENTATIVE" });
    const res = await fetch(`${baseUrl}/api/users/usr-rep-1/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${repToken}`
      },
      body: JSON.stringify({
        currentPassword: "StrongPassUser1!#2026",
        newPassword: "BrandNewSecurePassword123!"
      })
    });
    assert.equal(res.status, 200, "Self-service password change should succeed");
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.token, "Self-service password change returns fresh token for session continuity");

    // Verify database record has mustChangePassword = 0
    const repInDb = testUsers.find(u => u.id === "usr-rep-1");
    assert.equal(repInDb.mustChangePassword, 0, "Database must set mustChangePassword = 0 after self-service change");
  });

  // --- 2. ADMINISTRATIVE RESET & MANDATORY PASSWORD CHANGE TESTS ---

  it("2.1. Positive: Administrative reset sets mustChangePassword = 1 in database", async () => {
    const adminToken = generateToken({ id: PRIMARY_ADMIN_ID, username: "admin", role: "SYSTEM_ADMIN" });
    const res = await fetch(`${baseUrl}/api/users/usr-target/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        newPassword: "TempAdminSetPassword123!"
      })
    });
    assert.equal(res.status, 200, "Admin reset should succeed");
    const data = await res.json();
    assert.equal(data.success, true);

    // Verify database record has mustChangePassword = 1
    const targetInDb = testUsers.find(u => u.id === "usr-target");
    assert.equal(targetInDb.mustChangePassword, 1, "Database must set mustChangePassword = 1 for admin resets");
  });

  it("2.2. Security Isolation: Administrator session remains unchanged after resetting another user's password", async () => {
    const adminToken = generateToken({ id: PRIMARY_ADMIN_ID, username: "admin", role: "SYSTEM_ADMIN" });
    const res = await fetch(`${baseUrl}/api/users/usr-target/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({
        newPassword: "TempAdminSetPassword123!"
      })
    });
    assert.equal(res.status, 200);
    const data = await res.json();

    // 1. Admin response must NOT contain the target user's token
    assert.equal(data.token, undefined, "Admin must NOT receive the target user's JWT token");

    // 2. Response must NOT overwrite session cookie with target user
    const setCookie = res.headers.get("set-cookie");
    assert.equal(setCookie, null, "Response must NOT set auth cookies during administrative password reset");

    // 3. Admin token continues to function normally
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "Authorization": `Bearer ${adminToken}` }
    });
    assert.equal(meRes.status, 200);
    const meData = await meRes.json();
    assert.equal(meData.user.username, "admin", "Admin session remains authenticated as admin");
  });

  it("2.3. Negative: Reset target cannot access /api/orders before changing temporary password (403 Forbidden)", async () => {
    // Put target user into mustChangePassword = 1 state
    const targetUser = testUsers.find(u => u.id === "usr-target");
    targetUser.mustChangePassword = 1;

    const targetToken = generateToken({ id: "usr-target", username: "target_rep", role: "REPRESENTATIVE" });
    const res = await fetch(`${baseUrl}/api/orders`, {
      headers: { "Authorization": `Bearer ${targetToken}` }
    });
    assert.equal(res.status, 403, "Target must be blocked with 403 Forbidden");
    const data = await res.json();
    assert.match(data.message || data.error, /تغییر کلمه عبور پیش‌فرض\/موقت الزامی است/);
  });

  it("2.4. Positive: Reset target CAN change password through permitted endpoint", async () => {
    const targetUser = testUsers.find(u => u.id === "usr-target");
    targetUser.mustChangePassword = 1;
    targetUser.password = hashPasswordSync("TempPassword123!");

    const targetToken = generateToken({ id: "usr-target", username: "target_rep", role: "REPRESENTATIVE" });
    
    // Status endpoint is accessible
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "Authorization": `Bearer ${targetToken}` }
    });
    assert.equal(meRes.status, 200, "Profile check must be permitted");

    // Self-service change password is accessible
    const changeRes = await fetch(`${baseUrl}/api/users/usr-target/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${targetToken}`
      },
      body: JSON.stringify({
        currentPassword: "TempPassword123!",
        newPassword: "TargetPermanentPassword123!"
      })
    });
    assert.equal(changeRes.status, 200, "Target must be allowed to change password");
    const changeData = await changeRes.json();
    assert.equal(changeData.success, true);
    assert.ok(changeData.token, "Receives fresh token");

    // Database record now has mustChangePassword = 0
    assert.equal(targetUser.mustChangePassword, 0, "Database must set mustChangePassword = 0 after user changes temporary password");
  });

  it("2.5. Positive: Reset target gains normal API access only after successful password change", async () => {
    const targetUser = testUsers.find(u => u.id === "usr-target");
    // User already completed password change in previous test or manually set
    targetUser.mustChangePassword = 0;
    targetUser.password = hashPasswordSync("TargetPermanentPassword123!");

    const freshToken = generateToken({ id: "usr-target", username: "target_rep", role: "REPRESENTATIVE" });
    const ordersRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { "Authorization": `Bearer ${freshToken}` }
    });
    assert.equal(ordersRes.status, 200, "Target gains normal access to /api/orders after completing password change");
  });

  // --- 3. PRODUCTION SEEDING LOCKDOWN TESTS ---

  it("3.1. Production safety: Seeding function strictly aborts in production environment", async () => {
    const originalEnv = process.env.NODE_ENV;
    try {
      process.env.NODE_ENV = "production";
      assert.equal(isProductionEnvironment(), true);

      let insertExecuted = false;
      const testDb: any = {
        query: async (sql: string) => {
          if (/INSERT/i.test(sql)) insertExecuted = true;
          return [[], []];
        }
      };

      await seedDatabaseIfEmpty(testDb);
      assert.equal(insertExecuted, false, "Database seeding must never execute in production");
    } finally {
      process.env.NODE_ENV = originalEnv;
    }
  });

  // --- 4. DEDICATED SCREEN UNLOCK ENDPOINT TESTS ---

  it("4.1. AutoLock: Unlocking without authentication token returns 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: "SomePassword123!" })
    });
    assert.equal(res.status, 401, "Must require authentication token");
  });

  it("4.2. AutoLock: Unlocking with current user's valid password succeeds without new token", async () => {
    const repToken = generateToken({ id: "usr-rep-1", username: "rep_tehran", role: "REPRESENTATIVE" });
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${repToken}`
      },
      body: JSON.stringify({ password: "StrongPassUser1!#2026" })
    });
    assert.equal(res.status, 200, "Unlocking with valid password must succeed");
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.token, undefined, "Unlock endpoint must not emit a new token");
    assert.equal(res.headers.get("set-cookie"), null, "Unlock endpoint must not modify cookies");
  });

  it("4.3. AutoLock: Another user's credentials cannot unlock current user's locked session", async () => {
    const repToken = generateToken({ id: "usr-rep-1", username: "rep_tehran", role: "REPRESENTATIVE" });
    // Attempting to unlock rep-1 session with manager or target password
    const res = await fetch(`${baseUrl}/api/auth/unlock`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${repToken}`
      },
      body: JSON.stringify({ password: "StrongAdminPassword!2026" })
    });
    assert.equal(res.status, 400, "Must reject password that does not belong to the locked user");
  });

  it("4.4. AutoLock: Hardcoded fallback passwords '123456' and 'admin123' fail to unlock", async () => {
    const repToken = generateToken({ id: "usr-rep-1", username: "rep_tehran", role: "REPRESENTATIVE" });
    for (const weakPass of ["123456", "admin123"]) {
      const res = await fetch(`${baseUrl}/api/auth/unlock`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${repToken}`
        },
        body: JSON.stringify({ password: weakPass })
      });
      assert.equal(res.status, 400, `Fallback password '${weakPass}' must fail`);
    }
  });
});
