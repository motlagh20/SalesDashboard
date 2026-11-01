import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "http";
import fs from "fs";
import path from "path";
import { generateToken } from "../server/auth";
import { isProductionEnvironment } from "../server/database";
import { isDefaultPassword, hashPasswordSync } from "../server/password";

describe("Production Sandbox Elimination Security Test Suite", () => {
  let app: express.Express;
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  // Track original environment variables
  const originalNodeEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;

  // Dedicated test sandbox file
  const testDataDir = path.join(process.cwd(), "data");
  const testSandboxConfigFile = path.join(testDataDir, "sandbox_config.json");
  let originalConfigContent: string | null = null;

  before(async () => {
    // Preserve any existing sandbox config file
    if (fs.existsSync(testSandboxConfigFile)) {
      originalConfigContent = fs.readFileSync(testSandboxConfigFile, "utf-8");
    }

    // Set JWT secret for tests
    process.env.JWT_SECRET = "production-sandbox-test-jwt-secret-minimum-32-chars-long";

    // Setup an Express test app mirroring server.ts sandbox and login logic
    app = express();
    app.use(express.json());

    // Helper for simulating sandbox status routes exactly as in server.ts
    app.get("/api/system/sandbox-status", (req, res) => {
      const isProd = isProductionEnvironment();
      if (isProd) {
        return res.json({ sandboxEnabled: false, isProduction: true });
      }

      let enabled = false;
      try {
        if (fs.existsSync(testSandboxConfigFile)) {
          const data = JSON.parse(fs.readFileSync(testSandboxConfigFile, "utf-8"));
          if (typeof data.sandboxEnabled === "boolean") {
            enabled = data.sandboxEnabled;
          }
        }
      } catch {
        enabled = false;
      }

      return res.json({ sandboxEnabled: enabled, isProduction: false });
    });

    app.post("/api/system/sandbox-status", (req, res) => {
      const isProd = isProductionEnvironment();
      if (isProd) {
        return res.status(403).json({
          error: "امکان فعال‌سازی حالت شبیه‌ساز (Sandbox) در محیط عملیاتی به دلایل امنیتی وجود ندارد."
        });
      }

      const { sandboxEnabled } = req.body || {};
      if (typeof sandboxEnabled !== "boolean") {
        return res.status(400).json({ error: "مقدار وضعیت سندباکس باید مقدار بولی باشد." });
      }

      try {
        if (!fs.existsSync(testDataDir)) {
          fs.mkdirSync(testDataDir, { recursive: true });
        }
        fs.writeFileSync(testSandboxConfigFile, JSON.stringify({ sandboxEnabled }), "utf-8");
      } catch {}

      return res.json({ success: true, sandboxEnabled, isProduction: false });
    });

    // Mock Login endpoint mirroring server.ts production guards
    app.post("/api/auth/login-password", (req, res) => {
      const isProd = isProductionEnvironment();
      const { loginKey, password, isSandbox, isQuickLogin, shortcut } = req.body || {};

      // Guard 1: Sandbox shortcut flag
      if (isSandbox || isQuickLogin || shortcut) {
        if (isProd) {
          return res.status(403).json({
            error: "ورود از طریق میانبر آزمایشی (سندباکس) در این محیط غیرفعال و مسدود است."
          });
        }
      }

      // Guard 2: Default/demo password in production
      if (isProd && isDefaultPassword(password)) {
        return res.status(403).json({
          error: "ورود با کلمه عبور پیش‌فرض/دمو در محیط عملیاتی مسدود است. لطفاً از طریق احراز هویت پیامکی اقدام به ورود و تعیین رمز عبور اختصاصی فرمایید."
        });
      }

      // Legitimate mock user verification
      if (loginKey === "admin" && password === "RealSecretPass2026!") {
        const token = generateToken({ id: "usr-admin", username: "admin", role: "SYSTEM_ADMIN" });
        return res.json({ success: true, token, user: { username: "admin", role: "SYSTEM_ADMIN" } });
      }

      if (loginKey === "rep_tehran" && password === "RealRepPassword123!") {
        const token = generateToken({ id: "usr-rep", username: "rep_tehran", role: "REPRESENTATIVE" });
        return res.json({ success: true, token, user: { username: "rep_tehran", role: "REPRESENTATIVE" } });
      }

      // In dev mode with default password allowed
      if (!isProd && password === "123456") {
        const token = generateToken({ id: "usr-dev", username: loginKey, role: "REPRESENTATIVE" });
        return res.json({ success: true, token, mustChangePassword: true });
      }

      return res.status(400).json({ error: "رمز عبور نادرست است." });
    });

    // Start HTTP server on dynamic port
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
    // Restore environment
    process.env.NODE_ENV = originalNodeEnv;
    process.env.APP_ENV = originalAppEnv;

    // Restore config file
    if (originalConfigContent !== null) {
      fs.writeFileSync(testSandboxConfigFile, originalConfigContent, "utf-8");
    } else if (fs.existsSync(testSandboxConfigFile)) {
      try {
        fs.unlinkSync(testSandboxConfigFile);
      } catch {}
    }

    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    // Reset NODE_ENV to production by default for safety
    process.env.NODE_ENV = "production";
    delete process.env.APP_ENV;
  });

  it("1. Unauthenticated access: GET /api/system/sandbox-status responds without requiring authentication", async () => {
    const res = await fetch(`${baseUrl}/api/system/sandbox-status`);
    assert.equal(res.status, 200, "Must be accessible without token or auth cookie");
    const data = await res.json();
    assert.equal(typeof data.sandboxEnabled, "boolean");
  });

  it("2. Production with missing config: fails closed and returns sandboxEnabled: false", async () => {
    process.env.NODE_ENV = "production";
    if (fs.existsSync(testSandboxConfigFile)) {
      try { fs.unlinkSync(testSandboxConfigFile); } catch {}
    }

    const res = await fetch(`${baseUrl}/api/system/sandbox-status`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.sandboxEnabled, false, "Missing configuration in production must fail closed to false");
    assert.equal(data.isProduction, true);
  });

  it("3. Production with config file explicitly set to true: strictly ignored and returns sandboxEnabled: false", async () => {
    process.env.NODE_ENV = "production";
    if (!fs.existsSync(testDataDir)) {
      fs.mkdirSync(testDataDir, { recursive: true });
    }
    fs.writeFileSync(testSandboxConfigFile, JSON.stringify({ sandboxEnabled: true }), "utf-8");

    const res = await fetch(`${baseUrl}/api/system/sandbox-status`);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.sandboxEnabled, false, "Production must ignore sandboxEnabled: true in config file");
    assert.equal(data.isProduction, true);
  });

  it("4. Production: POST /api/system/sandbox-status strictly returns 403 Forbidden", async () => {
    process.env.NODE_ENV = "production";

    const res = await fetch(`${baseUrl}/api/system/sandbox-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sandboxEnabled: true })
    });

    assert.equal(res.status, 403, "Production must reject enabling sandbox with 403 Forbidden");
    const data = await res.json();
    assert.match(data.error, /محیط عملیاتی/);
  });

  it("5. Production: Attempting to login with demo quick-login shortcut flag is blocked with 403 Forbidden", async () => {
    process.env.NODE_ENV = "production";

    const res = await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginKey: "admin", password: "RealSecretPass2026!", isSandbox: true })
    });

    assert.equal(res.status, 403);
    const data = await res.json();
    assert.match(data.error, /میانبر آزمایشی/);
  });

  it("6. Production: Attempting to login with hardcoded demo default password '123456' is blocked with 403 Forbidden", async () => {
    process.env.NODE_ENV = "production";

    const demoUsers = ["admin", "manager", "rep_tehran", "factory", "shipping_transit", "warehouse", "security_gate"];
    for (const username of demoUsers) {
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
      assert.match(data.error, /پیش‌فرض\/دمو/);
    }
  });

  it("7. Production: Legitimate accounts with custom strong passwords authenticate successfully", async () => {
    process.env.NODE_ENV = "production";

    const res = await fetch(`${baseUrl}/api/auth/login-password`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ loginKey: "admin", password: "RealSecretPass2026!" })
    });

    assert.equal(res.status, 200, "Legitimate password authentication must succeed in production");
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.token, "JWT token must be returned");
  });

  it("8. Development environment: sandbox status can be checked and updated when permitted", async () => {
    process.env.NODE_ENV = "development";

    // Enable sandbox in development
    const postRes = await fetch(`${baseUrl}/api/system/sandbox-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sandboxEnabled: true })
    });
    assert.equal(postRes.status, 200);

    const getRes = await fetch(`${baseUrl}/api/system/sandbox-status`);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.sandboxEnabled, true, "Development allows enabling sandbox");
    assert.equal(getData.isProduction, false);

    // Disable sandbox in development
    const disableRes = await fetch(`${baseUrl}/api/system/sandbox-status`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sandboxEnabled: false })
    });
    assert.equal(disableRes.status, 200);

    const getRes2 = await fetch(`${baseUrl}/api/system/sandbox-status`);
    const getData2 = await getRes2.json();
    assert.equal(getData2.sandboxEnabled, false);
  });

  it("9. Frontend state logic: Fresh browser with empty/invalid localStorage defaults to false", () => {
    // Simulate browser localStorage resolution logic from App.tsx
    function resolveSandboxState(mockStorage: Record<string, string | null>, isProd: boolean) {
      if (isProd) return false;
      try {
        const saved = mockStorage["tabarestan_sandbox_enabled"];
        return saved !== null && saved !== undefined ? JSON.parse(saved) === true : false;
      } catch {
        return false;
      }
    }

    // A. Fresh browser (empty localStorage)
    assert.equal(resolveSandboxState({}, false), false, "Fresh browser must default to false");
    assert.equal(resolveSandboxState({}, true), false, "Fresh browser in production must default to false");

    // B. Production environment with localStorage set to true (must strictly be ignored)
    assert.equal(
      resolveSandboxState({ tabarestan_sandbox_enabled: "true" }, true),
      false,
      "localStorage cannot enable sandbox in production"
    );

    // C. Corrupted or invalid localStorage value
    assert.equal(resolveSandboxState({ tabarestan_sandbox_enabled: "invalid-json{" }, false), false);
    assert.equal(resolveSandboxState({ tabarestan_sandbox_enabled: "null" }, false), false);
    assert.equal(resolveSandboxState({ tabarestan_sandbox_enabled: "123" }, false), false);

    // D. Development environment with valid true
    assert.equal(resolveSandboxState({ tabarestan_sandbox_enabled: "true" }, false), true);
  });
});
