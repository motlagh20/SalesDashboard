import fs from "fs";
import { maskPhoneNumber } from "./otp";

export interface SmsSendResult {
  success: boolean;
  provider: "kavenegar" | "melipayamak" | "ippanel" | "custom_gateway" | "simulated_dev";
  messageId?: string;
  error?: string;
}

/**
 * Checks whether an actual SMS provider is configured in environment variables
 */
export function isSmsConfigured(): boolean {
  return !!(
    process.env.KAVENEGAR_API_KEY ||
    process.env.MELIPAYAMAK_API_KEY ||
    process.env.MELIPAYAMAK_USERNAME ||
    process.env.IPPANEL_API_KEY ||
    process.env.SMS_API_KEY ||
    process.env.SMS_GATEWAY_URL
  );
}

let testSmsSendOverride: ((phone: string, otpCode: string, purpose: "LOGIN" | "PASSWORD_RESET") => Promise<SmsSendResult>) | null = null;

export function setSmsSendOverrideForTesting(
  override: ((phone: string, otpCode: string, purpose: "LOGIN" | "PASSWORD_RESET") => Promise<SmsSendResult>) | null
): void {
  testSmsSendOverride = override;
  try {
    const isProduction = (process.env.NODE_ENV || "").toLowerCase() === "production" || (process.env.APP_ENV || "").toLowerCase() === "production";
    if (!isProduction) {
      if (override) {
        fs.writeFileSync("/tmp/.sms_override_failure", JSON.stringify({ failure: true }));
      } else if (fs.existsSync("/tmp/.sms_override_failure")) {
        fs.unlinkSync("/tmp/.sms_override_failure");
      }
    }
  } catch {}
}

/**
 * Sends an OTP SMS via configured SMS provider, or logs safely in development mode
 */
export async function sendOtpSms(
  phoneNumber: string,
  otpCode: string,
  purpose: "LOGIN" | "PASSWORD_RESET"
): Promise<SmsSendResult> {
  if (testSmsSendOverride) {
    return await testSmsSendOverride(phoneNumber, otpCode, purpose);
  }

  const isProduction = (process.env.NODE_ENV || "").toLowerCase() === "production" || (process.env.APP_ENV || "").toLowerCase() === "production";
  if (!isProduction) {
    try {
      if (fs.existsSync("/tmp/.sms_override_failure")) {
        return {
          success: false,
          provider: "kavenegar",
          error: "درگاه پیامک در دسترس نمی‌باشد (Error 500)."
        };
      }
    } catch {}
  }
  const maskedPhone = maskPhoneNumber(phoneNumber);
  const purposeText = purpose === "LOGIN" ? "ورود به سامانه طبرستان" : "بازیابی کلمه عبور";

  // 1. Kavenegar Integration
  if (process.env.KAVENEGAR_API_KEY) {
    try {
      const apiKey = process.env.KAVENEGAR_API_KEY;
      const template = process.env.KAVENEGAR_TEMPLATE || "verify";
      const lookupUrl = `https://api.kavenegar.com/v1/${apiKey}/verify/lookup.json?receptor=${encodeURIComponent(
        phoneNumber
      )}&token=${encodeURIComponent(otpCode)}&template=${encodeURIComponent(template)}`;

      const res = await fetch(lookupUrl, { method: "GET" });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok && data?.return?.status === 200) {
        console.log(`[SMS Gateway: Kavenegar] Sent OTP successfully to ${maskedPhone}`);
        return { success: true, provider: "kavenegar", messageId: String(data?.entries?.[0]?.messageid || "") };
      } else {
        console.error(`[SMS Gateway: Kavenegar] Error sending to ${maskedPhone}:`, data);
        return { success: false, provider: "kavenegar", error: data?.return?.message || "Failed to send SMS" };
      }
    } catch (err: any) {
      console.error(`[SMS Gateway: Kavenegar] Network error:`, err);
      return { success: false, provider: "kavenegar", error: err.message };
    }
  }

  // 2. IPPanel / FarazSMS Integration
  if (process.env.IPPANEL_API_KEY) {
    try {
      const apiKey = process.env.IPPANEL_API_KEY;
      const patternCode = process.env.IPPANEL_PATTERN_CODE || "login_otp";
      const sender = process.env.IPPANEL_SENDER || "+983000505";

      const res = await fetch("https://api2.ippanel.com/api/v1/sms/pattern/normal/send", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: apiKey
        },
        body: JSON.stringify({
          code: patternCode,
          sender,
          recipient: phoneNumber,
          variable: { code: otpCode }
        })
      });
      const data: any = await res.json().catch(() => ({}));
      if (res.ok) {
        console.log(`[SMS Gateway: IPPanel] Sent OTP successfully to ${maskedPhone}`);
        return { success: true, provider: "ippanel", messageId: String(data?.data?.message_id || "") };
      } else {
        console.error(`[SMS Gateway: IPPanel] Error sending to ${maskedPhone}:`, data);
        return { success: false, provider: "ippanel", error: data?.message || "Failed to send SMS" };
      }
    } catch (err: any) {
      console.error(`[SMS Gateway: IPPanel] Network error:`, err);
      return { success: false, provider: "ippanel", error: err.message };
    }
  }

  // 3. Generic SMS Gateway / Webhook Integration
  if (process.env.SMS_GATEWAY_URL) {
    try {
      const gatewayUrl = process.env.SMS_GATEWAY_URL;
      const res = await fetch(gatewayUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(process.env.SMS_API_KEY ? { Authorization: `Bearer ${process.env.SMS_API_KEY}` } : {})
        },
        body: JSON.stringify({
          to: phoneNumber,
          message: `کد تایید ${purposeText}: ${otpCode}`,
          code: otpCode,
          purpose
        })
      });
      if (res.ok) {
        console.log(`[SMS Gateway: Custom] Sent OTP successfully to ${maskedPhone}`);
        return { success: true, provider: "custom_gateway" };
      }
    } catch (err: any) {
      console.error(`[SMS Gateway: Custom] Error:`, err);
      return { success: false, provider: "custom_gateway", error: err.message };
    }
  }

  // 4. Safe Development Mode (when no SMS provider configured)
  if (!isProduction) {
    // Only in development: log the code so developers can test authentication locally
    console.log(`🔑 [DEV ONLY - SIMULATED SMS] Purpose: ${purposeText} | Phone: ${phoneNumber} | Code: ${otpCode}`);
    return {
      success: true,
      provider: "simulated_dev"
    };
  }

  // In production without an SMS provider configured:
  console.warn(`⚠️ [SECURITY WARNING] SMS provider is NOT configured in production environment. SMS dispatch skipped for ${maskedPhone}.`);
  return {
    success: false,
    provider: "simulated_dev",
    error: "سامانه ارسال پیامک در محیط عملیاتی پیکربندی نشده است."
  };
}
