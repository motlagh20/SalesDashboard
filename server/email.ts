import fs from "fs";
import path from "path";
import crypto from "crypto";
import https from "https";
import dns from "dns";
import net from "net";
import nodemailer from "nodemailer";
import { EmailProviderType, EmailSettings, WebhookProviderAdapter } from "../src/types";

export interface EmailRecord {
  to: string;
  subject: string;
  html: string;
  text?: string;
  sentAt: number;
}

export interface EmailDiagnosticResult {
  success: boolean;
  message: string;
  timestamp: string;
  provider: EmailProviderType;
  logs: string[];
  messageId?: string;
}

export interface EncryptedSecretPayload {
  v: 1;
  alg: "aes-256-gcm";
  iv: string;
  tag: string;
  data: string;
}

interface StoredEmailSettings {
  providerType: EmailProviderType;
  isEnabled: boolean;
  senderName: string;
  senderEmail: string;
  allowPasswordReset: boolean;
  allowNotifications: boolean;
  smtpHost: string;
  smtpPort: number;
  smtpSecure: boolean;
  smtpUser: string;
  smtpPasswordEncrypted?: EncryptedSecretPayload | null;
  // Legacy plaintext field (auto-migrated when key is present; never written back)
  smtpPassword?: string;
  webhookProvider: WebhookProviderAdapter;
  apiUrl: string;
  apiKeyEncrypted?: EncryptedSecretPayload | null;
  // Legacy plaintext field (auto-migrated when key is present; never written back)
  apiKey?: string;
  apiMethod: "POST" | "PUT";
  customHeaders: string;
}

export class EmailEncryptionError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "EmailEncryptionError";
    this.statusCode = statusCode;
  }
}

export class EmailValidationError extends Error {
  public statusCode: number;
  constructor(message: string, statusCode = 400) {
    super(message);
    this.name = "EmailValidationError";
    this.statusCode = statusCode;
  }
}

export const EMAIL_OTP_EXPIRY_SECONDS = 300; // 5 minutes
export const EMAIL_OTP_COOLDOWN_SECONDS = 60; // 1 minute resend cooldown
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_MAX_REQUESTS_PER_WINDOW = 5;
export const EMAIL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const WEBHOOK_MAX_RESPONSE_BYTES = 64 * 1024; // 64 KB cap
export const WEBHOOK_TIMEOUT_MS = 10000;

const DEFAULT_SETTINGS_FILE_PATH = path.join(process.cwd(), "server", "email_settings.json");

const defaultEmailSettings: EmailSettings = {
  providerType: "SMTP",
  isEnabled: false,
  senderName: "سامانه مدیریت فروش",
  senderEmail: "noreply@company.com",
  allowPasswordReset: true,
  allowNotifications: true,
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPassword: "",
  passwordConfigured: false,
  webhookProvider: "GENERIC",
  apiUrl: "",
  apiKey: "",
  apiKeyConfigured: false,
  apiMethod: "POST",
  customHeaders: ""
};

// Testing / harness overrides (never used in production flows unless explicitly injected by test harness)
let settingsFilePathOverride: string | null = null;
let encryptionKeyOverride: string | null | undefined = undefined;
let dnsLookupOverride: ((hostname: string) => Promise<Array<{ address: string; family: number }>>) | null = null;
let allowPrivateSmtpForTesting = false;
let allowPrivateWebhookForTesting = false;
let smtpTlsOptionsOverride: { ca?: string | Buffer; servername?: string } | null = null;
let webhookTlsOptionsOverride: { ca?: string | Buffer; servername?: string } | null = null;
let smtpTimeoutsOverride: { connectionTimeout?: number; greetingTimeout?: number; socketTimeout?: number } | null = null;
let webhookTimeoutOverride: number | null = null;
let emailSendOverride:
  | ((options: { to: string; subject: string; html: string; text?: string; settings: EmailSettings }) => Promise<{
      success: boolean;
      messageId?: string;
      error?: string;
      logs: string[];
    }>)
  | null = null;
let lastDispatchedEmailForTesting: EmailRecord | null = null;

let cachedStoredSettings: StoredEmailSettings | null = null;

function getSettingsFilePath(): string {
  return settingsFilePathOverride || DEFAULT_SETTINGS_FILE_PATH;
}

export function setEmailSettingsFilePathForTesting(filePath: string | null): void {
  settingsFilePathOverride = filePath;
  cachedStoredSettings = null;
}

export function setEmailEncryptionKeyForTesting(key: string | null | undefined): void {
  encryptionKeyOverride = key;
}

export function setDnsLookupOverrideForTesting(
  fn: ((hostname: string) => Promise<Array<{ address: string; family: number }>>) | null
): void {
  dnsLookupOverride = fn;
}

export function setAllowPrivateSmtpForTesting(allow: boolean): void {
  allowPrivateSmtpForTesting = allow;
}

export function setAllowPrivateWebhookForTesting(allow: boolean): void {
  allowPrivateWebhookForTesting = allow;
}

export function setSmtpTlsOptionsForTesting(opts: { ca?: string | Buffer; servername?: string } | null): void {
  smtpTlsOptionsOverride = opts;
}

export function setWebhookTlsOptionsForTesting(opts: { ca?: string | Buffer; servername?: string } | null): void {
  webhookTlsOptionsOverride = opts;
}

export function setSmtpTimeoutsForTesting(
  opts: { connectionTimeout?: number; greetingTimeout?: number; socketTimeout?: number } | null
): void {
  smtpTimeoutsOverride = opts;
}

export function setWebhookTimeoutForTesting(timeoutMs: number | null): void {
  webhookTimeoutOverride = timeoutMs;
}

export function setEmailSendOverrideForTesting(
  fn:
    | ((options: { to: string; subject: string; html: string; text?: string; settings: EmailSettings }) => Promise<{
        success: boolean;
        messageId?: string;
        error?: string;
        logs: string[];
      }>)
    | null
): void {
  emailSendOverride = fn;
}

export function getLastDispatchedEmailForTesting(): EmailRecord | null {
  return lastDispatchedEmailForTesting;
}

export function resetEmailModuleForTesting(): void {
  cachedStoredSettings = null;
  settingsFilePathOverride = null;
  encryptionKeyOverride = undefined;
  dnsLookupOverride = null;
  allowPrivateSmtpForTesting = false;
  allowPrivateWebhookForTesting = false;
  smtpTlsOptionsOverride = null;
  webhookTlsOptionsOverride = null;
  smtpTimeoutsOverride = null;
  webhookTimeoutOverride = null;
  emailSendOverride = null;
  lastDispatchedEmailForTesting = null;
}

/**
 * Resolves and validates the 256-bit AES-GCM master key from EMAIL_SETTINGS_ENCRYPTION_KEY.
 * Strictly fails closed when missing, short, or weak.
 */
function resolveEncryptionKeyBytes(): Buffer {
  const raw = encryptionKeyOverride !== undefined ? encryptionKeyOverride : process.env.EMAIL_SETTINGS_ENCRYPTION_KEY;
  if (!raw || typeof raw !== "string" || raw.trim().length === 0) {
    throw new EmailEncryptionError(
      "کلید رمزگذاری تنظیمات ایمیل (EMAIL_SETTINGS_ENCRYPTION_KEY) پیکربندی نشده است. ذخیره یا استفاده از اطلاعات محرمانه امکان‌پذیر نیست.",
      500
    );
  }

  const trimmed = raw.trim();

  // 1. Exact 64-char hex (32 bytes)
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    const buf = Buffer.from(trimmed, "hex");
    if (new Set(buf).size < 4) {
      throw new EmailEncryptionError("کلید رمزگذاری ایمیل دارای آنتروپی کافی نمی‌باشد.", 500);
    }
    return buf;
  }

  // 2. Base64-encoded 32-byte key
  if (/^[A-Za-z0-9+/=]{43,44}$/.test(trimmed)) {
    const decoded = Buffer.from(trimmed, "base64");
    if (decoded.length === 32 && new Set(decoded).size >= 4) {
      return decoded;
    }
  }

  // 3. Strong passphrase >= 32 chars
  const weakKeys = new Set([
    "changeme",
    "secret",
    "password",
    "default",
    "test",
    "12345678901234567890123456789012"
  ]);
  if (trimmed.length < 32 || weakKeys.has(trimmed.toLowerCase()) || new Set(trimmed.split("")).size < 4) {
    throw new EmailEncryptionError(
      "کلید رمزگذاری ایمیل (EMAIL_SETTINGS_ENCRYPTION_KEY) نامعتبر یا ضعیف است. حداقل طول ۳۲ کاراکتر با آنتروپی بالا الزامی است.",
      500
    );
  }

  return crypto.createHash("sha256").update(`salesdashboard:email-key-v1:${trimmed}`, "utf8").digest();
}

