import express from "express";
import { ApiError } from "./errorHandler";

/**
 * Normalizes Persian/Arabic digits (۰-۹ and ٠-٩) to English digits (0-9).
 */
export function normalizeDigits(input: any): string {
  if (input === null || input === undefined) return "";
  const str = String(input);
  return str
    .replace(/[۰٠]/g, "0")
    .replace(/[۱١]/g, "1")
    .replace(/[۲٢]/g, "2")
    .replace(/[۳٣]/g, "3")
    .replace(/[۴٤]/g, "4")
    .replace(/[۵٥]/g, "5")
    .replace(/[۶٦]/g, "6")
    .replace(/[۷٧]/g, "7")
    .replace(/[۸٨]/g, "8")
    .replace(/[۹٩]/g, "9");
}

/**
 * Sanitizes a string by trimming whitespace, removing dangerous NULL bytes (\0),
 * and stripping non-printable control characters that could facilitate SQL injection or parser exploits.
 */
export function sanitizeString(
  val: any,
  options: {
    minLength?: number;
    maxLength?: number;
    allowEmpty?: boolean;
    required?: boolean;
    fieldName?: string;
    defaultValue?: string;
  } = {}
): string {
  const { minLength, maxLength = 5000, allowEmpty, required, fieldName = "فیلد متنی", defaultValue = "" } = options;
  const isRequired = required !== undefined ? required : (allowEmpty !== undefined ? !allowEmpty : false);

  if (val === null || val === undefined) {
    if (isRequired) {
      throw ApiError.badRequest(`${fieldName} نمی‌تواند خالی باشد.`);
    }
    return defaultValue;
  }

  // Remove NULL bytes, control characters (keep \r, \n, \t)
  const cleaned = String(val)
    .replace(/\0/g, "")
    .replace(/[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .trim();

  if (isRequired && cleaned.length === 0) {
    throw ApiError.badRequest(`${fieldName} نمی‌تواند خالی باشد.`);
  }

  if (minLength !== undefined && cleaned.length > 0 && cleaned.length < minLength) {
    throw ApiError.badRequest(`${fieldName} حداقل باید ${minLength} کاراکتر باشد.`);
  }

  if (maxLength && cleaned.length > maxLength) {
    throw ApiError.badRequest(`${fieldName} حداکثر می‌تواند ${maxLength} کاراکتر باشد.`);
  }

  return cleaned;
}

/**
 * Validates and parses a numeric field.
 * Rejects NaN, infinite values, or numbers outside defined constraints.
 */
export function validateNumber(
  val: any,
  fieldName: string,
  options: {
    min?: number;
    max?: number;
    integer?: boolean;
    required?: boolean;
    defaultValue?: number;
  } = {}
): number {
  const { min, max, integer = false, required = true, defaultValue } = options;

  if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
    if (!required) {
      return defaultValue !== undefined ? defaultValue : 0;
    }
    throw ApiError.badRequest(`مقدار فیلد ${fieldName} الزامی است.`);
  }

  const normalized = typeof val === "string" ? normalizeDigits(val).trim() : val;
  const num = Number(normalized);

  if (typeof num !== "number" || Number.isNaN(num) || !Number.isFinite(num)) {
    throw ApiError.badRequest(`مقدار فیلد ${fieldName} باید یک عدد معتبر باشد.`);
  }

  if (integer && !Number.isInteger(num)) {
    throw ApiError.badRequest(`مقدار فیلد ${fieldName} باید عدد صحیح باشد.`);
  }

  if (min !== undefined && num < min) {
    throw ApiError.badRequest(`مقدار فیلد ${fieldName} نمی‌تواند کمتر از ${min} باشد.`);
  }

  if (max !== undefined && num > max) {
    throw ApiError.badRequest(`مقدار فیلد ${fieldName} نمی‌تواند بیشتر از ${max} باشد.`);
  }

  return num;
}

/**
 * Validates a date string or timestamp.
 * Accepts ISO-8601, standard YYYY-MM-DD, or Persian formatted dates.
 */
export function validateDate(
  val: any,
  fieldName: string,
  options: { required?: boolean; defaultValue?: string } = {}
): string {
  const { required = true, defaultValue } = options;

  if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
    if (!required) {
      return defaultValue || new Date().toISOString();
    }
    throw ApiError.badRequest(`تاریخ در فیلد ${fieldName} الزامی است.`);
  }

  const str = sanitizeString(val, { maxLength: 100, fieldName });

  // Standard JavaScript date validation
  const parsed = new Date(str);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString();
  }

  // Support Persian date format YYYY/MM/DD or YYYY-MM-DD
  const cleanDigits = normalizeDigits(str);
  const persianDateRegex = /^\d{4}[/-]\d{1,2}[/-]\d{1,2}(?:\s+\d{1,2}:\d{1,2}(?::\d{1,2})?)?$/;
  if (persianDateRegex.test(cleanDigits)) {
    return cleanDigits;
  }

  throw ApiError.badRequest(`فرمت تاریخ در فیلد ${fieldName} نامعتبر است.`);
}

