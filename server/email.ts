import fs from "fs";
import path from "path";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { EmailProviderType, EmailSettings } from "../src/types";

export interface EmailRecord {
  to: string;
  subject: string;
  html: string;
  text?: string;
  sentAt: number;
}

export interface EmailOtpRecord {
  email: string;
  code: string;
  purpose: "PASSWORD_RESET" | "NOTIFICATION";
  createdAt: number;
  expiresAt: number;
  attempts: number;
}

export interface EmailDiagnosticResult {
  success: boolean;
  message: string;
  timestamp: string;
  provider: EmailProviderType;
  logs: string[];
  messageId?: string;
}

const SETTINGS_FILE_PATH = path.join(process.cwd(), "server", "email_settings.json");

// Default baseline email configuration
const defaultEmailSettings: EmailSettings = {
  providerType: "SMTP",
  isEnabled: false,
  senderName: "سامانه مدیریت فروش",
  senderEmail: "noreply@company.com",
  allowPasswordReset: true,
  allowNotifications: true,
  // SMTP defaults
  smtpHost: "smtp.example.com",
  smtpPort: 587,
  smtpSecure: false,
  smtpUser: "",
  smtpPassword: "",
  // Webhook defaults
  apiUrl: "",
  apiKey: "",
  apiMethod: "POST",
  customHeaders: ""
};

let cachedEmailSettings: EmailSettings | null = null;

// OTP store: key is `${purpose}:${normalizedEmail}`
const emailOtpStore = new Map<string, EmailOtpRecord>();
const emailLastSentAt = new Map<string, number>();
const emailRequestTimestamps = new Map<string, number[]>();

export const EMAIL_OTP_EXPIRY_SECONDS = 300; // 5 minutes
export const EMAIL_OTP_COOLDOWN_SECONDS = 60; // 1 minute resend cooldown
export const EMAIL_OTP_MAX_ATTEMPTS = 5;
export const EMAIL_MAX_REQUESTS_PER_WINDOW = 5;
export const EMAIL_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// Clean up expired OTPs periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, record] of emailOtpStore.entries()) {
    if (now > record.expiresAt) {
      emailOtpStore.delete(key);
    }
  }
  const windowStart = now - EMAIL_RATE_LIMIT_WINDOW_MS;
  for (const [key, timestamps] of emailRequestTimestamps.entries()) {
    const valid = timestamps.filter((t) => t > windowStart);
    if (valid.length === 0) {
      emailRequestTimestamps.delete(key);
    } else {
      emailRequestTimestamps.set(key, valid);
    }
  }
}, 30000).unref();

/**
 * Loads EmailSettings from cache or JSON file
 */
export function getEmailSettings(): EmailSettings {
  if (cachedEmailSettings) {
    return { ...cachedEmailSettings };
  }

  try {
    if (fs.existsSync(SETTINGS_FILE_PATH)) {
      const raw = fs.readFileSync(SETTINGS_FILE_PATH, "utf8");
      const parsed = JSON.parse(raw);
      cachedEmailSettings = { ...defaultEmailSettings, ...parsed };
      return { ...cachedEmailSettings };
    }
  } catch (err) {
    console.warn("⚠️ [Email] Could not read email_settings.json, using defaults:", err);
  }

  cachedEmailSettings = { ...defaultEmailSettings };
  return { ...cachedEmailSettings };
}

/**
 * Returns EmailSettings sanitized for UI consumption (passwords and API keys masked)
 */
export function getMaskedEmailSettings(): EmailSettings {
  const settings = getEmailSettings();
  const masked: EmailSettings = {
    ...settings,
    hasSmtpPassword: Boolean(settings.smtpPassword && settings.smtpPassword.length > 0),
    hasApiKey: Boolean(settings.apiKey && settings.apiKey.length > 0)
  };

  // Mask credentials
  delete (masked as any).smtpPassword;
  delete (masked as any).apiKey;

  return masked;
}

/**
 * Saves updated EmailSettings securely. Retains existing credentials if new ones are blank/masked.
 */