export function isEmailEncryptionKeyConfigured(): boolean {
  try {
    resolveEncryptionKeyBytes();
    return true;
  } catch {
    return false;
  }
}

export function encryptSecret(plaintext: string, fieldName = "secret"): EncryptedSecretPayload {
  const key = resolveEncryptionKeyBytes();
  const iv = crypto.randomBytes(12); // 96-bit NIST recommended GCM IV
  const aad = Buffer.from(`salesdashboard:email-settings:v1:${fieldName}`, "utf8");
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    alg: "aes-256-gcm",
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: encrypted.toString("base64")
  };
}

export function decryptSecret(payload: EncryptedSecretPayload, fieldName = "secret"): string {
  if (
    !payload ||
    typeof payload !== "object" ||
    payload.v !== 1 ||
    payload.alg !== "aes-256-gcm" ||
    typeof payload.iv !== "string" ||
    typeof payload.tag !== "string" ||
    typeof payload.data !== "string"
  ) {
    throw new EmailEncryptionError("ساختار اطلاعات رمزگذاری‌شده ایمیل نامعتبر است.", 500);
  }

  const key = resolveEncryptionKeyBytes();
  const iv = Buffer.from(payload.iv, "base64");
  const tag = Buffer.from(payload.tag, "base64");
  const data = Buffer.from(payload.data, "base64");

  if (iv.length !== 12 || tag.length !== 16) {
    throw new EmailEncryptionError("طول IV یا AuthTag اطلاعات محرمانه ایمیل نامعتبر است.", 500);
  }

  try {
    const aad = Buffer.from(`salesdashboard:email-settings:v1:${fieldName}`, "utf8");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAAD(aad);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  } catch {
    throw new EmailEncryptionError(
      "خطا در رمزگشایی اطلاعات محرمانه ایمیل. لطفاً کلید رمزگذاری سرور را بررسی نمایید.",
      500
    );
  }
}

function writeStoredSettingsAtomic(stored: StoredEmailSettings): void {
  const filePath = getSettingsFilePath();
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  // Strip any legacy plaintext fields unconditionally before persistence
  const persistPayload: StoredEmailSettings = {
    providerType: stored.providerType,
    isEnabled: Boolean(stored.isEnabled),
    senderName: stored.senderName,
    senderEmail: stored.senderEmail,
    allowPasswordReset: Boolean(stored.allowPasswordReset),
    allowNotifications: Boolean(stored.allowNotifications),
    smtpHost: stored.smtpHost,
    smtpPort: stored.smtpPort,
    smtpSecure: Boolean(stored.smtpSecure),
    smtpUser: stored.smtpUser,
    smtpPasswordEncrypted: stored.smtpPasswordEncrypted || null,
    webhookProvider: stored.webhookProvider || "GENERIC",
    apiUrl: stored.apiUrl,
    apiKeyEncrypted: stored.apiKeyEncrypted || null,
    apiMethod: stored.apiMethod || "POST",
    customHeaders: stored.customHeaders || ""
  };

  const tmpPath = `${filePath}.tmp.${process.pid}.${crypto.randomBytes(6).toString("hex")}`;
  const serialized = JSON.stringify(persistPayload, null, 2);
  fs.writeFileSync(tmpPath, serialized, { encoding: "utf8", mode: 0o600 });
  try {
    fs.chmodSync(tmpPath, 0o600);
  } catch {}
  fs.renameSync(tmpPath, filePath);
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {}
}

function loadStoredSettingsRaw(): StoredEmailSettings {
  if (cachedStoredSettings) {
    return { ...cachedStoredSettings };
  }

  const baseline: StoredEmailSettings = {
    providerType: defaultEmailSettings.providerType,
    isEnabled: defaultEmailSettings.isEnabled,
    senderName: defaultEmailSettings.senderName,
    senderEmail: defaultEmailSettings.senderEmail,
    allowPasswordReset: defaultEmailSettings.allowPasswordReset,
    allowNotifications: defaultEmailSettings.allowNotifications,
    smtpHost: defaultEmailSettings.smtpHost || "",
    smtpPort: defaultEmailSettings.smtpPort || 587,
    smtpSecure: Boolean(defaultEmailSettings.smtpSecure),
    smtpUser: defaultEmailSettings.smtpUser || "",
    smtpPasswordEncrypted: null,
    webhookProvider: "GENERIC",
    apiUrl: defaultEmailSettings.apiUrl || "",
    apiKeyEncrypted: null,
    apiMethod: "POST",
    customHeaders: ""
  };

  const filePath = getSettingsFilePath();
  if (!fs.existsSync(filePath)) {
    cachedStoredSettings = baseline;
    return { ...baseline };
  }

  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw);
    const merged: StoredEmailSettings = {
      ...baseline,
      ...parsed,
      providerType: parsed.providerType === "WEBHOOK_API" ? "WEBHOOK_API" : "SMTP",
      webhookProvider:
        parsed.webhookProvider === "RESEND" || parsed.webhookProvider === "POSTMARK"
          ? parsed.webhookProvider
          : "GENERIC",
      apiMethod: parsed.apiMethod === "PUT" ? "PUT" : "POST",
      smtpPort: Number(parsed.smtpPort) || 587
    };

    // Auto-migrate legacy plaintext credentials on disk if encryption key is configured
    const hasLegacySmtpPass = typeof parsed.smtpPassword === "string" && parsed.smtpPassword.length > 0;
    const hasLegacyApiKey = typeof parsed.apiKey === "string" && parsed.apiKey.length > 0;
    if ((hasLegacySmtpPass || hasLegacyApiKey) && isEmailEncryptionKeyConfigured()) {
      if (hasLegacySmtpPass && !merged.smtpPasswordEncrypted) {
        merged.smtpPasswordEncrypted = encryptSecret(parsed.smtpPassword, "smtpPassword");
      }
      if (hasLegacyApiKey && !merged.apiKeyEncrypted) {
        merged.apiKeyEncrypted = encryptSecret(parsed.apiKey, "apiKey");
      }
      delete merged.smtpPassword;
      delete merged.apiKey;
      try {
        writeStoredSettingsAtomic(merged);
      } catch {}
    }

    cachedStoredSettings = merged;
    return { ...merged };
  } catch (err: any) {
    console.warn("⚠️ [Email] Could not parse email_settings.json cleanly.");
    cachedStoredSettings = baseline;
    return { ...baseline };
  }
}

/**
 * Returns non-secret email settings safely (never decrypts secrets, never fails when key is missing).
 */
export function getEmailPublicSettings(): EmailSettings {
  const stored = loadStoredSettingsRaw();
  const hasSmtpPassword = Boolean(
    stored.smtpPasswordEncrypted || (typeof stored.smtpPassword === "string" && stored.smtpPassword.length > 0)
  );
  const hasApiKey = Boolean(
    stored.apiKeyEncrypted || (typeof stored.apiKey === "string" && stored.apiKey.length > 0)
  );

  return {
    providerType: stored.providerType,
    isEnabled: Boolean(stored.isEnabled),
    senderName: stored.senderName,
    senderEmail: stored.senderEmail,
    allowPasswordReset: Boolean(stored.allowPasswordReset),
    allowNotifications: Boolean(stored.allowNotifications),
    smtpHost: stored.smtpHost,
    smtpPort: stored.smtpPort,
    smtpSecure: stored.smtpPort === 465 ? true : stored.smtpPort === 587 ? false : Boolean(stored.smtpSecure),
    smtpUser: stored.smtpUser,
    passwordConfigured: hasSmtpPassword,
    webhookProvider: stored.webhookProvider || "GENERIC",
    apiUrl: stored.apiUrl,
    apiKeyConfigured: hasApiKey,
    apiMethod: stored.apiMethod,
    customHeaders: stored.customHeaders,
    encryptionKeyConfigured: isEmailEncryptionKeyConfigured()
  };
}

