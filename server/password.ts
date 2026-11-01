import bcrypt from "bcryptjs";
import crypto from "crypto";

// Standard bcrypt hash verification regex ($2a$, $2b$, or $2y$, with 2 cost digits)
const BCRYPT_HASH_REGEX = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/;

// Known weak/default passwords
const DEFAULT_PASSWORDS = new Set(["123456", "12345678", "1234", "password", "admin", "12345"]);

// Canonical bcrypt hash for default "123456" password (cost factor 10)
export const DEFAULT_PASSWORD_BCRYPT_HASH = "$2b$10$sbAiNKtvI9W8dG3cqcuzZ.qWHiiNC01U.mxdZeLCBgYxjbIH/EKc.";

/**
 * Generates a cryptographically secure temporary random password.
 * Format: 12 mixed alphanumeric & special characters.
 * Guarantees that the generated password is never a fixed or default password.
 */
export function generateTemporaryPassword(length: number = 12): string {
  const upper = "ABCDEFGHJKLMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const special = "!@#$%*";
  const allChars = upper + lower + digits + special;

  let pwd = "";
  pwd += upper[crypto.randomInt(0, upper.length)];
  pwd += lower[crypto.randomInt(0, lower.length)];
  pwd += digits[crypto.randomInt(0, digits.length)];
  pwd += special[crypto.randomInt(0, special.length)];

  const randomBytes = crypto.randomBytes(length - 4);
  for (let i = 0; i < length - 4; i++) {
    pwd += allChars[randomBytes[i] % allChars.length];
  }

  // Shuffle characters to avoid fixed positions
  const arr = pwd.split("");
  for (let i = arr.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const result = arr.join("");

  // Defense-in-depth: Ensure it never matches any known weak password
  if (isDefaultPassword(result)) {
    return generateTemporaryPassword(length);
  }
  return result;
}

/**
 * Checks whether a string is already a valid bcrypt hash
 */
export function isBcryptHash(str: string): boolean {
  if (typeof str !== "string") return false;
  return BCRYPT_HASH_REGEX.test(str.trim());
}

/**
 * Hashes a plain-text password using bcrypt with standard cost factor 10
 */
export async function hashPassword(plainPassword: string): Promise<string> {
  const cleanPass = String(plainPassword || "").trim();
  return bcrypt.hash(cleanPass, 10);
}

/**
 * Hashes a plain-text password synchronously
 */
export function hashPasswordSync(plainPassword: string): string {
  const cleanPass = String(plainPassword || "").trim();
  return bcrypt.hashSync(cleanPass, 10);
}

/**
 * Normalizes Persian and Arabic numerals to standard Latin digits (0-9).
 */
export function normalizeDigits(str: string): string {
  if (!str) return str;
  return str
    .replace(/[۰-۹]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1776 + 48))
    .replace(/[٠-٩]/g, (d) => String.fromCharCode(d.charCodeAt(0) - 1632 + 48));
}

/**
 * Verifies a plain-text password against a stored database password.
 * - If stored password is a bcrypt hash, verifies using bcrypt.compare()
 * - Also checks Persian/Arabic digit normalization if typed with Persian keyboard layout
 * - If stored password is legacy plain-text, checks equality and flags needsMigration: true
 */
export async function verifyPassword(
  plainPassword: string,
  storedPassword: string
): Promise<{ valid: boolean; needsMigration: boolean }> {
  if (!plainPassword || !storedPassword) {
    return { valid: false, needsMigration: false };
  }

  const cleanInput = String(plainPassword).trim();
  const normalizedInput = normalizeDigits(cleanInput);
  const stored = String(storedPassword).trim();

  if (isBcryptHash(stored)) {
    let valid = await bcrypt.compare(cleanInput, stored);
    if (!valid && normalizedInput !== cleanInput) {
      valid = await bcrypt.compare(normalizedInput, stored);
    }
    return { valid, needsMigration: false };
  }

  // Safe backward-compatible check for legacy plain-text password
  const valid = cleanInput === stored || normalizedInput === stored;
  return { valid, needsMigration: valid };
}

/**
 * Checks whether a plain text password is a default weak password like "123456"
 */
export function isDefaultPassword(password: string): boolean {
  if (!password) return false;
  const val = String(password).trim().toLowerCase();
  const normalized = normalizeDigits(val);
  return DEFAULT_PASSWORDS.has(val) || DEFAULT_PASSWORDS.has(normalized);
}

/**
 * Checks whether a password (either plain text or bcrypt hash) represents a default password
 */
export function isDefaultPasswordOrMatches(plainOrHash: string): boolean {
  if (!plainOrHash) return false;
  const val = String(plainOrHash).trim();
  if (isDefaultPassword(val)) return true;
  if (isBcryptHash(val)) {
    try {
      return bcrypt.compareSync("123456", val);
    } catch {
      return false;
    }
  }
  return false;
}

/**
 * Migrates any legacy plain-text passwords in the database to bcrypt hashes upon startup
 */
export async function migrateDatabasePasswords(db: any): Promise<number> {
  let migratedCount = 0;
  try {
    const [rows] = await db.query("SELECT id, username, password FROM app_users");
    const users = (rows as any[]) || [];

    for (const u of users) {
      if (u.password && !isBcryptHash(u.password)) {
        const hashed = await hashPassword(u.password);
        await db.query("UPDATE app_users SET password = ? WHERE id = ?", [hashed, u.id]);
        migratedCount++;
      }
    }

    if (migratedCount > 0) {
      console.log(`🔒 [Security Migration] Successfully migrated ${migratedCount} plain-text passwords to bcrypt hashes.`);
    }
  } catch (err: any) {
    console.error("⚠️ [Security Migration Error] Failed to migrate passwords:", err.message);
  }
  return migratedCount;
}
