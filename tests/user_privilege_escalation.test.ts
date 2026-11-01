import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { generateToken, isPrimaryAdmin, isValidRole } from "../server/auth";

const BASE_URL = process.env.TEST_API_URL || "http://127.0.0.1:3000";

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

describe("User Management Privilege Escalation & Role Security Tests", () => {
  // Tokens for authenticated actors
  // Primary Admin (usr-0, role: SYSTEM_ADMIN)
  const adminToken = generateToken({ id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" });
  // Sales Manager (usr-1, role: SALES_MANAGER)
  const managerToken = generateToken({ id: "usr-1", username: "manager", role: "SALES_MANAGER" });
  // Representative (usr-2, role: REPRESENTATIVE)
  const repToken = generateToken({ id: "usr-2", username: "rep_tehran", role: "REPRESENTATIVE" });

  describe("1. Unit Authorization Helpers", () => {
    it("correctly identifies primary administrator account by ID or username", () => {
      assert.equal(isPrimaryAdmin({ id: "usr-0", username: "admin" }), true);
      assert.equal(isPrimaryAdmin({ id: "USR-0", username: "admin" }), true);
      assert.equal(isPrimaryAdmin({ id: "usr-0", username: "other" }), true);
      assert.equal(isPrimaryAdmin({ id: "usr-99", username: "admin" }), true);
      assert.equal(isPrimaryAdmin({ id: "usr-1", username: "manager" }), false);
      assert.equal(isPrimaryAdmin(null), false);
      assert.equal(isPrimaryAdmin(undefined), false);
    });

    it("strictly validates allowed system user roles", () => {
      assert.equal(isValidRole("SYSTEM_ADMIN"), true);
      assert.equal(isValidRole("ADMIN"), true); // Normalized to SYSTEM_ADMIN
      assert.equal(isValidRole("SALES_MANAGER"), true);
      assert.equal(isValidRole("REPRESENTATIVE"), true);
      assert.equal(isValidRole("SHIPPING_COMPANY"), true);
      assert.equal(isValidRole("FACTORY_TRANSPORT"), true);
      assert.equal(isValidRole("PRODUCT_WAREHOUSE"), true);
      assert.equal(isValidRole("SECURITY_GATE"), true);

      // Disallowed/unknown roles
      assert.equal(isValidRole("SUPER_USER"), false);
      assert.equal(isValidRole("ROOT"), false);
      assert.equal(isValidRole("HACKER"), false);
      assert.equal(isValidRole(""), false);
    });
  });

  describe("2. Self-Promotion Prevention", () => {
    it("prevents SALES_MANAGER from promoting themselves to SYSTEM_ADMIN via PUT", async () => {
      const res = await apiRequest("/api/users/usr-1", {
        method: "PUT",
        token: managerToken,
        body: {
          role: "SYSTEM_ADMIN"
        }
      });
      assert.equal(res.status, 403, "Self-promotion to SYSTEM_ADMIN must return 403 Forbidden");

      // Verify role was not escalated in database
      const check = await apiRequest("/api/auth/me", { token: managerToken });
      assert.equal(check.status, 200);
      assert.equal(check.data.user.role, "SALES_MANAGER", "Role in database must remain SALES_MANAGER");
    });
  });

  describe("3. Promoting Another User Prevention", () => {
    it("prevents SALES_MANAGER from promoting a REPRESENTATIVE to SYSTEM_ADMIN via PUT", async () => {
      const res = await apiRequest("/api/users/usr-2", {
        method: "PUT",
        token: managerToken,
        body: {
          role: "SYSTEM_ADMIN"
        }
      });
      assert.equal(res.status, 403, "Promoting user to SYSTEM_ADMIN by manager must return 403 Forbidden");
    });

    it("prevents SALES_MANAGER from creating a new user with SYSTEM_ADMIN role via POST", async () => {
      const res = await apiRequest("/api/users", {
        method: "POST",
        token: managerToken,
        body: {
          username: "fake_admin_user",
          fullName: "جعل کننده ادمین",
          phoneNumber: "09129990001",
          role: "SYSTEM_ADMIN",
          password: "SecurePassword123!"
        }
      });
      assert.equal(res.status, 403, "Manager creating SYSTEM_ADMIN account must return 403 Forbidden");
    });
  });

  describe("4. Protecting SYSTEM_ADMIN Accounts from SALES_MANAGER Modification", () => {
    it("prevents SALES_MANAGER from updating primary administrator details via PUT", async () => {
      const res = await apiRequest("/api/users/usr-0", {
        method: "PUT",
        token: managerToken,
        body: {
          fullName: "تغییر نام ادمین توسط مدیر فروش",
          phoneNumber: "09129998877"
        }
      });
      assert.equal(res.status, 403, "Manager editing admin account must return 403 Forbidden");
    });

    it("prevents SALES_MANAGER from changing primary administrator password", async () => {
      const res = await apiRequest("/api/users/usr-0/change-password", {
        method: "POST",
        token: managerToken,
        body: {
          currentPassword: "some-password",
          newPassword: "NewHackedPassword123!"
        }
      });
      assert.equal(res.status, 403, "Manager changing admin password must return 403 Forbidden");
    });

    it("prevents SALES_MANAGER from changing primary administrator phone number via profile endpoint", async () => {
      const res = await apiRequest("/api/users/usr-0/profile", {
        method: "POST",
        token: managerToken,
        body: {
          phoneNumber: "09129997766"
        }
      });
      assert.equal(res.status, 403, "Manager changing admin phone must return 403 Forbidden");
    });

    it("prevents SALES_MANAGER from disabling primary administrator account via toggle", async () => {
      const res = await apiRequest("/api/users/usr-0/toggle", {
        method: "PATCH",
        token: managerToken
      });
      assert.equal(res.status, 403, "Manager disabling admin account must return 403 Forbidden");
    });

    it("prevents SALES_MANAGER from deleting primary administrator account via DELETE", async () => {
      const res = await apiRequest("/api/users/usr-0", {
        method: "DELETE",
        token: managerToken
      });
      assert.equal(res.status, 403, "Manager deleting admin account must return 403 Forbidden");
    });
  });

  describe("5. Protecting Primary Administrator Account from Deletion or Demotion", () => {
    it("prevents even a SYSTEM_ADMIN from demoting primary administrator away from SYSTEM_ADMIN", async () => {
      const res = await apiRequest("/api/users/usr-0", {
        method: "PUT",
        token: adminToken,
        body: {
          role: "SALES_MANAGER"
        }
      });
      assert.equal(res.status, 403, "Demoting primary admin must return 403 Forbidden");
    });

    it("prevents renaming primary administrator username away from 'admin'", async () => {
      const res = await apiRequest("/api/users/usr-0", {
        method: "PUT",
        token: adminToken,
        body: {
          username: "renamed_root_admin"
        }
      });
      assert.equal(res.status, 403, "Renaming primary admin must return 403 Forbidden");
    });

    it("prevents even a SYSTEM_ADMIN from disabling primary administrator via toggle", async () => {
      const res = await apiRequest("/api/users/usr-0/toggle", {
        method: "PATCH",
        token: adminToken
      });
      assert.equal(res.status, 403, "Disabling primary admin must return 403 Forbidden");
    });

    it("prevents even a SYSTEM_ADMIN from deleting primary administrator account", async () => {
      const res = await apiRequest("/api/users/usr-0", {
        method: "DELETE",
        token: adminToken
      });
      assert.equal(res.status, 403, "Deleting primary admin must return 403 Forbidden");
    });
  });

  describe("6. Role Transitions & Mass-Assignment Defenses", () => {
    it("rejects invalid role with 400 Bad Request", async () => {
      const res = await apiRequest("/api/users/usr-2", {
        method: "PUT",
        token: managerToken,
        body: {
          role: "SUPER_GOD_ROLE"
        }
      });
      assert.equal(res.status, 400, "Invalid role must return 400 Bad Request");
    });

    it("preserves existing fields when updates omit some fields (partial updates)", async () => {
      // Manager updates ONLY fullName of rep_tehran (usr-2)
      const res = await apiRequest("/api/users/usr-2", {
        method: "PUT",
        token: managerToken,
        body: {
          fullName: "حمیدرضا احمدی (بروزرسانی تستی)"
        }
      });
      assert.equal(res.status, 200, "Partial update must succeed");

      // Verify other fields (username, role, agentCode) were preserved
      const usersList = await apiRequest("/api/users", { token: managerToken });
      assert.equal(usersList.status, 200);
      const repUser = usersList.data.find((u: any) => u.id === "usr-2");
      assert.ok(repUser);
      assert.equal(repUser.fullName, "حمیدرضا احمدی (بروزرسانی تستی)");
      assert.equal(repUser.role, "REPRESENTATIVE");
      assert.equal(repUser.agentCode, "AG-9081");
      assert.equal(repUser.username, "rep_tehran");
    });

    it("ignores injected mass-assignment parameters in POST /api/users", async () => {
      const randomPhone = `0919${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res = await apiRequest("/api/users", {
        method: "POST",
        token: managerToken,
        body: {
          id: "usr-hacked-custom-id", // Injected ID attempt
          username: `mass_rep_${Date.now()}`,
          fullName: "نماینده تستی",
          phoneNumber: randomPhone,
          role: "REPRESENTATIVE",
          agentCode: "AG-TEST-1",
          isEnabled: 0, // Attempt to create disabled
          mustChangePassword: 0, // Attempt to bypass password change
          lastSeenAt: "2099-01-01T00:00:00Z" // Injected internal metadata
        }
      });
      assert.equal(res.status, 201);
      assert.notEqual(res.data.user.id, "usr-hacked-custom-id", "Server must generate internal ID");
      assert.equal(res.data.user.isEnabled, true, "New accounts must default to enabled");
    });
  });

  describe("7. Legitimate Permitted Management Operations", () => {
    let createdRepId: string;
    let createdScId: string;
    let secondaryAdminId: string;

    it("allows SALES_MANAGER to legitimately create a REPRESENTATIVE account", async () => {
      const randomPhone = `0918${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res = await apiRequest("/api/users", {
        method: "POST",
        token: managerToken,
        body: {
          username: `legit_rep_${Date.now()}`,
          fullName: "نمایندگی رسمی تبریز",
          phoneNumber: randomPhone,
          role: "REPRESENTATIVE",
          agentCode: "AG-4022",
          password: "SecurePass123!"
        }
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.user.role, "REPRESENTATIVE");
      createdRepId = res.data.user.id;
    });

    it("allows SALES_MANAGER to legitimately create a SHIPPING_COMPANY account", async () => {
      const randomPhone = `0916${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res = await apiRequest("/api/users", {
        method: "POST",
        token: managerToken,
        body: {
          username: `legit_sc_${Date.now()}`,
          fullName: "شرکت حمل و نقل باران شمال",
          phoneNumber: randomPhone,
          role: "SHIPPING_COMPANY",
          shippingCompanyId: "sc-1",
          password: "SecurePass123!"
        }
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.user.role, "SHIPPING_COMPANY");
      createdScId = res.data.user.id;
    });

    it("allows SALES_MANAGER to toggle active status of a representative account", async () => {
      const res = await apiRequest(`/api/users/${createdRepId}/toggle`, {
        method: "PATCH",
        token: managerToken
      });
      assert.equal(res.status, 200);
      assert.equal(res.data.success, true);
    });

    it("allows SYSTEM_ADMIN to create and manage a secondary SYSTEM_ADMIN account", async () => {
      const randomPhone = `0915${Math.floor(1000000 + Math.random() * 9000000)}`;
      const res = await apiRequest("/api/users", {
        method: "POST",
        token: adminToken,
        body: {
          username: `sec_admin_${Date.now()}`,
          fullName: "ادمین جانشین واحد فناوری",
          phoneNumber: randomPhone,
          role: "SYSTEM_ADMIN",
          password: "AdminSuperSecret2026!"
        }
      });
      assert.equal(res.status, 201);
      assert.equal(res.data.user.role, "SYSTEM_ADMIN");
      secondaryAdminId = res.data.user.id;

      // Primary admin can update the secondary admin
      const updateRes = await apiRequest(`/api/users/${secondaryAdminId}`, {
        method: "PUT",
        token: adminToken,
        body: {
          fullName: "ادمین جانشین فناوری (بروزرسانی شد)"
        }
      });
      assert.equal(updateRes.status, 200);

      // But SALES_MANAGER CANNOT modify this secondary admin
      const managerAttack = await apiRequest(`/api/users/${secondaryAdminId}`, {
        method: "PUT",
        token: managerToken,
        body: {
          fullName: "تلاش مدیر فروش برای تغییر ادمین دوم"
        }
      });
      assert.equal(managerAttack.status, 403, "Sales Manager cannot modify any SYSTEM_ADMIN account");
    });
  });
});
