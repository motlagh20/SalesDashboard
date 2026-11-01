import express from "express";
import { writeServerErrorLog } from "./database";

/**
 * Custom error class for API errors with controlled HTTP status codes.
 */
export class ApiError extends Error {
  public statusCode: number;
  public isPublic: boolean;

  constructor(statusCode: number, message: string, isPublic = true) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    this.isPublic = isPublic;
    Error.captureStackTrace(this, this.constructor);
  }

  static badRequest(message = "Bad request"): ApiError {
    return new ApiError(400, message, true);
  }

  static unauthorized(message = "Unauthorized"): ApiError {
    return new ApiError(401, message, true);
  }

  static forbidden(message = "Forbidden"): ApiError {
    return new ApiError(403, message, true);
  }

  static notFound(message = "Resource not found"): ApiError {
    return new ApiError(404, message, true);
  }

  static conflict(message = "Conflict"): ApiError {
    return new ApiError(409, message, true);
  }

  static internal(message = "Internal server error"): ApiError {
    return new ApiError(500, message, false);
  }
}

/**
 * Controlled maintenance error used when database is offline or in maintenance.
 * Returns HTTP 503 Service Unavailable.
 */
export class DatabaseMaintenanceError extends ApiError {
  constructor(message = "Database service is temporarily unavailable for maintenance. Please try again shortly.") {
    super(503, message, true);
    this.name = "DatabaseMaintenanceError";
  }
}

/**
 * Standardized API error response format.
 * Guarantees that internal exception details and stack traces are never exposed to clients.
 */
export function sendApiError(
  res: express.Response,
  statusCode: number,
  message: string
) {
  return res.status(statusCode).json({
    success: false,
    message
  });
}

/**
 * Handles caught server exceptions with comprehensive server logging and safe standardized client responses.
 * 
 * 1. Never exposes raw exception messages, database queries, or stack traces to clients.
 * 2. Logs full error context and stack traces on the server.
 * 3. Returns standardized error structure: { success: false, message: "Internal server error" }.
 * 4. Preserves HTTP status codes (400, 401, 403, 404, 409, 500, etc.).
 */
export function handleServerError(
  res: express.Response,
  err: any,
  context: string = "API Operation",
  statusCode: number = 500,
  safeFallbackMessage: string = "Internal server error"
) {
  // 1. Identify database connection failures or compute HTTP status code
  const isDbConnectionError =
    err instanceof DatabaseMaintenanceError ||
    err?.code === "ECONNREFUSED" ||
    err?.code === "PROTOCOL_CONNECTION_LOST" ||
    err?.code === "ETIMEDOUT" ||
    err?.code === "ENOTFOUND" ||
    (typeof err?.message === "string" && err.message.includes("Database service is temporarily unavailable"));

  const finalStatus =
    isDbConnectionError
      ? 503
      : err instanceof ApiError
      ? err.statusCode
      : typeof err?.statusCode === "number"
      ? err.statusCode
      : typeof err?.status === "number"
      ? err.status
      : statusCode;

  // 2. Server diagnostics logging: log stack trace ONLY for actual 5xx internal server errors
  if (finalStatus >= 500) {
    console.error(`[Server Error] [${context}]`, err?.stack || err);
    try {
      writeServerErrorLog(context, err);
    } catch (logErr) {
      console.error("[Logger Error] Failed to write to server log file:", logErr);
    }
  } else {
    // 4xx responses are legitimate user validation / client errors, not server failures
    console.warn(`[Client Error] [${context}] HTTP ${finalStatus}: ${err?.message || "Bad request"}`);
  }

  // 3. Determine safe client message:
  // For database outages, return controlled maintenance error
  let clientMessage = safeFallbackMessage;
  if (isDbConnectionError) {
    clientMessage = "Database service is temporarily unavailable for maintenance. Please try again shortly.";
  } else if (err instanceof ApiError && err.isPublic) {
    clientMessage = err.message;
  } else if (finalStatus >= 400 && finalStatus < 500) {
    // If it's a client error (4xx) and has a clean, safe message (not a SQL/system error)
    const isInternalQuery =
      typeof err?.message === "string" &&
      (err.message.includes("SELECT") ||
       err.message.includes("INSERT") ||
       err.message.includes("UPDATE") ||
       err.message.includes("DELETE") ||
       err.message.includes("SQL") ||
       err.code?.startsWith("ER_"));

    if (err?.message && !isInternalQuery) {
      clientMessage = err.message;
    } else {
      clientMessage =
        finalStatus === 400
          ? "Bad request"
          : finalStatus === 401
          ? "Unauthorized"
          : finalStatus === 403
          ? "Forbidden"
          : finalStatus === 404
          ? "Resource not found"
          : finalStatus === 409
          ? "Conflict"
          : "Bad request";
    }
  } else {
    // Status >= 500: Always return generic message
    clientMessage = "Internal server error";
  }

  return sendApiError(res, finalStatus, clientMessage);
}

/**
 * Express Global Error Handling Middleware
 * Must be mounted at the end of the API route stack to intercept any unhandled exceptions or next(err) calls.
 */
export function expressErrorHandler(
  err: any,
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (res.headersSent) {
    return next(err);
  }

  const context = `${req.method} ${req.originalUrl || req.url}`;
  return handleServerError(res, err, context, err?.statusCode || err?.status || 500);
}

/**
 * 404 Not Found handler for unregistered API endpoints
 */
export function apiNotFoundHandler(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
) {
  if (req.path.startsWith("/api")) {
    return sendApiError(res, 404, "API endpoint not found");
  }
  next();
}