/**
 * Returns EmailSettings sanitized for Admin UI consumption (credentials strictly omitted).
 */
export function getMaskedEmailSettings(): EmailSettings {
  return getEmailPublicSettings();
}

/**
 * Loads decrypted EmailSettings for internal mail dispatch.
 * Fails closed if encrypted secrets exist on disk while EMAIL_SETTINGS_ENCRYPTION_KEY is missing/invalid,
 * or if legacy plaintext credentials exist without an encryption key.
 */
export function getEmailSettings(): EmailSettings {
  const stored = loadStoredSettingsRaw();

  let smtpPassword = "";
  if (stored.smtpPasswordEncrypted) {
    smtpPassword = decryptSecret(stored.smtpPasswordEncrypted, "smtpPassword");
  } else if (typeof stored.smtpPassword === "string" && stored.smtpPassword.length > 0) {
    // Legacy plaintext without key configured must fail closed rather than silently operating insecurely
    const encrypted = encryptSecret(stored.smtpPassword, "smtpPassword");
    smtpPassword = stored.smtpPassword;
    stored.smtpPasswordEncrypted = encrypted;
    delete stored.smtpPassword;
    writeStoredSettingsAtomic(stored);
    cachedStoredSettings = stored;
  }

  let apiKey = "";
  if (stored.apiKeyEncrypted) {
    apiKey = decryptSecret(stored.apiKeyEncrypted, "apiKey");
  } else if (typeof stored.apiKey === "string" && stored.apiKey.length > 0) {
    const encrypted = encryptSecret(stored.apiKey, "apiKey");
    apiKey = stored.apiKey;
    stored.apiKeyEncrypted = encrypted;
    delete stored.apiKey;
    writeStoredSettingsAtomic(stored);
    cachedStoredSettings = stored;
  }

  return {
    providerType: stored.providerType,
    isEnabled: Boolean(stored.isEnabled),
    senderName: stored.senderName,
    senderEmail: stored.senderEmail,
    allowPasswordReset: Boolean(stored.allowPasswordReset),
    allowNotifications: Boolean(stored.allowNotifications),
    smtpHost: stored.smtpHost,
    smtpPort: stored.smtpPort,
    smtpSecure: stored.smtpPort === 465 ? true : stored.smtpPort === 587 ? false : Boolean(stored.smtpSecure),
    smtpUser: stored.smtpUser,
    smtpPassword,
    passwordConfigured: Boolean(smtpPassword),
    webhookProvider: stored.webhookProvider || "GENERIC",
    apiUrl: stored.apiUrl,
    apiKey,
    apiKeyConfigured: Boolean(apiKey),
    apiMethod: stored.apiMethod,
    customHeaders: stored.customHeaders,
    encryptionKeyConfigured: isEmailEncryptionKeyConfigured()
  };
}

/**
 * Validates and parses custom webhook headers while blocking security-sensitive headers and CRLF injection.
 */
const FORBIDDEN_CUSTOM_HEADERS = new Set([
  "host",
  "authorization",
  "proxy-authorization",
  "content-length",
  "transfer-encoding",
  "connection",
  "keep-alive",
  "upgrade",
  "te",
  "trailer",
  "cookie",
  "set-cookie",
  "x-forwarded-for",
  "x-real-ip",
  "forwarded",
  "expect",
  "x-postmark-server-token"
]);

export function parseSafeCustomHeaders(rawCustomHeaders: string): Record<string, string> {
  const parsed: Record<string, string> = {};
  if (!rawCustomHeaders || typeof rawCustomHeaders !== "string") {
    return parsed;
  }

  if (/[\0]/.test(rawCustomHeaders)) {
    throw new EmailValidationError("هدرهای اختصاصی حاوی کاراکترهای غیرمجاز هستند.");
  }

  const lines = rawCustomHeaders.split(/\r?\n/);
  if (lines.length > 20) {
    throw new EmailValidationError("حداکثر ۲۰ هدر اختصاصی مجاز است.");
  }

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const separatorIdx = line.indexOf(":");
    if (separatorIdx <= 0) {
      throw new EmailValidationError("فرمت هدر اختصاصی نامعتبر است. فرمت صحیح: Header-Name: Value");
    }

    const hKey = line.slice(0, separatorIdx).trim();
    const hVal = line.slice(separatorIdx + 1).trim();

    if (!/^[A-Za-z0-9-]+$/.test(hKey)) {
      throw new EmailValidationError(`نام هدر «${hKey.slice(0, 30)}» نامعتبر است.`);
    }
    if (FORBIDDEN_CUSTOM_HEADERS.has(hKey.toLowerCase())) {
      throw new EmailValidationError(`بازنویسی هدر امنیتی «${hKey}» مجاز نمی‌باشد.`);
    }
    if (/[\r\n\0]/.test(hVal) || hVal.length > 1000) {
      throw new EmailValidationError(`مقدار هدر «${hKey}» نامعتبر است.`);
    }

    parsed[hKey] = hVal;
  }

  return parsed;
}

/**
 * Parses an IPv4 string into 4 octets, or returns null if invalid.
 */
function parseIpv4Bytes(ip: string): number[] | null {
  const clean = ip.trim();
  if (net.isIPv4(clean) === false) return null;
  const parts = clean.split(".").map((n) => Number(n));
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return null;
  }
  return parts;
}

function isPrivateOrReservedIpv4Bytes(b: number[]): boolean {
  const [a, b2, c] = b;
  if (a === 0) return true; // 0.0.0.0/8 "this network"
  if (a === 10) return true; // 10.0.0.0/8 RFC1918
  if (a === 100 && b2 >= 64 && b2 <= 127) return true; // 100.64.0.0/10 CGNAT
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b2 === 254) return true; // 169.254.0.0/16 link-local & cloud metadata
  if (a === 172 && b2 >= 16 && b2 <= 31) return true; // 172.16.0.0/12 RFC1918
  if (a === 192 && b2 === 0 && c === 0) return true; // 192.0.0.0/24 IETF protocol
  if (a === 192 && b2 === 0 && c === 2) return true; // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b2 === 168) return true; // 192.168.0.0/16 RFC1918
  if (a === 198 && (b2 === 18 || b2 === 19)) return true; // 198.18.0.0/15 benchmarking
  if (a === 198 && b2 === 51 && c === 100) return true; // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b2 === 0 && c === 113) return true; // 203.0.113.0/24 TEST-NET-3
  if (a >= 224) return true; // 224.0.0.0/4 multicast & 240.0.0.0/4 reserved / 255.255.255.255
  return false;
}

/**
 * Parses an IPv6 string (handling :: compression and embedded IPv4) into 16 bytes.
 */
function parseIpv6ToBytes(rawIp: string): Uint8Array | null {
  let ip = rawIp.trim();
  if (ip.startsWith("[") && ip.endsWith("]")) {
    ip = ip.slice(1, -1);
  }
  const zoneIdx = ip.indexOf("%");
  if (zoneIdx !== -1) {
    ip = ip.slice(0, zoneIdx);
  }
  if (!net.isIPv6(ip)) return null;

  // Handle IPv4-embedded tail e.g. ::ffff:127.0.0.1
  const lastColon = ip.lastIndexOf(":");
  let tailWords: number[] = [];
  if (lastColon !== -1 && ip.slice(lastColon + 1).includes(".")) {
    const v4 = parseIpv4Bytes(ip.slice(lastColon + 1));
    if (!v4) return null;
    tailWords = [(v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]];
    ip = ip.slice(0, lastColon);
    if (ip === "") ip = "::";
    else if (ip.endsWith(":")) ip += "0"; // handles `::ffff:127.0.0.1` -> `::ffff` (Wait: `lastColon` was before IPv4!)
  }

  // Re-normalize accurately by splitting on "::"
  const doubleColonParts = rawIp
    .replace(/^\[|\]$/g, "")
    .split("%")[0]
    .split("::");
  if (doubleColonParts.length > 2) return null;

  const parseSegmentList = (part: string): number[] | null => {
    if (!part) return [];
    const items = part.split(":");
    const words: number[] = [];
    for (let i = 0; i < items.length; i++) {
      const token = items[i];
      if (token.includes(".")) {
        if (i !== items.length - 1) return null;
        const v4 = parseIpv4Bytes(token);
        if (!v4) return null;
        words.push((v4[0] << 8) | v4[1], (v4[2] << 8) | v4[3]);
      } else {
        if (!/^[0-9a-fA-F]{1,4}$/.test(token)) return null;
        words.push(parseInt(token, 16));
      }
    }
    return words;
  };

  const leftWords = parseSegmentList(doubleColonParts[0]);
  const rightWords = doubleColonParts.length === 2 ? parseSegmentList(doubleColonParts[1]) : [];
  if (!leftWords || !rightWords) return null;

  let allWords: number[];
  if (doubleColonParts.length === 2) {
    const missing = 8 - (leftWords.length + rightWords.length);
    if (missing < 0) return null;
    allWords = [...leftWords, ...new Array(missing).fill(0), ...rightWords];
  } else {
    allWords = leftWords;
  }

  if (allWords.length !== 8) return null;
  const bytes = new Uint8Array(16);
  for (let i = 0; i < 8; i++) {
    bytes[i * 2] = (allWords[i] >> 8) & 0xff;
    bytes[i * 2 + 1] = allWords[i] & 0xff;
  }
  return bytes;
}

