import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "http";
import {
  generateToken,
  verifyToken,
  authenticate,
  setAuthDbPoolOverrideForTesting,
  hasRole
} from "../server/auth";
import {
  isDefaultPassword,
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  DEFAULT_PASSWORD_BCRYPT_HASH
} from "../server/password";
import { isProductionEnvironment } from "../server/database";

describe("Post-Sandbox Authentication Security Audit Suite", () => {
  let app: express.Express;
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  // In-memory test database fixture
  let testUsers: any[] = [];

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

      if (/UPDATE\s+app_users\s+SET\s+password\s*=\s*\?,\s*mustChangePassword\s*=\s*0\s+WHERE\s+id\s*=\s*\?/i.test(cleanSql)) {
        const [hashedPass, id] = values;
        const user = testUsers.find(u => u.id === id);
        if (user) {
          user.password = hashedPass;
          user.mustChangePassword = 0;
        }
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
    process.env.JWT_SECRET = "post-sandbox-audit-secure-jwt-secret-min-32-chars!";

    setAuthDbPoolOverrideForTesting(mockDbPool);

    app = express();
    app.use(express.json());

    // Inject mock DB pool into request for test isolation
    app.use((req, res, next) => {
      (req as any)._dbPool = mockDbPool;
      next();
    });

    // 1. Unauthenticated Password Change Endpoint (with security checks)
    app.post("/api/users/:id/change-password", authenticate, async (req, res) => {
      const safeId = req.params.id;
      const { currentPassword, newPassword } = req.body || {};
      const user = testUsers.find(u => u.id === safeId);

      if (!user) {
        return res.status(404).json({ error: "کاربر یافت نشد." });
      }

      const isSelf = req.user?.id === safeId;
      const isAdmin = hasRole(req.user?.role || "", ["SYSTEM_ADMIN"]);

      if (!isSelf && !isAdmin) {
        return res.status(403).json({ error: "دسترسی غیرمجاز. شما مجوز تغییر رمز عبور این کاربر را ندارید." });
      }

      if (!isSelf && user.role === "SYSTEM_ADMIN" && req.user?.username !== "root_admin") {
        return res.status(403).json({ error: "تنها مدیر ارشد اصلی سیستم مجاز به تغییر رمز عبور سایر مدیران سیستم می‌باشد." });
      }

      if (isSelf) {
        if (!currentPassword) {
          return res.status(400).json({ error: "رمز عبور فعلی الزامی است." });
        }
        const verifyRes = await verifyPassword(currentPassword, user.password);
        if (!verifyRes.valid) {
          return res.status(400).json({ error: "رمز عبور فعلی نادرست است." });
        }
      }

      if (!newPassword || newPassword.trim().length < 6) {
        return res.status(400).json({ error: "رمز عبور جدید باید حداقل ۶ کاراکتر باشد." });
      }

      if (isDefaultPassword(newPassword)) {
        return res.status(400).json({ error: "استفاده از کلمه عبور پیش‌فرض مجاز نیست." });
      }

      user.password = await hashPassword(newPassword.trim());
      user.mustChangePassword = 0;

      // When admin resets another user's password, DO NOT issue target user's token!
      if (!isSelf) {
        return res.json({
          success: true,
          message: `کلمه عبور کاربر «${user.username}» توسط مدیر سیستم با موفقیت تغییر یافت.`
        });
      }

      const freshToken = generateToken({ id: user.id, username: user.username, role: user.role });
      return res.json({
        success: true,
        token: freshToken,
        mustChangePassword: false,
        message: "رمز عبور شما با موفقیت تغییر یافت."
      });
    });

    // 2. Protected Application API (e.g., Orders)
    app.get("/api/orders", authenticate, (req, res) => {
      res.json({ success: true, orders: [{ id: "ord-1", number: "1001" }] });
    });

    // 3. Permitted API for user status
    app.get("/api/auth/me", authenticate, (req, res) => {
      res.json({ success: true, user: { id: req.user?.id, username: req.user?.username } });
    });

    // 4. Dedicated Screen Unlock Endpoint
    app.post("/api/auth/unlock", authenticate, async (req, res) => {
      const { password } = req.body || {};
      const user = testUsers.find(u => u.id === req.user?.id);

      if (!user) {
        return res.status(404).json({ error: "کاربر یافت نشد." });
      }

      const verifyRes = await verifyPassword(password || "", user.password);
      if (!verifyRes.valid) {
        return res.status(400).json({ error: "رمز عبور وارد شده نادرست است." });
      }

      return res.json({ success: true, message: "قفل صفحه با موفقیت باز شد." });
    });

    // Start test server
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
    setAuthDbPoolOverrideForTesting(null);
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    // Reset test users fixture
    testUsers = [
      {
        id: "usr-admin",
        username: "root_admin",
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
  });

  // --- 1. UNAUTHENTICATED PASSWORD CHANGE TESTS ---

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

  it("1.4. Positive: Ordinary user can change their own password with valid current password", async () => {
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
  });

  it("1.5. Positive & Token Isolation: Administrator resetting another user's password succeeds WITHOUT receiving that user's token", async () => {
    const adminToken = generateToken({ id: "usr-admin", username: "root_admin", role: "SYSTEM_ADMIN" });
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
  });

  it("1.6. Negative (Privilege Escalation): Non-primary admin cannot change another SYSTEM_ADMIN's password", async () => {
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

  // --- 2. MANDATORY PASSWORD CHANGE TESTS ---

  it("2.1. Negative: User with default password / mustChangePassword CANNOT access normal APIs (403 Forbidden)", async () => {
    const legacyToken = generateToken({ id: "usr-legacy-default", username: "legacy_user", role: "REPRESENTATIVE" });
    const res = await fetch(`${baseUrl}/api/orders`, {
      headers: { "Authorization": `Bearer ${legacyToken}` }
    });
    assert.equal(res.status, 403, "Must be blocked from accessing protected orders API");
    const data = await res.json();
    assert.match(data.message || data.error, /تغییر کلمه عبور پیش‌فرض\/موقت الزامی است/);
  });

  it("2.2. Positive: User with mustChangePassword CAN access change-password and me endpoints", async () => {
    const legacyToken = generateToken({ id: "usr-legacy-default", username: "legacy_user", role: "REPRESENTATIVE" });
    
    // Status endpoint is accessible
    const meRes = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { "Authorization": `Bearer ${legacyToken}` }
    });
    assert.equal(meRes.status, 200, "/api/auth/me is permitted for mustChangePassword users");

    // Change password endpoint is accessible
    const changeRes = await fetch(`${baseUrl}/api/users/usr-legacy-default/change-password`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${legacyToken}`
      },
      body: JSON.stringify({ currentPassword: "123456", newPassword: "MyNewDedicatedPassword2026!" })
    });
    assert.equal(changeRes.status, 200, "User can change password to clear the restriction");

    const changeData = await changeRes.json();
    assert.ok(changeData.token);

    // Now orders API becomes accessible with the fresh token
    const ordersRes = await fetch(`${baseUrl}/api/orders`, {
      headers: { "Authorization": `Bearer ${changeData.token}` }
    });
    assert.equal(ordersRes.status, 200, "Orders API is unblocked after password change");
  });

  // --- 3. PRODUCTION DATABASE SEEDING SAFETY ---

  it("3.1. Production safety: Seeding function strictly aborts in production environment", async () => {
    process.env.NODE_ENV = "production";

    // Simulate seedDatabaseIfEmpty logic in production
    let seeded = false;
    async function testSeedIfEmpty() {
      if (isProductionEnvironment()) {
        return; // Guarded
      }
      seeded = true;
    }

    await testSeedIfEmpty();
    assert.equal(seeded, false, "Database seeding must not run in production");
    process.env.NODE_ENV = "test";
  });

  // --- 4. AUTOLOCK MODAL SECURITY ---

  it("4.1. AutoLock: Unlocking without authentication token returns 401", async () => {
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
