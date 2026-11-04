import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import http from "http";
import { generateToken, setAuthDbPoolOverrideForTesting } from "../server/auth";
import { hashPasswordSync } from "../server/password";
import {
  setDbPoolForTesting,
  setDbHealthyForTesting,
  resetDatabaseStateForTesting
} from "../server/database";
import { createExpressApp } from "../server";

describe("Production Sandbox Security Test Suite (Actual Application Routes)", () => {
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;
  const originalJwtSecret = process.env.JWT_SECRET;

  const strongAdminPassword = "RealSecretPass2026!";
  const strongRepPassword = "RealRepPassword123!";

  let testUsers: any[] = [];

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

      if (/UPDATE\s+app_users\s+SET\s+password\s*=\s*\?/i.test(cleanSql)) {
        return [{ affectedRows: 1 }, []];
      }

      return [[], []];
    },
    getConnection: async () => ({
      query: async (sql: string, values: any[] = []) => mockDbPool.query(sql, values),
      beginTransaction: async () => {},
      commit: async () => {},
      rollback: async () => {},
      release: () => {}
    })
  };

  before(async () => {
    process.env.JWT_SECRET = "production-sandbox-test-jwt-secret-minimum-32-chars-long";
    process.env.NODE_ENV = "production";

    testUsers = [
      {
        id: "usr-admin",
        username: "admin",
        role: "SYSTEM_ADMIN",
        fullName: "مدیر سیستم",
        phoneNumber: "09121111111",
        password: hashPasswordSync(strongAdminPassword),
        isEnabled: 1,
        mustChangePassword: 0
      },
      {
        id: "usr-rep",
        username: "rep_tehran",
        role: "REPRESENTATIVE",
        fullName: "نماینده تهران",
        phoneNumber: "09122222222",
        password: hashPasswordSync(strongRepPassword),
        isEnabled: 1,
        mustChangePassword: 0
      },
      {
        id: "usr-demo",
        username: "demo_user",
        role: "REPRESENTATIVE",
        fullName: "کاربر دمو",
        phoneNumber: "09123333333",
        password: hashPasswordSync("123456"),
        isEnabled: 1,
        mustChangePassword: 1
      }
    ];

    setDbPoolForTesting(mockDbPool);
    setAuthDbPoolOverrideForTesting(mockDbPool);
    setDbHealthyForTesting(true);

    const app = await createExpressApp({ skipDatabaseBootstrap: true });
    server = http.createServer(app);

    await new Promise<void>((resolve) => {
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
    process.env.NODE_ENV = originalNodeEnv;
    process.env.APP_ENV = originalAppEnv;
    process.env.JWT_SECRET = originalJwtSecret;

    resetDatabaseStateForTesting();
    setAuthDbPoolOverrideForTesting(null);

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    process.env.NODE_ENV = "production";
    delete process.env.APP_ENV;
  });

  it("1. Unauthenticated access: GET /api/system/sandbox-status responds without authentication", async () => {
    const res = await fetch(`${baseUrl}/api/system/sandbox-status`);
    assert.equal(res.status, 200, "Must be accessible without token or auth cookie");
    const data = await res.json();
    assert.equal(data.sandboxEnabled, false, "Production must report sandbox disabled");
    assert.equal(data.isProduction, true, "Production flag must be true");
  });

  it("2. Production mode: GET /api/system/sandbox-status strictly returns sandboxEnabled: false", async () => {
    process.env.NODE_ENV = "production";
    const res = await fetch(`${baseUrl}/api/system/sandbox-status`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.sandboxEnabled, false);
    assert.equal(data.isProduction, true);
  });

  it("3. Production mode: POST /api/system/sandbox-status rejects enabling sandbox with 403 Forbidden", async () => {
    process.env.NODE_ENV = "production";
    const adminToken = generateToken({ id: "usr-admin", username: "admin", role: "SYSTEM_ADMIN" });

    const res = await fetch(`${baseUrl}/api/system/sandbox-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${adminToken}`
      },
      body: JSON.stringify({ sandboxEnabled: true })
    });

    assert.equal(res.status, 403, "Production must reject enabling sandbox with 403 Forbidden");
    const data = await res.json();
    const errorMessage = data.message || data.error || "";
    assert.match(errorMessage, /محیط عملیاتی/);
  });

  it("4. POST /api/system/sandbox-status requires authentication and SYSTEM_ADMIN role", async () => {
    // Unauthenticated
    const unauthRes = await fetch(`${baseUrl}/api/system/sandbox-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sandboxEnabled: true })
    });
    assert.equal(unauthRes.status, 401, "Unauthenticated request must return 401");

    // Authenticated as non-admin (REPRESENTATIVE)
    const repToken = generateToken({ id: "usr-rep", username: "rep_tehran", role: "REPRESENTATIVE" });
    const repRes = await fetch(`${baseUrl}/api/system/sandbox-status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${repToken}`
      },
      body: JSON.stringify({ sandboxEnabled: true })
    });
    assert.equal(repRes.status, 403, "Non-admin must be rejected with 403");
  });

  it("5. Production: Attempting to login with shortcut / sandbox flags is blocked with 403 Forbidden", async () => {
    process.env.NODE_ENV = "production";

    const shortcutFlags = [
      { isSandbox: true },
      { isQuickLogin: true },
      { shortcut: true }
    ];

    for (const flags of shortcutFlags) {
      const res = await fetch(`${baseUrl}/api/auth/login-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          loginKey: "admin",
          password: strongAdminPassword,
          ...flags
        })
      });

      assert.equal(res.status, 403, `Sandbox shortcut flag ${JSON.stringify(flags)} must return 403 in production`);
      const data = await res.json();
      const errorMessage = data.message || data.error || "";
      assert.match(errorMessage, /میانبر آزمایشی/);
    }
  });

  it("6. Production: Attempting to login with default demo password '123456' is blocked with 403 Forbidden", async () => {
    process.env.NODE_ENV = "production";

    const usernames = ["admin", "rep_tehran", "demo_user"];
    for (const username of usernames) {
      const res = await fetch(`${baseUrl}/api/auth/login-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loginKey: username, password: "123456" })
      });

      assert.equal(
        res.status,
        403,
        `User ${username} with default password '123456' must be rejected in production with 403`
      );
      const data = await res.json();
      const errorMessage = data.message || data.error || "";
      assert.match(errorMessage, /پیش‌فرض\/دمو/);
    }
  });

  it("7. Production: Legitimate user with valid non-default password authenticates successfully", async () => {
    process.env.NODE_ENV = "production";

    const res = await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginKey: "admin", password: strongAdminPassword })
    });

    assert.equal(res.status, 200, "Legitimate password authentication must succeed in production");
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.token, "JWT token must be returned");
    assert.equal(data.user.username, "admin");
    assert.equal(data.user.role, "SYSTEM_ADMIN");
  });

  it("8. Non-existent user receives 404 in POST /api/auth/login-password", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginKey: "unknown_user", password: "SomeValidPassword123!" })
    });

    assert.equal(res.status, 404);
  });

  it("9. Incorrect password receives 400 in POST /api/auth/login-password", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginKey: "admin", password: "WrongPassword999!" })
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    const errorMessage = data.message || data.error || "";
    assert.match(errorMessage, /نادرست/);
  });
});