/**
 * Checks whether an IP address (IPv4 or IPv6, including ::ffff: IPv4-mapped) belongs to
 * loopback, private, link-local, metadata, multicast, ULA, or reserved ranges.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const clean = String(rawIp || "").trim().replace(/^\[|\]$/g, "").split("%")[0];
  const ipType = net.isIP(clean);
  if (ipType === 0) return true; // Fail closed on unparseable IP

  if (ipType === 4) {
    const v4 = parseIpv4Bytes(clean);
    return !v4 || isPrivateOrReservedIpv4Bytes(v4);
  }

  const b = parseIpv6ToBytes(clean);
  if (!b) return true;

  // ::/128 (unspecified) or ::1/128 (loopback)
  let allZeroFirst15 = true;
  for (let i = 0; i < 15; i++) {
    if (b[i] !== 0) {
      allZeroFirst15 = false;
      break;
    }
  }
  if (allZeroFirst15 && (b[15] === 0 || b[15] === 1)) {
    return true;
  }

  // IPv4-mapped ::ffff:0:0/96 or IPv4-compatible ::0:0/96
  const isV4Mapped =
    b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0 && b[4] === 0 &&
    b[5] === 0 && b[6] === 0 && b[7] === 0 && b[8] === 0 && b[9] === 0 &&
    b[10] === 0xff && b[11] === 0xff;
  const isV4Compat =
    b[0] === 0 && b[1] === 0 && b[2] === 0 && b[3] === 0 && b[4] === 0 &&
    b[5] === 0 && b[6] === 0 && b[7] === 0 && b[8] === 0 && b[9] === 0 &&
    b[10] === 0 && b[11] === 0;
  if (isV4Mapped || isV4Compat) {
    return isPrivateOrReservedIpv4Bytes([b[12], b[13], b[14], b[15]]);
  }

  // fc00::/7 (Unique Local Address: fc00:: - fdff::)
  if ((b[0] & 0xfe) === 0xfc) return true;

  // fe80::/10 (Link-local) & fec0::/10 (Deprecated site-local)
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true;
  if (b[0] === 0xfe && (b[1] & 0xc0) === 0xc0) return true;

  // ff00::/8 (Multicast)
  if (b[0] === 0xff) return true;

  // 100::/64 (Discard-Only)
  if (b[0] === 0x01 && b[1] === 0x00 && b.slice(2, 8).every((x) => x === 0)) return true;

  // 2001:db8::/32 (Documentation)
  if (b[0] === 0x20 && b[1] === 0x01 && b[2] === 0x0d && b[3] === 0xb8) return true;

  // 64:ff9b::/96 (NAT64 well-known prefix -> check embedded IPv4)
  if (
    b[0] === 0x00 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b &&
    b.slice(4, 12).every((x) => x === 0)
  ) {
    return isPrivateOrReservedIpv4Bytes([b[12], b[13], b[14], b[15]]);
  }

  // 2002::/16 (6to4 -> check embedded IPv4 in bytes 2..5)
  if (b[0] === 0x20 && b[1] === 0x02) {
    if (isPrivateOrReservedIpv4Bytes([b[2], b[3], b[4], b[5]])) return true;
  }

  return false;
}

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "169.254.169.254"
]);

function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.trim().toLowerCase().replace(/\.+$/, "");
  if (!lower) return true;
  if (BLOCKED_HOSTNAMES.has(lower)) return true;
  if (
    lower.endsWith(".localhost") ||
    lower.endsWith(".local") ||
    lower.endsWith(".internal") ||
    lower.endsWith(".arpa")
  ) {
    return true;
  }
  return false;
}

async function resolveAllIps(hostname: string): Promise<Array<{ address: string; family: 4 | 6 }>> {
  const cleanHost = hostname.trim().replace(/^\[|\]$/g, "");
  const ipVersion = net.isIP(cleanHost);
  if (ipVersion === 4 || ipVersion === 6) {
    return [{ address: cleanHost, family: ipVersion }];
  }

  let records: Array<{ address: string; family: number }>;
  try {
    records = dnsLookupOverride
      ? await dnsLookupOverride(cleanHost)
      : await dns.promises.lookup(cleanHost, { all: true, verbatim: true });
  } catch {
    throw new EmailValidationError("امکان ترجمه نام دامنه (DNS) برای سرور مقصد وجود ندارد. لطفاً آدرس را بررسی نمایید.", 400);
  }

  if (!Array.isArray(records) || records.length === 0) {
    throw new EmailValidationError("امکان یافتن آدرس IP معتبر (DNS) برای سرور مقصد وجود ندارد.", 400);
  }

  return records
    .filter((r) => r && typeof r.address === "string" && (r.family === 4 || r.family === 6 || net.isIP(r.address)))
    .map((r) => ({
      address: r.address,
      family: (net.isIP(r.address) === 6 ? 6 : 4) as 4 | 6
    }));
}

/**
 * Strictly validates Webhook URL against SSRF, protocol downgrade, URL credentials,
 * private/reserved IPs (IPv4 & IPv6), internal hostnames, and DNS rebinding.
 * Returns the validated URL and a pinned public IP for socket connection.
 */
export async function validateWebhookUrl(
  rawUrl: string
): Promise<{ url: URL; pinnedIp: string; family: 4 | 6 }> {
  if (!rawUrl || typeof rawUrl !== "string" || rawUrl.trim().length === 0) {
    throw new EmailValidationError("آدرس URL وب‌سرویس ایمیل الزامی است.");
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new EmailValidationError("فرمت آدرس URL وب‌هوک نامعتبر است.");
  }

  if (parsed.protocol !== "https:") {
    throw new EmailValidationError("برای امنیت ارتباط، آدرس وب‌هوک باید منحصراً از پروتکل HTTPS استفاده کند.");
  }

  if (parsed.username || parsed.password) {
    throw new EmailValidationError("قرار دادن نام کاربری یا رمز عبور در URL وب‌هوک مجاز نیست.");
  }

  const cleanHost = parsed.hostname.replace(/^\[|\]$/g, "");
  if (!cleanHost) {
    throw new EmailValidationError("نام هاست در آدرس وب‌هوک معتبر نیست.");
  }

  if (!allowPrivateWebhookForTesting) {
    if (isBlockedHostname(cleanHost)) {
      throw new EmailValidationError("اتصال وب‌هوک به آدرس‌های محلی یا داخلی (Local/Internal) مجاز نیست.");
    }

    const ips = await resolveAllIps(cleanHost);
    if (ips.length === 0) {
      throw new EmailValidationError("پاسخ DNS معتبری برای آدرس وب‌هوک دریافت نشد.");
    }

    // Reject if ANY resolved address is private/internal/reserved (prevents dual-stack/DNS rebinding bypass)
    for (const entry of ips) {
      if (isPrivateOrReservedIp(entry.address)) {
        throw new EmailValidationError(
          "آدرس وب‌هوک به یک محدوده IP خصوصی، محلی یا رزرو شده اشاره دارد و مسدود گردید."
        );
      }
    }

    return { url: parsed, pinnedIp: ips[0].address, family: ips[0].family };
  }

  const ips = await resolveAllIps(cleanHost);
  return { url: parsed, pinnedIp: ips[0].address, family: ips[0].family };
}

