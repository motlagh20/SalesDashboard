import { describe, it } from "node:test";
import assert from "node:assert/strict";
import crypto from "crypto";
import { generateToken, verifyToken, hasRole, normalizeRole, JWT_SECRET } from "../server/auth";
import { createOtp, verifyOtp, deleteOtp, getDevOtp, MAX_OTP_ATTEMPTS } from "../server/otp";
import { hashPassword, verifyPassword, isDefaultPassword, generateTemporaryPassword, isBcryptHash } from "../server/password";
import { sanitizeUser, sanitizeUsers } from "../server/sanitizer";

describe("Authentication & Security Unit Tests", () => {
  describe("1. Token Tamper-Proofing & Signature Verification (Unauthorized Access & Role Escalation)", () => {
    it("generates a valid signed JWT and successfully verifies it", () => {
      const user = { id: "usr-unit-1", username: "tester", role: "REPRESENTATIVE" };
      const token = generateToken(user, 3600);
      assert.ok(typeof token === "string" && token.split(".").length === 3, "Token must be a 3-part JWT");

      const verified = verifyToken(token);
      assert.ok(verified, "Token verification must succeed for valid token");
      assert.equal(verified?.userId, user.id);
      assert.equal(verified?.username, user.username);
      assert.equal(verified?.role, user.role);
    });

    it("rejects token when signature is altered or forged with invalid key (Role Escalation Attempt)", () => {
      const user = { id: "usr-attacker", username: "attacker", role: "REPRESENTATIVE" };
      const validToken = generateToken(user, 3600);
      const parts = validToken.split(".");

      // Attacker attempts to modify payload to elevate role to SYSTEM_ADMIN
      const forgedPayload = Buffer.from(
        JSON.stringify({
          userId: user.id,
          username: user.username,
          role: "SYSTEM_ADMIN", // Escalation attempt
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600
        })
      ).toString("base64url");

      const tamperedToken = `${parts[0]}.${forgedPayload}.${parts[2]}`;
      const result = verifyToken(tamperedToken);
      assert.equal(result, null, "Tampered payload with original signature must be rejected");

      // Attacker attempts to sign forged payload with a rogue secret
      const rogueSignature = crypto
        .createHmac("sha256", "rogue-secret-key-12345")
        .update(`${parts[0]}.${forgedPayload}`)
        .digest("base64url");
      const rogueToken = `${parts[0]}.${forgedPayload}.${rogueSignature}`;
      const rogueResult = verifyToken(rogueToken);
      assert.equal(rogueResult, null, "Forged token with wrong secret must be rejected");
    });

    it("rejects expired tokens (Unauthorized Access Prevention)", () => {
      const user = { id: "usr-expired", username: "expired_user", role: "SALES_MANAGER" };
      // Generate token that expired 10 seconds ago
      const expiredToken = generateToken(user, -10);
      const result = verifyToken(expiredToken);
      assert.equal(result, null, "Expired token must be rejected");
    });

    it("rejects malformed or empty token strings", () => {
      assert.equal(verifyToken(""), null);
      assert.equal(verifyToken("not-a-token"), null);
      assert.equal(verifyToken("header.payload"), null);
      assert.equal(verifyToken("..."), null);
    });
  });

  describe("2. Role-Based Access Control & Escalation Prevention (Forbidden Access)", () => {
    it("correctly normalizes roles and enforces role boundaries", () => {
      assert.equal(normalizeRole("ADMIN"), "SYSTEM_ADMIN");
      assert.equal(normalizeRole("FACTORY"), "FACTORY_TRANSPORT");
      assert.equal(normalizeRole("WAREHOUSE"), "PRODUCT_WAREHOUSE");
      assert.equal(normalizeRole("SECURITY"), "SECURITY_GATE");
      assert.equal(normalizeRole("AGENT"), "REPRESENTATIVE");
    });

    it("grants SYSTEM_ADMIN access to all protected actions", () => {
      assert.equal(hasRole("SYSTEM_ADMIN", ["SALES_MANAGER"]), true);
      assert.equal(hasRole("ADMIN", ["SALES_MANAGER"]), true);
      assert.equal(hasRole("SYSTEM_ADMIN", ["FACTORY_TRANSPORT", "PRODUCT_WAREHOUSE"]), true);
    });

    it("prevents lower-privileged roles from accessing restricted operations (Forbidden Access)", () => {
      // REPRESENTATIVE cannot access manager actions
      assert.equal(hasRole("REPRESENTATIVE", ["SALES_MANAGER", "SYSTEM_ADMIN"]), false);
      // FACTORY_TRANSPORT cannot access user management
      assert.equal(hasRole("FACTORY_TRANSPORT", ["SALES_MANAGER"]), false);
      // PRODUCT_WAREHOUSE cannot access sales operations
      assert.equal(hasRole("PRODUCT_WAREHOUSE", ["SALES_MANAGER"]), false);
      // GUEST has no operational permissions
      assert.equal(hasRole("GUEST", ["REPRESENTATIVE", "SALES_MANAGER"]), false);
    });

    it("resists role injection and corrupted role strings", () => {
      assert.equal(hasRole("SYSTEM_ADMIN; DROP TABLE users;--", ["SYSTEM_ADMIN"]), false);
      assert.equal(hasRole("ADMIN' OR '1'='1", ["SYSTEM_ADMIN"]), false);
      assert.equal(hasRole("", ["SALES_MANAGER"]), false);
    });
  });

  describe("3. OTP Lifecycle & Expiration Security", () => {
    const testPhone = "09129998877";

    it("creates an OTP with valid length and expiration window", () => {
      deleteOtp(testPhone);
      const { code, expiresIn } = createOtp(testPhone, "LOGIN");
      assert.ok(code.length >= 4 && code.length <= 8, "OTP code length must be 4-8 digits");
      assert.ok(/^\d+$/.test(code), "OTP must contain digits only");
      assert.ok(expiresIn > 0, "Expiry window must be positive");
    });

    it("rejects incorrect OTP codes with remaining attempts tracking", async () => {
      const { code } = createOtp(testPhone, "LOGIN");
      const wrongCode = code === "999999" ? "888888" : "999999";
      const result = await verifyOtp(testPhone, wrongCode, "LOGIN");
      assert.equal(result.success, false);
      assert.equal(result.reason, "INVALID");
      assert.ok(result.error.includes("نادرست است"), "Error message must indicate invalid code");
    });

    it("invalidates OTP after exceeding maximum allowed attempts (Brute-Force Protection)", async () => {
      const { code } = createOtp(testPhone, "LOGIN");
      const wrongCode = code === "111111" ? "222222" : "111111";

      // Attempt wrong code up to MAX_OTP_ATTEMPTS
      for (let i = 0; i < MAX_OTP_ATTEMPTS; i++) {
        await verifyOtp(testPhone, wrongCode, "LOGIN");
      }

      // Next attempt must trigger TOO_MANY_ATTEMPTS and code invalidation
      const result = await verifyOtp(testPhone, wrongCode, "LOGIN");
      assert.equal(result.success, false);
      assert.equal(result.reason, "TOO_MANY_ATTEMPTS");

      // Even correct code should now be rejected as code was deleted
      const attemptAfterLockout = await verifyOtp(testPhone, code, "LOGIN");
      assert.equal(attemptAfterLockout.success, false);
      assert.equal(attemptAfterLockout.reason, "NOT_FOUND");
    });

    it("enforces single-use OTP: consumption immediately deletes the code", async () => {
      const { code } = createOtp(testPhone, "LOGIN");
      const firstAttempt = await verifyOtp(testPhone, code, "LOGIN");
      assert.equal(firstAttempt.success, true, "First verification must succeed");

      // Replay attack attempt
      const replayAttempt = await verifyOtp(testPhone, code, "LOGIN");
      assert.equal(replayAttempt.success, false, "Replay verification must be rejected");
      assert.equal(replayAttempt.reason, "NOT_FOUND");
    });

    it("isolates OTP codes between LOGIN and PASSWORD_RESET purposes", async () => {
      const loginOtp = createOtp(testPhone, "LOGIN");
      // Trying to use LOGIN OTP for PASSWORD_RESET must fail
      const resetAttempt = await verifyOtp(testPhone, loginOtp.code, "PASSWORD_RESET");
      assert.equal(resetAttempt.success, false);
      assert.equal(resetAttempt.reason, "NOT_FOUND");
    });
  });

  describe("4. Password Security & Temporary Password Generation (User Creation)", () => {
    it("generates strong temporary passwords that never equal default weak passwords", () => {
      for (let i = 0; i < 20; i++) {
        const tempPass = generateTemporaryPassword(12);
        assert.ok(tempPass.length >= 12, "Temporary password must be at least 12 characters");
        assert.equal(isDefaultPassword(tempPass), false, "Temporary password must never be a known default password");
        assert.notEqual(tempPass, "123456", "Temporary password must never be 123456");
        assert.ok(/[A-Z]/.test(tempPass), "Must contain uppercase letter");
        assert.ok(/[a-z]/.test(tempPass), "Must contain lowercase letter");
        assert.ok(/[0-9]/.test(tempPass), "Must contain digit");
        assert.ok(/[!@#$%*]/.test(tempPass), "Must contain special symbol");
      }
    });

    it("identifies known default and weak passwords", () => {
      assert.equal(isDefaultPassword("123456"), true);
      assert.equal(isDefaultPassword("1234"), true);
      assert.equal(isDefaultPassword("password"), true);
      assert.equal(isDefaultPassword("admin"), true);
      assert.equal(isDefaultPassword("StrongRandomP@ssw0rd!"), false);
    });

    it("hashes passwords with bcrypt and verifies them securely", async () => {
      const plain = "MyS3cur3P@ssw0rd!";
      const hash = await hashPassword(plain);
      assert.ok(isBcryptHash(hash), "Hash must match bcrypt signature");

      const matchResult = await verifyPassword(plain, hash);
      assert.equal(matchResult.valid, true);

      const wrongResult = await verifyPassword("WrongPassword123", hash);
      assert.equal(wrongResult.valid, false);
    });
  });

  describe("5. Sensitive Field Exposure Prevention (Sanitizer)", () => {
    it("completely strips passwords, password hashes, and tokens from user records", () => {
      const rawUser = {
        id: "usr-test-99",
        username: "sensitive_user",
        fullName: "کاربر تستی محرمانه",
        phoneNumber: "09121112233",
        role: "REPRESENTATIVE",
        agentCode: "AG-100",
        shippingCompanyId: null,
        isEnabled: 1,
        password: "$2b$10$sbAiNKtvI9W8dG3cqcuzZ.qWHiiNC01U.mxdZeLCBgYxjbIH/EKc.",
        salt: "internal_salt_value",
        token: "session_token_12345",
        secretKey: "super_secret",
        mustChangePassword: 1
      };

      const publicUser = sanitizeUser(rawUser);

      // Verify required fields are preserved
      assert.equal(publicUser.id, rawUser.id);
      assert.equal(publicUser.username, rawUser.username);
      assert.equal(publicUser.fullName, rawUser.fullName);
      assert.equal(publicUser.phoneNumber, rawUser.phoneNumber);
      assert.equal(publicUser.role, rawUser.role);
      assert.equal(publicUser.isEnabled, true);
      assert.equal(publicUser.mustChangePassword, true);

      // Verify sensitive fields are strictly omitted
      assert.equal((publicUser as any).password, undefined, "password must be stripped");
      assert.equal((publicUser as any).salt, undefined, "salt must be stripped");
      assert.equal((publicUser as any).token, undefined, "token must be stripped");
      assert.equal((publicUser as any).secretKey, undefined, "secretKey must be stripped");

      // Verify JSON serialization contains no trace of bcrypt hash
      const serialized = JSON.stringify(publicUser);
      assert.ok(!serialized.includes("$2b$"), "Serialized JSON must never leak bcrypt hash");
      assert.ok(!serialized.includes("internal_salt"), "Serialized JSON must not contain salt");
    });

    it("sanitizes arrays of users consistently", () => {
      const rawList = [
        { id: "u1", username: "admin", password: "$2b$10$hash1", role: "SYSTEM_ADMIN" },
        { id: "u2", username: "rep", password: "$2b$10$hash2", role: "REPRESENTATIVE" }
      ];

      const cleanList = sanitizeUsers(rawList);
      assert.equal(cleanList.length, 2);
      for (const u of cleanList) {
        assert.equal((u as any).password, undefined);
      }
      const jsonStr = JSON.stringify(cleanList);
      assert.ok(!jsonStr.includes("$2b$"), "List JSON must not contain hashes");
    });
  });
});