export function saveEmailSettings(newSettings: Partial<EmailSettings>): EmailSettings {
  const current = getEmailSettings();

  const updated: EmailSettings = {
    providerType: newSettings.providerType === "WEBHOOK_API" ? "WEBHOOK_API" : "SMTP",
    isEnabled: Boolean(newSettings.isEnabled),
    senderName: String(newSettings.senderName || current.senderName || "").trim(),
    senderEmail: String(newSettings.senderEmail || current.senderEmail || "").trim(),
    allowPasswordReset: Boolean(newSettings.allowPasswordReset ?? current.allowPasswordReset),
    allowNotifications: Boolean(newSettings.allowNotifications ?? current.allowNotifications),

    // SMTP settings
    smtpHost: String(newSettings.smtpHost ?? current.smtpHost ?? "").trim(),
    smtpPort: Number(newSettings.smtpPort ?? current.smtpPort ?? 587),
    smtpSecure: Boolean(newSettings.smtpSecure ?? current.smtpSecure),
    smtpUser: String(newSettings.smtpUser ?? current.smtpUser ?? "").trim(),
    smtpPassword:
      newSettings.smtpPassword !== undefined && newSettings.smtpPassword !== ""
        ? String(newSettings.smtpPassword)
        : current.smtpPassword,

    // Webhook settings
    apiUrl: String(newSettings.apiUrl ?? current.apiUrl ?? "").trim(),
    apiKey:
      newSettings.apiKey !== undefined && newSettings.apiKey !== ""
        ? String(newSettings.apiKey)
        : current.apiKey,
    apiMethod: newSettings.apiMethod === "PUT" ? "PUT" : "POST",
    customHeaders: String(newSettings.customHeaders ?? current.customHeaders ?? "").trim()
  };

  cachedEmailSettings = updated;

  try {
    fs.writeFileSync(SETTINGS_FILE_PATH, JSON.stringify(updated, null, 2), "utf8");
  } catch (err) {
    console.error("❌ [Email] Failed to write email_settings.json:", err);
  }

  return updated;
}

/**
 * Normalizes email address
 */
export function normalizeEmail(email: string): string {
  return String(email || "").trim().toLowerCase();
}

/**
 * Validates email format with standard regex
 */
export function isValidEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  const re = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return re.test(email.trim());
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
 * Generates enterprise RTL HTML email template for password reset OTP
 */