/**
 * Validates SMTP host to prevent connecting to loopback/private/metadata SSRF targets.
 */
export async function validateSmtpHost(
  rawHost: string
): Promise<{ host: string; pinnedIp: string; family: 4 | 6 }> {
  const host = String(rawHost || "").trim().replace(/^\[|\]$/g, "");
  if (!host || host.length > 255 || /[\s/\\?#\0\r\n]/.test(host)) {
    throw new EmailValidationError("آدرس سرور SMTP نامعتبر است.");
  }

  if (!allowPrivateSmtpForTesting) {
    if (isBlockedHostname(host)) {
      throw new EmailValidationError("اتصال SMTP به آدرس‌های محلی یا داخلی (Local/Internal) مجاز نیست.");
    }

    const ips = await resolveAllIps(host);
    if (ips.length === 0) {
      throw new EmailValidationError("امکان ترجمه DNS برای سرور SMTP وجود ندارد.");
    }

    for (const entry of ips) {
      if (isPrivateOrReservedIp(entry.address)) {
        throw new EmailValidationError(
          "آدرس سرور SMTP به یک شبکه خصوصی یا رزرو شده اشاره دارد و مجاز نمی‌باشد."
        );
      }
    }
    return { host, pinnedIp: ips[0].address, family: ips[0].family };
  }

  const ips = await resolveAllIps(host);
  return { host, pinnedIp: ips[0]?.address || host, family: ips[0]?.family || 4 };
}

/**
 * Validates and persists updated EmailSettings cleanly with AES-256-GCM encryption.
 * Refuses to save plaintext secrets if EMAIL_SETTINGS_ENCRYPTION_KEY is missing.
 */
export async function validateEmailSettingsInput(newSettings: Partial<EmailSettings>): Promise<void> {
  const providerType = newSettings.providerType === "WEBHOOK_API" ? "WEBHOOK_API" : "SMTP";

  if (newSettings.senderEmail !== undefined) {
    const cleanSender = normalizeEmail(newSettings.senderEmail);
    if (!isValidEmail(cleanSender)) {
      throw new EmailValidationError("آدرس ایمیل فرستنده نامعتبر است.");
    }
  }

  if (newSettings.senderName !== undefined && String(newSettings.senderName).trim().length > 120) {
    throw new EmailValidationError("نام فرستنده حداکثر می‌تواند ۱۲۰ کاراکتر باشد.");
  }

  if (providerType === "SMTP") {
    if (newSettings.smtpPort !== undefined) {
      const port = Number(newSettings.smtpPort);
      if (!Number.isInteger(port) || port < 1 || port > 65535) {
        throw new EmailValidationError("شماره پورت SMTP باید عددی صحیح بین ۱ تا ۶۵۵۳۵ باشد.");
      }
    }
    if (newSettings.smtpHost !== undefined && String(newSettings.smtpHost).trim() !== "") {
      await validateSmtpHost(String(newSettings.smtpHost));
    }
  } else {
    if (newSettings.customHeaders !== undefined && String(newSettings.customHeaders).trim() !== "") {
      parseSafeCustomHeaders(String(newSettings.customHeaders));
    }
    if (newSettings.apiUrl !== undefined && String(newSettings.apiUrl).trim() !== "") {
      await validateWebhookUrl(String(newSettings.apiUrl));
    } else if (newSettings.isEnabled) {
      throw new EmailValidationError("برای فعال‌سازی وب‌هوک، وارد کردن آدرس HTTPS الزامی است.");
    }
  }
}

/**
 * Saves updated EmailSettings securely with AES-256-GCM encryption.
 * - Blank smtpPassword / apiKey preserves existing encrypted secrets.
 * - clearSmtpPassword: true / clearApiKey: true explicitly deletes stored secrets.
 * - Never saves plaintext secrets to disk.
 */
export function saveEmailSettings(newSettings: Partial<EmailSettings>): EmailSettings {
  const currentStored = loadStoredSettingsRaw();

  const providerType: EmailProviderType =
    newSettings.providerType !== undefined
      ? (newSettings.providerType === "WEBHOOK_API" ? "WEBHOOK_API" : "SMTP")
      : currentStored.providerType;

  const senderEmail =
    newSettings.senderEmail !== undefined
      ? normalizeEmail(newSettings.senderEmail)
      : currentStored.senderEmail;

  if (!isValidEmail(senderEmail)) {
    throw new EmailValidationError("فرمت آدرس ایمیل فرستنده نامعتبر است.");
  }

  const smtpPort =
    newSettings.smtpPort !== undefined ? Number(newSettings.smtpPort) : currentStored.smtpPort;
  if (!Number.isInteger(smtpPort) || smtpPort < 1 || smtpPort > 65535) {
    throw new EmailValidationError("پورت SMTP نامعتبر است (۱ تا ۶۵۵۳۵).");
  }

  const customHeaders =
    newSettings.customHeaders !== undefined
      ? String(newSettings.customHeaders).trim()
      : currentStored.customHeaders;
  if (customHeaders) {
    parseSafeCustomHeaders(customHeaders);
  }

  const apiUrl =
    newSettings.apiUrl !== undefined ? String(newSettings.apiUrl).trim() : currentStored.apiUrl;
  if (apiUrl) {
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(apiUrl);
    } catch {
      throw new EmailValidationError("فرمت آدرس URL وب‌هوک نامعتبر است.");
    }
    if (parsedUrl.protocol !== "https:") {
      throw new EmailValidationError("آدرس وب‌هوک باید منحصراً HTTPS باشد.");
    }
    if (parsedUrl.username || parsedUrl.password) {
      throw new EmailValidationError("قرار دادن اطلاعات احراز هویت در آدرس وب‌هوک مجاز نیست.");
    }
    const cleanHost = parsedUrl.hostname.replace(/^\[|\]$/g, "");
    if (!allowPrivateWebhookForTesting && (isBlockedHostname(cleanHost) || (net.isIP(cleanHost) !== 0 && isPrivateOrReservedIp(cleanHost)))) {
      throw new EmailValidationError("آدرس وب‌هوک نمی‌تواند به شبکه داخلی یا محلی اشاره کند.");
    }
  }

  // Handle SMTP password update / retain / clear
  let nextSmtpPasswordEncrypted: EncryptedSecretPayload | null = currentStored.smtpPasswordEncrypted || null;
  if (!nextSmtpPasswordEncrypted && typeof currentStored.smtpPassword === "string" && currentStored.smtpPassword.length > 0) {
    nextSmtpPasswordEncrypted = encryptSecret(currentStored.smtpPassword, "smtpPassword");
  }
  if (newSettings.clearSmtpPassword === true) {
    nextSmtpPasswordEncrypted = null;
  } else if (typeof newSettings.smtpPassword === "string" && newSettings.smtpPassword.length > 0) {
    nextSmtpPasswordEncrypted = encryptSecret(newSettings.smtpPassword, "smtpPassword");
  }

  // Handle Webhook API key update / retain / clear
  let nextApiKeyEncrypted: EncryptedSecretPayload | null = currentStored.apiKeyEncrypted || null;
  if (!nextApiKeyEncrypted && typeof currentStored.apiKey === "string" && currentStored.apiKey.length > 0) {
    nextApiKeyEncrypted = encryptSecret(currentStored.apiKey, "apiKey");
  }
  if (newSettings.clearApiKey === true) {
    nextApiKeyEncrypted = null;
  } else if (typeof newSettings.apiKey === "string" && newSettings.apiKey.length > 0) {
    nextApiKeyEncrypted = encryptSecret(newSettings.apiKey, "apiKey");
  }

  const smtpSecure =
    smtpPort === 465
      ? true
      : smtpPort === 587
        ? false
        : Boolean(newSettings.smtpSecure ?? currentStored.smtpSecure);

  const nextStored: StoredEmailSettings = {
    providerType,
    isEnabled: newSettings.isEnabled !== undefined ? Boolean(newSettings.isEnabled) : currentStored.isEnabled,
    senderName: String(newSettings.senderName ?? currentStored.senderName ?? "").trim() || "سامانه مدیریت فروش",
    senderEmail,
    allowPasswordReset:
      newSettings.allowPasswordReset !== undefined
        ? Boolean(newSettings.allowPasswordReset)
        : currentStored.allowPasswordReset,
    allowNotifications:
      newSettings.allowNotifications !== undefined
        ? Boolean(newSettings.allowNotifications)
        : currentStored.allowNotifications,
    smtpHost: String(newSettings.smtpHost ?? currentStored.smtpHost ?? "").trim(),
    smtpPort,
    smtpSecure,
    smtpUser: String(newSettings.smtpUser ?? currentStored.smtpUser ?? "").trim(),
    smtpPasswordEncrypted: nextSmtpPasswordEncrypted,
    webhookProvider:
      newSettings.webhookProvider === "RESEND" || newSettings.webhookProvider === "POSTMARK"
        ? newSettings.webhookProvider
        : (newSettings.webhookProvider === "GENERIC" ? "GENERIC" : currentStored.webhookProvider || "GENERIC"),
    apiUrl,
    apiKeyEncrypted: nextApiKeyEncrypted,
    apiMethod:
      newSettings.apiMethod !== undefined
        ? (newSettings.apiMethod === "PUT" ? "PUT" : "POST")
        : currentStored.apiMethod,
    customHeaders
  };

  writeStoredSettingsAtomic(nextStored);
  cachedStoredSettings = nextStored;

  return getMaskedEmailSettings();
}