/**
 * Validates phone numbers (Iranian standard 09xx or landline 0xx).
 */
export function validatePhoneNumber(
  val: any,
  fieldName = "شماره همراه",
  options: { required?: boolean } = {}
): string {
  const { required = true } = options;

  if (val === null || val === undefined || (typeof val === "string" && val.trim() === "")) {
    if (!required) return "";
    throw ApiError.badRequest(`${fieldName} الزامی است.`);
  }

  const clean = normalizeDigits(val).replace(/[\s\-_]/g, "");
  if (!clean) {
    if (!required) return "";
    throw ApiError.badRequest(`${fieldName} الزامی است.`);
  }

  // Iranian phone pattern (mobile: 09xxxxxxxxx or international +989xxxxxxxxx)
  const mobileRegex = /^(?:\+98|0098|98|0)?9\d{9}$/;
  const landlineRegex = /^(?:\+98|0098|98|0)?\d{10}$/;

  if (!mobileRegex.test(clean) && !landlineRegex.test(clean)) {
    throw ApiError.badRequest(`${fieldName} نامعتبر است. فرمت صحیح: ۰۹۱۲۳۴۵۶۷۸۹`);
  }

  // Normalize to standard 09xxxxxxxxx format
  if (clean.startsWith("+98")) return "0" + clean.slice(3);
  if (clean.startsWith("0098")) return "0" + clean.slice(4);
  if (clean.startsWith("98") && clean.length === 12) return "0" + clean.slice(2);
  if (!clean.startsWith("0") && clean.length === 10) return "0" + clean;
  return clean;
}

/**
 * Validates identifier strings (IDs, codes, slugs).
 * Rejects SQL injection patterns, symbols, and whitespace.
 */
export function validateId(val: any, fieldName = "شناسه"): string {
  if (!val || typeof val !== "string" && typeof val !== "number") {
    throw ApiError.badRequest(`${fieldName} الزامی است.`);
  }

  const clean = String(val).trim();
  if (clean.length === 0 || clean.length > 128) {
    throw ApiError.badRequest(`${fieldName} نامعتبر است.`);
  }

  // Safe characters for IDs: alphanumeric, hyphen, underscore, colon, dot
  const safeIdRegex = /^[A-Za-z0-9_\-.:@]+$/;
  if (!safeIdRegex.test(clean)) {
    throw ApiError.badRequest(`${fieldName} حاوی کاراکترهای غیرمجاز است.`);
  }

  return clean;
}

/**
 * Validates an array field with optional length constraints.
 */
export function validateArray<T = any>(
  val: any,
  fieldName: string,
  options: { minLength?: number; maxLength?: number; required?: boolean } = {}
): T[] {
  const { minLength = 0, maxLength = 1000, required = true } = options;

  if (!Array.isArray(val)) {
    if (!required && (val === null || val === undefined)) {
      return [];
    }
    throw ApiError.badRequest(`${fieldName} باید یک لیست معتبر باشد.`);
  }

  if (minLength > 0 && val.length < minLength) {
    throw ApiError.badRequest(`تعداد آیتم‌های ${fieldName} باید حداقل ${minLength} مورد باشد.`);
  }

  if (maxLength > 0 && val.length > maxLength) {
    throw ApiError.badRequest(`تعداد آیتم‌های ${fieldName} نمی‌تواند بیشتر از ${maxLength} مورد باشد.`);
  }

  return val;
}

/**
 * Global Request Sanitization Middleware
 * Recursively cleans request bodies on POST, PUT, and PATCH:
 * 1. Strips prototype pollution keys (__proto__, constructor, prototype)
 * 2. Strips NULL bytes (\0) from all string values
 * 3. Enforces that request body is a valid object
 */
export function requestSanitizationMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (["POST", "PUT", "PATCH"].includes(req.method)) {
    // Check if body exists and is not null
    if (req.body === null || req.body === undefined) {
      req.body = {};
    }

    if (typeof req.body !== "object") {
      return res.status(400).json({
        success: false,
        message: "فرمت بدنه درخواست نامعتبر است."
      });
    }

    // Deep clean object
    req.body = sanitizeObjectDeep(req.body);
  }
  next();
}

/**
 * Deep sanitization function to prevent prototype pollution and NULL byte injections
 */
function sanitizeObjectDeep(obj: any, depth = 0): any {
  if (depth > 10) return obj; // Prevent infinite recursion
  if (obj === null || obj === undefined) return obj;

  if (typeof obj === "string") {
    return obj.replace(/\0/g, "");
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => sanitizeObjectDeep(item, depth + 1));
  }

  if (typeof obj === "object") {
    const cleanObj: Record<string, any> = {};
    for (const [key, value] of Object.entries(obj)) {
      // Prevent Prototype Pollution
      if (key === "__proto__" || key === "constructor" || key === "prototype") {
        continue;
      }
      cleanObj[key] = sanitizeObjectDeep(value, depth + 1);
    }
    return cleanObj;
  }

  return obj;
}