export function generatePasswordResetEmailHtml(code: string, recipientName?: string): string {
  const safeName = recipientName ? recipientName.trim() : "کاربر گرامی";
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
        <div class="otp-code">${code}</div>
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
  const settings = options.configOverride || getEmailSettings();
  const normalizedTo = normalizeEmail(options.to);

  logs.push(`[${new Date().toLocaleTimeString("fa-IR")}] آماده‌سازی ارسال ایمیل به ${maskEmail(normalizedTo)}`);

  if (!isValidEmail(normalizedTo)) {
    const err = "فرمت آدرس ایمیل گیرنده نامعتبر است.";
    logs.push(`❌ ${err}`);
    return { success: false, error: err, logs };
  }

  if (!options.configOverride && !settings.isEnabled) {
    const err = "سرویس ارسال ایمیل در سامانه غیرفعال است.";
    logs.push(`⚠️ ${err}`);
    return { success: false, error: err, logs };
  }

  const sender = `"${settings.senderName || 'سامانه مدیریت فروش'}" <${settings.senderEmail || 'noreply@company.com'}>`;

  // 1. SMTP Provider
  if (settings.providerType === "SMTP") {
    logs.push(`ℹ️ استفاده از پروتکل SMTP: ${settings.smtpHost}:${settings.smtpPort} (Secure: ${settings.smtpSecure ? 'بله' : 'خیر'})`);
    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: Number(settings.smtpPort) || 587,
        secure: Boolean(settings.smtpSecure),
        auth: (settings.smtpUser && settings.smtpPassword) ? {
          user: settings.smtpUser,
          pass: settings.smtpPassword
        } : undefined,
        tls: {
          rejectUnauthorized: false // Avoid self-signed certificate rejection in corporate intranets
        },
        connectionTimeout: 10000,
        greetingTimeout: 5000,
        socketTimeout: 10000
      });

      logs.push("⏳ در حال برقراری ارتباط با میل‌سرور SMTP...");
      const info = await transporter.sendMail({
        from: sender,
        to: normalizedTo,
        subject: options.subject,
        text: options.text || options.subject,
        html: options.html
      });

      logs.push(`✅ ایمیل با موفقیت توسط میل‌سرور پذیرفته شد (Message-ID: ${info.messageId || 'OK'})`);
      return { success: true, messageId: info.messageId, logs };
    } catch (smtpErr: any) {
      const errMsg = smtpErr.message || "خطای ناشناخته در پروتکل SMTP";
      logs.push(`❌ خطای اتصال به SMTP: ${errMsg}`);
      return { success: false, error: errMsg, logs };
    }
  }

  // 2. Webhook / API Provider
  if (settings.providerType === "WEBHOOK_API") {
    logs.push(`ℹ️ استفاده از وب‌سرویس REST API / Webhook: ${settings.apiUrl}`);
    if (!settings.apiUrl) {
      const err = "آدرس URL وب‌سرویس ایمیل تعیین نشده است.";
      logs.push(`❌ ${err}`);
      return { success: false, error: err, logs };
    }

    try {
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
        "Accept": "application/json"
      };

      if (settings.apiKey) {
        headers["Authorization"] = `Bearer ${settings.apiKey}`;
      }

      // Add custom headers if specified
      if (settings.customHeaders) {
        try {
          const lines = settings.customHeaders.split("\n");
          for (const line of lines) {
            const separatorIdx = line.indexOf(":");
            if (separatorIdx > 0) {
              const hKey = line.slice(0, separatorIdx).trim();
              const hVal = line.slice(separatorIdx + 1).trim();
              if (hKey && hVal) headers[hKey] = hVal;
            }
          }
        } catch {}
      }

      const payload = {
        from: sender,
        senderEmail: settings.senderEmail,
        senderName: settings.senderName,
        to: normalizedTo,
        subject: options.subject,
        html: options.html,
        text: options.text || options.subject,
        timestamp: new Date().toISOString()
      };

      logs.push(`⏳ ارسال درخواست HTTP ${settings.apiMethod || 'POST'} به مقصد...`);
      const response = await fetch(settings.apiUrl, {
        method: settings.apiMethod || "POST",
        headers,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(10000)
      });

      logs.push(`📡 پاسخ دریافت شد: وضعیت کد ${response.status} (${response.statusText})`);

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        const errMsg = `سرویس وب‌هوک با خطای وضعیت ${response.status} پاسخ داد: ${errText.slice(0, 200)}`;
        logs.push(`❌ ${errMsg}`);
        return { success: false, error: errMsg, logs };
      }

      const resBody = await response.text().catch(() => "OK");
      logs.push(`✅ ارسال وب‌هوک موفقیت‌آمیز بود.`);
      return { success: true, messageId: `webhook-${Date.now()}`, logs };
    } catch (apiErr: any) {
      const errMsg = apiErr.message || "خطا در ارسال درخواست به وب‌هوک ایمیل";
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
  const settings = configOverride || getEmailSettings();
  const logs: string[] = [];
  const testRecipient = normalizeEmail(recipientEmail || settings.senderEmail || "test@example.com");

  logs.push(`🚀 شروع فرایند تست تشخیصی اتصال و ارسال سرویس ایمیل...`);
  logs.push(`ارائه‌دهنده: ${settings.providerType === 'SMTP' ? 'پروتکل استاندارد SMTP' : 'سرویس مبتنی بر وب‌هوک / REST API'}`);
  logs.push(`فرستنده: ${settings.senderName} <${settings.senderEmail}>`);
  logs.push(`گیرنده تستی: ${maskEmail(testRecipient)}`);

  // If SMTP, first run verify handshake
  if (settings.providerType === "SMTP") {
    logs.push(`🔍 تست دست‌دست دادن (Handshake) با سرور SMTP: ${settings.smtpHost}:${settings.smtpPort}...`);
    try {
      const transporter = nodemailer.createTransport({
        host: settings.smtpHost,
        port: Number(settings.smtpPort) || 587,
        secure: Boolean(settings.smtpSecure),
        auth: (settings.smtpUser && settings.smtpPassword) ? {
          user: settings.smtpUser,
          pass: settings.smtpPassword
        } : undefined,
        tls: { rejectUnauthorized: false },
        connectionTimeout: 8000
      });

      await transporter.verify();
      logs.push(`✅ ارتباط اولیه و احراز هویت با سرور SMTP با موفقیت تأیید شد.`);
    } catch (vErr: any) {
      logs.push(`❌ خطای اعتبارسنجی اولیه SMTP: ${vErr.message || vErr}`);
      return {
        success: false,
        message: `عدم برقراری ارتباط با میل‌سرور: ${vErr.message}`,
        timestamp: new Date().toISOString(),
        provider: "SMTP",
        logs
      };
    }
  }

  // Dispatch actual test message
  const testHtml = `
    <div dir="rtl" style="font-family: Tahoma, sans-serif; padding: 20px; color: #1e293b; background: #f8fafc; border-radius: 12px; border: 1px solid #cbd5e1;">
      <h2 style="color: #16a34a; margin-top: 0;">✅ تست اتصال سرویس ایمیل موفقیت‌آمیز بود</h2>
      <p>این یک ایمیل آزمایشی است که جهت بررسی تنظیمات ارتباطی و تشخیصی از طرف سامانه ارسال شده است.</p>
      <div style="background: #ffffff; padding: 12px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 13px;">
        <strong>زمان ارسال:</strong> ${new Date().toLocaleString("fa-IR")}<br/>
        <strong>ارائه‌دهنده:</strong> ${settings.providerType}<br/>
        <strong>آدرس فرستنده:</strong> ${settings.senderEmail}
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

/**
 * Checks email OTP rate limit and resend cooldown
 */
export function checkEmailOtpRateLimit(email: string): {
  allowed: boolean;
  error?: string;
  retryAfter?: number;
} {
  const norm = normalizeEmail(email);
  const now = Date.now();

  // 1. Resend cooldown
  const lastSent = emailLastSentAt.get(norm) || 0;
  const elapsed = (now - lastSent) / 1000;
  if (elapsed < EMAIL_OTP_COOLDOWN_SECONDS) {
    const waitSeconds = Math.ceil(EMAIL_OTP_COOLDOWN_SECONDS - elapsed);
    return {
      allowed: false,
      retryAfter: waitSeconds,
      error: `لطفاً ${waitSeconds} ثانیه دیگر جهت درخواست مجدد کد تایید شکیبا باشید.`
    };
  }

  // 2. Sliding window max requests
  const timestamps = (emailRequestTimestamps.get(norm) || []).filter(
    (t) => t > now - EMAIL_RATE_LIMIT_WINDOW_MS
  );
  if (timestamps.length >= EMAIL_MAX_REQUESTS_PER_WINDOW) {
    return {
      allowed: false,
      error: "تعداد درخواست‌های کد تایید برای این ایمیل بیش از حد مجاز است. لطفاً ۱۵ دقیقه دیگر تلاش فرمایید."
    };
  }

  return { allowed: true };
}

/**
 * Records an OTP dispatch event for rate limiting
 */
export function recordEmailOtpRequest(email: string): void {
  const norm = normalizeEmail(email);
  const now = Date.now();
  emailLastSentAt.set(norm, now);

  const timestamps = (emailRequestTimestamps.get(norm) || []).filter(
    (t) => t > now - EMAIL_RATE_LIMIT_WINDOW_MS
  );
  timestamps.push(now);
  emailRequestTimestamps.set(norm, timestamps);
}

/**
 * Creates cryptographically strong 6-digit OTP for Email
 */
export function issueEmailOtp(
  email: string,
  purpose: "PASSWORD_RESET" | "NOTIFICATION" = "PASSWORD_RESET"
): { code: string; expiresIn: number } {
  const norm = normalizeEmail(email);
  const randomNum = crypto.randomInt(100000, 999999);
  const code = String(randomNum);

  const now = Date.now();
  const expiresAt = now + EMAIL_OTP_EXPIRY_SECONDS * 1000;

  const key = `${purpose}:${norm}`;
  emailOtpStore.set(key, {
    email: norm,
    code,
    purpose,
    createdAt: now,
    expiresAt,
    attempts: 0
  });

  recordEmailOtpRequest(norm);

  return { code, expiresIn: EMAIL_OTP_EXPIRY_SECONDS };
}

/**
 * Verifies email OTP code
 */
export function verifyEmailOtp(
  email: string,
  inputCode: string,
  purpose: "PASSWORD_RESET" | "NOTIFICATION" = "PASSWORD_RESET"
): { success: boolean; error?: string } {
  const norm = normalizeEmail(email);
  const key = `${purpose}:${norm}`;
  const record = emailOtpStore.get(key);

  if (!record) {
    return { success: false, error: "کد تایید منقضی شده است یا درخواستی ثبت نشده است." };
  }

  const now = Date.now();
  if (now > record.expiresAt) {
    emailOtpStore.delete(key);
    return { success: false, error: "کد تایید منقضی گردیده است. لطفاً مجدداً درخواست ارسال کد دهید." };
  }

  record.attempts += 1;
  if (record.attempts > EMAIL_OTP_MAX_ATTEMPTS) {
    emailOtpStore.delete(key);
    return { success: false, error: "تعداد تلاش‌های ناموفق بیش از حد مجاز است. کد باطل گردید." };
  }

  const cleanInput = String(inputCode || "").trim();
  if (cleanInput.length !== record.code.length) {
    return { success: false, error: "کد تایید وارد شده نامعتبر است." };
  }

  // Constant-time comparison
  const inputBuffer = Buffer.from(cleanInput);
  const codeBuffer = Buffer.from(record.code);
  const isMatch = crypto.timingSafeEqual(inputBuffer, codeBuffer);

  if (!isMatch) {
    const remaining = EMAIL_OTP_MAX_ATTEMPTS - record.attempts;
    return {
      success: false,
      error: remaining > 0
        ? `کد تایید اشتباه است. (${remaining} تلاش باقی‌مانده)`
        : "کد تایید اشتباه است و باطل شد."
    };
  }

  // Code verified successfully, invalidate immediately
  emailOtpStore.delete(key);
  return { success: true };
}