/**
 * Normalizes email address
 */
export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/**
 * Validates email format with strict length and pattern check
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  if (trimmed.length > 254) return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(trimmed);
}

/**
 * Masks an email for safe logs/UI, e.g. "al***@example.com"
 */
export function maskEmail(email: string): string {
  if (!email || !email.includes("@")) return "***@***";
  const [local, domain] = email.split("@");
  if (local.length <= 2) {
    return `${local[0]}*@${domain}`;
  }
  return `${local.slice(0, 2)}***${local.slice(-1)}@${domain}`;
}

/**
 * Sanitizes text intended for logs or error messages so no secrets, tokens,
 * credentials, or OTP codes can ever leak.
 */
export function sanitizeEmailLogText(text: string, secretsToScrub: Array<string | undefined | null> = []): string {
  let out = String(text || "");
  for (const s of secretsToScrub) {
    if (s && typeof s === "string" && s.length >= 3) {
      out = out.split(s).join("[REDACTED]");
    }
  }
  out = out
    .replace(/(Bearer\s+)[A-Za-z0-9._\-+/=]+/gi, "$1[REDACTED]")
    .replace(/(AUTH\s+(?:PLAIN|LOGIN)\s+)[A-Za-z0-9+/=]+/gi, "$1[REDACTED]")
    .replace(/\b\d{6}\b/g, (m) => (out.includes("Message-ID") ? m : "***"));
  return out;
}

function escapeHtml(text: string): string {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Generates enterprise RTL HTML email template for password reset OTP
 */
export function generatePasswordResetEmailHtml(code: string, recipientName?: string): string {
  const safeName = escapeHtml(recipientName ? recipientName.trim() : "کاربر گرامی");
  const safeCode = escapeHtml(code);
  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>کد تایید بازیابی کلمه عبور</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, Tahoma, sans-serif; background-color: #f8fafc; margin: 0; padding: 20px; direction: rtl; text-align: right; color: #1e293b; }
    .container { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05); }
    .header { background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 28px 24px; text-align: center; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.025em; }
    .content { padding: 32px 28px; }
    .code-box { background: #f1f5f9; border: 2px dashed #93c5fd; border-radius: 12px; padding: 20px; text-align: center; margin: 24px 0; }
    .otp-code { font-family: 'Courier New', Courier, monospace; font-size: 36px; font-weight: 800; color: #1e40af; letter-spacing: 8px; direction: ltr; display: inline-block; }
    .meta-alert { background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; padding: 12px 16px; font-size: 13px; color: #92400e; margin-top: 20px; line-height: 1.6; }
    .footer { border-top: 1px solid #f1f5f9; padding: 20px 24px; font-size: 12px; color: #64748b; text-align: center; background: #fafafa; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>سامانه جامع مدیریت و فروش</h1>
    </div>
    <div class="content">
      <p style="font-size: 15px; margin-top: 0;">سلام ${safeName}،</p>
      <p style="font-size: 14px; line-height: 1.7; color: #334155;">
        درخواست بازیابی کلمه عبور برای حساب کاربری شما در سامانه ثبت گردیده است. جهت تکمیل فرایند و تنظیم رمز عبور جدید، از کد یکبار مصرف زیر استفاده فرمایید:
      </p>
      <div class="code-box">
        <div class="otp-code">${safeCode}</div>
        <div style="font-size: 12px; color: #64748b; margin-top: 8px;">اعتبار کد: ۵ دقیقه</div>
      </div>
      <div class="meta-alert">
        <strong>⚠️ هشدار امنیتی:</strong> این کد محرمانه است و همکاران سامانه هرگز آن را از شما درخواست نخواهند کرد. در صورتی که این درخواست توسط شما ثبت نشده است، این پیام را نادیده بگیرید.
      </div>
    </div>
    <div class="footer">
      این ایمیل به صورت خودکار توسط سامانه ارسال شده است. لطفاً به آن پاسخ ندهید.
    </div>
  </div>
</body>
</html>
  `.trim();
}

/**
 * Generates enterprise RTL HTML email template for email ownership verification OTP
 */
export function generateEmailVerificationHtml(code: string, recipientName?: string): string {
  const safeName = escapeHtml(recipientName ? recipientName.trim() : "کاربر گرامی");
  const safeCode = escapeHtml(code);
  return `
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head><meta charset="UTF-8"><title>تایید مالکیت آدرس ایمیل</title></head>
<body style="font-family: Tahoma, sans-serif; background:#f8fafc; padding:20px; direction:rtl; text-align:right; color:#1e293b;">
  <div style="max-width:560px; margin:0 auto; background:#fff; border-radius:16px; border:1px solid #e2e8f0; padding:28px;">
    <h2 style="margin-top:0; color:#1e3a8a;">تایید آدرس ایمیل حساب کاربری</h2>
    <p>سلام ${safeName}،</p>
    <p>جهت تایید مالکیت آدرس ایمیل خود در سامانه مدیریت فروش، کد تایید زیر را وارد نمایید:</p>
    <div style="background:#f1f5f9; border:2px dashed #93c5fd; border-radius:12px; padding:18px; text-align:center; margin:20px 0;">
      <span style="font-family:monospace; font-size:32px; font-weight:800; color:#1e40af; letter-spacing:8px;">${safeCode}</span>
      <div style="font-size:12px; color:#64748b; margin-top:8px;">اعتبار کد: ۵ دقیقه</div>
    </div>
  </div>
</body>
</html>
  `.trim();
}

function buildSmtpTransportOptions(settings: EmailSettings, pinnedHost: string, originalHost: string) {
  const port = Number(settings.smtpPort) || 587;
  // Port 465 => Direct TLS; Port 587 => STARTTLS mandatory
  const secure = port === 465 ? true : port === 587 ? false : Boolean(settings.smtpSecure);
  const requireTLS = port === 587 ? true : !secure;

  const tlsOptions: Record<string, any> = {
    rejectUnauthorized: true,
    minVersion: "TLSv1.2"
  };

  if (net.isIP(originalHost) === 0) {
    tlsOptions.servername = originalHost;
  }
  if (smtpTlsOptionsOverride?.ca) {
    tlsOptions.ca = smtpTlsOptionsOverride.ca;
  }
  if (smtpTlsOptionsOverride?.servername) {
    tlsOptions.servername = smtpTlsOptionsOverride.servername;
  }

  return {
    host: pinnedHost,
    port,
    secure,
    requireTLS,
    auth:
      settings.smtpUser && settings.smtpPassword
        ? {
            user: settings.smtpUser,
            pass: settings.smtpPassword
          }
        : undefined,
    tls: tlsOptions,
    connectionTimeout: smtpTimeoutsOverride?.connectionTimeout ?? 10000,
    greetingTimeout: smtpTimeoutsOverride?.greetingTimeout ?? 5000,
    socketTimeout: smtpTimeoutsOverride?.socketTimeout ?? 10000
  };
}

function buildWebhookRequestPayloadAndHeaders(
  settings: EmailSettings,
  sender: string,
  normalizedTo: string,
  subject: string,
  html: string,
  text: string,
  customHeaders: Record<string, string>
): { body: string; headers: Record<string, string> } {
  const adapter = settings.webhookProvider || "GENERIC";
  const headers: Record<string, string> = {
    ...customHeaders,
    "Content-Type": "application/json",
    Accept: "application/json"
  };

  let bodyObj: any;
  if (adapter === "RESEND") {
    if (settings.apiKey) {
      headers["Authorization"] = `Bearer ${settings.apiKey}`;
    }
    bodyObj = {
      from: sender,
      to: [normalizedTo],
      subject,
      html,
      text
    };
  } else if (adapter === "POSTMARK") {
    if (settings.apiKey) {
      headers["X-Postmark-Server-Token"] = settings.apiKey;
    }
    bodyObj = {
      From: sender,
      To: normalizedTo,
      Subject: subject,
      HtmlBody: html,
      TextBody: text,
      MessageStream: "outbound"
    };
  } else {
    if (settings.apiKey) {
      headers["Authorization"] = `Bearer ${settings.apiKey}`;
    }
    bodyObj = {
      from: sender,
      senderEmail: settings.senderEmail,
      senderName: settings.senderName,
      to: normalizedTo,
      subject,
      html,
      text,
      timestamp: new Date().toISOString()
    };
  }

  return {
    body: JSON.stringify(bodyObj),
    headers
  };
}

function executePinnedHttpsRequest(params: {
  url: URL;
  pinnedIp: string;
  family: 4 | 6;
  method: "POST" | "PUT";
  headers: Record<string, string>;
  body: string;
  timeoutMs: number;
  maxResponseBytes: number;
}): Promise<{ status: number; statusMessage: string; body: string }> {
  return new Promise((resolve, reject) => {
    const bodyBuffer = Buffer.from(params.body, "utf8");
    const reqHeaders = {
      ...params.headers,
      "Content-Length": String(bodyBuffer.length)
    };

    let settled = false;
    const finishErr = (err: Error) => {
      if (!settled) {
        settled = true;
        reject(err);
      }
    };
    const finishOk = (resObj: { status: number; statusMessage: string; body: string }) => {
      if (!settled) {
        settled = true;
        resolve(resObj);
      }
    };

    const reqOptions: https.RequestOptions = {
      protocol: "https:",
      hostname: params.url.hostname,
      port: params.url.port ? Number(params.url.port) : 443,
      path: `${params.url.pathname}${params.url.search}`,
      method: params.method,
      headers: reqHeaders,
      rejectUnauthorized: true,
      minVersion: "TLSv1.2",
      ...(webhookTlsOptionsOverride?.ca ? { ca: webhookTlsOptionsOverride.ca } : {}),
      ...(webhookTlsOptionsOverride?.servername ? { servername: webhookTlsOptionsOverride.servername } : {}),
      lookup: ((_hostname: string, _options: any, callback: any) => {
        if (typeof _options === "function") {
          return _options(null, params.pinnedIp, params.family);
        }
        if (_options && (_options as any).all) {
          return callback(null, [{ address: params.pinnedIp, family: params.family }]);
        }
        return callback(null, params.pinnedIp, params.family);
      }) as any
    };

    const req = https.request(reqOptions, (res) => {
      const status = res.statusCode || 0;
      const statusMessage = res.statusMessage || "";

      // Reject HTTP redirects (3xx) strictly to prevent redirect-based SSRF
      if (status >= 300 && status < 400) {
        res.destroy();
        return finishErr(
          new EmailValidationError("تغییر مسیر (HTTP Redirect) در وب‌هوک ایمیل به دلایل امنیتی مجاز نیست.", 400)
        );
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;

      res.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > params.maxResponseBytes) {
          res.destroy();
          return finishErr(
            new EmailValidationError("حجم پاسخ دریافتی از سرور وب‌هوک بیش از حد مجاز است.", 502)
          );
        }
        chunks.push(chunk);
      });

      res.on("end", () => {
        finishOk({
          status,
          statusMessage,
          body: Buffer.concat(chunks).toString("utf8")
        });
      });

      res.on("error", (err) => {
        finishErr(err);
      });
    });

    req.setTimeout(params.timeoutMs, () => {
      req.destroy(new Error("اتصال به سرور وب‌هوک به پایان مهلت زمانی (Timeout) رسید."));
    });

    req.on("error", (err) => {
      finishErr(err);
    });

    req.write(bodyBuffer);
    req.end();
  });
}

/**
 * Sends an email using configured provider (SMTP or Webhook/API)
 */
export async function sendEmail(options: {
  to: string;
  subject: string;
  html: string;
  text?: string;
  configOverride?: EmailSettings;
}): Promise<{ success: boolean; messageId?: string; error?: string; logs: string[] }> {
  const logs: string[] = [];
  const normalizedTo = normalizeEmail(options.to);

  logs.push(`[${new Date().toLocaleTimeString("fa-IR")}] آماده‌سازی ارسال ایمیل به ${maskEmail(normalizedTo)}`);

  if (!isValidEmail(normalizedTo)) {
    const err = "فرمت آدرس ایمیل گیرنده نامعتبر است.";
    logs.push(`❌ ${err}`);
    return { success: false, error: err, logs };
  }

  let settings: EmailSettings;
  try {
    settings = options.configOverride || getEmailSettings();
  } catch (err: any) {
    const safeErr = err?.message || "خطا در بازیابی تنظیمات امن ایمیل.";
    logs.push(`❌ ${safeErr}`);
    return { success: false, error: safeErr, logs };
  }

  if (!options.configOverride && !settings.isEnabled) {
    const err = "سرویس ارسال ایمیل در سامانه غیرفعال است.";
    logs.push(`⚠️ ${err}`);
    return { success: false, error: err, logs };
  }

  lastDispatchedEmailForTesting = {
    to: normalizedTo,
    subject: options.subject,
    html: options.html,
    text: options.text,
    sentAt: Date.now()
  };

  if (emailSendOverride) {
    return await emailSendOverride({
      to: normalizedTo,
      subject: options.subject,
      html: options.html,
      text: options.text,
      settings
    });
  }

  const safeSenderName = String(settings.senderName || "سامانه مدیریت فروش").replace(/[\r\n"]/g, " ").trim();
  const cleanSenderEmail = normalizeEmail(settings.senderEmail || "noreply@company.com");
  if (!isValidEmail(cleanSenderEmail)) {
    const err = "آدرس ایمیل فرستنده نامعتبر است.";
    logs.push(`❌ ${err}`);
    return { success: false, error: err, logs };
  }

  const sender = `"${safeSenderName}" <${cleanSenderEmail}>`;
  const secretsToScrub = [settings.smtpPassword, settings.apiKey];

  // 1. SMTP Provider (TLS Verified)
  if (settings.providerType === "SMTP") {
    const port = Number(settings.smtpPort) || 587;
    if (!Number.isInteger(port) || port < 1 || port > 65535) {
      const err = "پورت SMTP نامعتبر است.";
      logs.push(`❌ ${err}`);
      return { success: false, error: err, logs };
    }

    let hostValidation: { host: string; pinnedIp: string; family: 4 | 6 };
    try {
      hostValidation = await validateSmtpHost(settings.smtpHost || "");
    } catch (hostErr: any) {
      const safeErr = sanitizeEmailLogText(hostErr?.message || "هاست SMTP نامعتبر است.", secretsToScrub);
      logs.push(`❌ ${safeErr}`);
      return { success: false, error: safeErr, logs };
    }

    const tlsModeLabel = port === 465 ? "TLS مستقیم" : "STARTTLS (TLS الزامی)";
    logs.push(`ℹ️ استفاده از پروتکل SMTP: ${hostValidation.host}:${port} (${tlsModeLabel})`);

    try {
      const transportOpts = buildSmtpTransportOptions(settings, hostValidation.pinnedIp, hostValidation.host);
      const transporter = nodemailer.createTransport(transportOpts as any);

      logs.push("⏳ در حال برقراری ارتباط رمزنگاری‌شده با میل‌سرور SMTP...");
      const info = await transporter.sendMail({
        from: sender,
        to: normalizedTo,
        subject: options.subject,
        text: options.text || options.subject,
        html: options.html
      });

      logs.push(`✅ ایمیل با موفقیت توسط میل‌سرور پذیرفته شد (Message-ID: ${info.messageId || "OK"})`);
      return { success: true, messageId: info.messageId, logs };
    } catch (smtpErr: any) {
      const errMsg = sanitizeEmailLogText(
        smtpErr?.message || "خطا در ارتباط امن با سرور SMTP",
        secretsToScrub
      );
      logs.push(`❌ خطای اتصال به SMTP: ${errMsg}`);
      return { success: false, error: "خطا در ارسال ایمیل از طریق سرور SMTP.", logs };
    }
  }

  // 2. Webhook / API Provider (SSRF Protected + Pinned DNS + Strict HTTPS)
  if (settings.providerType === "WEBHOOK_API") {
    if (!settings.apiUrl) {
      const err = "آدرس URL وب‌سرویس ایمیل تعیین نشده است.";
      logs.push(`❌ ${err}`);
      return { success: false, error: err, logs };
    }

    let validated: { url: URL; pinnedIp: string; family: 4 | 6 };
    let safeCustomHeaders: Record<string, string>;
    try {
      validated = await validateWebhookUrl(settings.apiUrl);
      safeCustomHeaders = parseSafeCustomHeaders(settings.customHeaders || "");
    } catch (valErr: any) {
      const safeErr = sanitizeEmailLogText(valErr?.message || "تنظیمات وب‌هوک نامعتبر است.", secretsToScrub);
      logs.push(`❌ ${safeErr}`);
      return { success: false, error: safeErr, logs };
    }

    logs.push(`ℹ️ استفاده از وب‌سرویس REST API (${settings.webhookProvider || "GENERIC"}): ${validated.url.origin}${validated.url.pathname}`);

    try {
      const method: "POST" | "PUT" = settings.apiMethod === "PUT" ? "PUT" : "POST";
      const { body, headers } = buildWebhookRequestPayloadAndHeaders(
        settings,
        sender,
        normalizedTo,
        options.subject,
        options.html,
        options.text || options.subject,
        safeCustomHeaders
      );

      logs.push(`⏳ ارسال درخواست امن HTTPS ${method} به مقصد...`);
      const response = await executePinnedHttpsRequest({
        url: validated.url,
        pinnedIp: validated.pinnedIp,
        family: validated.family,
        method,
        headers,
        body,
        timeoutMs: webhookTimeoutOverride ?? WEBHOOK_TIMEOUT_MS,
        maxResponseBytes: WEBHOOK_MAX_RESPONSE_BYTES
      });

      logs.push(`📡 پاسخ دریافت شد: وضعیت کد ${response.status}`);

      if (response.status < 200 || response.status >= 300) {
        const errMsg = `سرویس وب‌هوک با کد وضعیت ${response.status} پاسخ داد.`;
        logs.push(`❌ ${errMsg}`);
        return { success: false, error: errMsg, logs };
      }

      logs.push(`✅ ارسال وب‌هوک موفقیت‌آمیز بود.`);
      return { success: true, messageId: `webhook-${Date.now()}`, logs };
    } catch (apiErr: any) {
      const errMsg = sanitizeEmailLogText(
        apiErr?.message || "خطا در ارسال درخواست به وب‌هوک ایمیل",
        secretsToScrub
      );
      logs.push(`❌ خطای وب‌هوک: ${errMsg}`);
      return { success: false, error: errMsg, logs };
    }
  }

  return { success: false, error: "نوع ارائه‌دهنده سرویس ایمیل نامعتبر است.", logs };
}

/**
 * Runs a complete connection and test delivery diagnostic
 */
export async function testEmailConnection(
  configOverride?: EmailSettings,
  recipientEmail?: string
): Promise<EmailDiagnosticResult> {
  let settings: EmailSettings;
  try {
    settings = configOverride || getEmailSettings();
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "خطا در بارگذاری یا رمزگشایی تنظیمات ایمیل.",
      timestamp: new Date().toISOString(),
      provider: "SMTP",
      logs: [`❌ ${err?.message || "خطای رمزگشایی"}`]
    };
  }

  const logs: string[] = [];
  const testRecipient = normalizeEmail(recipientEmail || settings.senderEmail || "");
  const secretsToScrub = [settings.smtpPassword, settings.apiKey];

  if (!isValidEmail(testRecipient)) {
    return {
      success: false,
      message: "آدرس ایمیل گیرنده آزمایشی نامعتبر است.",
      timestamp: new Date().toISOString(),
      provider: settings.providerType,
      logs: ["❌ فرمت آدرس ایمیل گیرنده آزمایشی نامعتبر است."]
    };
  }

  logs.push(`🚀 شروع فرایند تست تشخیصی اتصال و ارسال سرویس ایمیل...`);
  logs.push(`ارائه‌دهنده: ${settings.providerType === "SMTP" ? "پروتکل استاندارد SMTP" : "سرویس مبتنی بر وب‌هوک / REST API"}`);
  logs.push(`فرستنده: ${settings.senderName} <${settings.senderEmail}>`);
  logs.push(`گیرنده تستی: ${maskEmail(testRecipient)}`);

  if (settings.providerType === "SMTP") {
    let hostValidation: { host: string; pinnedIp: string; family: 4 | 6 };
    try {
      hostValidation = await validateSmtpHost(settings.smtpHost || "");
    } catch (hostErr: any) {
      const msg = sanitizeEmailLogText(hostErr?.message || "هاست SMTP نامعتبر است.", secretsToScrub);
      logs.push(`❌ ${msg}`);
      return {
        success: false,
        message: msg,
        timestamp: new Date().toISOString(),
        provider: "SMTP",
        logs
      };
    }

    const port = Number(settings.smtpPort) || 587;
    logs.push(`🔍 تست دست‌دادن امن TLS با سرور SMTP: ${hostValidation.host}:${port}...`);

    try {
      if (!emailSendOverride) {
        const transportOpts = buildSmtpTransportOptions(settings, hostValidation.pinnedIp, hostValidation.host);
        const transporter = nodemailer.createTransport(transportOpts as any);
        await transporter.verify();
      }
      logs.push(`✅ ارتباط اولیه TLS و احراز هویت با سرور SMTP با موفقیت تأیید شد.`);
    } catch (vErr: any) {
      const safeErr = sanitizeEmailLogText(vErr?.message || String(vErr), secretsToScrub);
      logs.push(`❌ خطای اعتبارسنجی اولیه SMTP: ${safeErr}`);
      return {
        success: false,
        message: `عدم برقراری ارتباط امن با میل‌سرور: ${safeErr}`,
        timestamp: new Date().toISOString(),
        provider: "SMTP",
        logs
      };
    }
  }

  const testHtml = `
    <div dir="rtl" style="font-family: Tahoma, sans-serif; padding: 20px; color: #1e293b; background: #f8fafc; border-radius: 12px; border: 1px solid #cbd5e1;">
      <h2 style="color: #16a34a; margin-top: 0;">✅ تست اتصال سرویس ایمیل موفقیت‌آمیز بود</h2>
      <p>این یک ایمیل آزمایشی است که جهت بررسی تنظیمات ارتباطی و تشخیصی از طرف سامانه ارسال شده است.</p>
      <div style="background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <strong>زمان ارسال:</strong> ${new Date().toLocaleString("fa-IR")}<br/>
        <strong>ارائه‌دهنده:</strong> ${escapeHtml(settings.providerType)}<br/>
        <strong>آدرس فرستنده:</strong> ${escapeHtml(settings.senderEmail)}
      </div>
    </div>
  `;

  const sendResult = await sendEmail({
    to: testRecipient,
    subject: "تست اتصال سرویس ایمیل سامانه مدیریت فروش",
    html: testHtml,
    configOverride: settings
  });

  logs.push(...sendResult.logs);

  if (!sendResult.success) {
    return {
      success: false,
      message: sendResult.error || "ارسال پیام تستی با خطا مواجه شد.",
      timestamp: new Date().toISOString(),
      provider: settings.providerType,
      logs
    };
  }

  return {
    success: true,
    message: `پیام آزمایشی با موفقیت به ${maskEmail(testRecipient)} ارسال گردید.`,
    timestamp: new Date().toISOString(),
    provider: settings.providerType,
    logs,
    messageId: sendResult.messageId
  };
}
