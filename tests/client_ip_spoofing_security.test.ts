import { describe, it, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import express from "express";
import http from "http";
import {
  getClientIp,
  checkOtpRateLimit,
  recordOtpRequest,
  checkVerificationRateLimit,
  recordFailedVerification,
  resetOtpRateLimitsForTesting,
  setOtpCooldownSecondsForTesting,
  OTP_IP_MAX_REQUESTS,
  VERIFY_IP_MAX_ATTEMPTS
} from "../server/otp";

describe("Client IP Spoofing & Trusted Proxy Rate-Limiting Security Tests", () => {
  let app: express.Express;
  let server: http.Server;
  let serverPort: number;
  let baseUrl: string;

  before(async () => {
    // Spin up an isolated, dedicated test Express application configured with production-standard `trust proxy: 1`
    app = express();
    app.set("trust proxy", 1);
    app.use(express.json());

    // Test route evaluating getClientIp and OTP rate limiting
    app.post("/test-otp-request", (req, res) => {
      const clientIp = getClientIp(req);
      const phone = req.body?.phoneNumber || "09121112233";
      const purpose = req.body?.purpose || "LOGIN";

      const check = checkOtpRateLimit(phone, clientIp, purpose);
      if (!check.allowed) {
        return res.status(429).json({
          success: false,
          clientIp,
          error: check.error,
          retryAfter: check.retryAfter
        });
      }

      recordOtpRequest(phone, clientIp, purpose);
      return res.status(200).json({
        success: true,
        clientIp
      });
    });

    // Test route evaluating verification failed rate limiting
    app.post("/test-otp-verify-fail", (req, res) => {
      const clientIp = getClientIp(req);
      const check = checkVerificationRateLimit(clientIp);
      if (!check.allowed) {
        return res.status(429).json({
          success: false,
          clientIp,
          error: check.error
        });
      }

      recordFailedVerification(clientIp);
      return res.status(400).json({
        success: false,
        clientIp,
        error: "کد تایید نادرست است"
      });
    });

    await new Promise<void>((resolve) => {
      server = http.createServer(app).listen(0, "127.0.0.1", () => {
        const addr = server.address() as any;
        serverPort = addr.port;
        baseUrl = `http://127.0.0.1:${serverPort}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      if (server) {
        server.close(() => resolve());
      } else {
        resolve();
      }
    });
  });

  beforeEach(() => {
    resetOtpRateLimitsForTesting();
    setOtpCooldownSecondsForTesting(0); // Set cooldown to 0 to specifically test IP-level limits
  });

  describe("1. getClientIp Unit Tests", () => {
    it("strictly prefers Express trusted req.ip over raw x-forwarded-for header", () => {
      const req: any = {
        ip: "203.0.113.195", // Evaluated by Express trust proxy
        headers: {
          "x-forwarded-for": "198.51.100.50, 203.0.113.195" // Forged IP injected by attacker in first position
        },
        socket: { remoteAddress: "127.0.0.1" }
      };

      const resolved = getClientIp(req);
      assert.equal(
        resolved,
        "203.0.113.195",
        "getClientIp must use trusted req.ip and never trust the raw first entry of x-forwarded-for"
      );
    });

    it("falls back to socket.remoteAddress when req.ip is not populated", () => {
      const req: any = {
        ip: undefined,
        headers: {},
        socket: { remoteAddress: "192.168.1.15" }
      };

      const resolved = getClientIp(req);
      assert.equal(resolved, "192.168.1.15", "Must fall back to socket remote address");
    });

    it("falls back safely to 127.0.0.1 when req is null or empty", () => {
      assert.equal(getClientIp(null), "127.0.0.1");
      assert.equal(getClientIp({}), "127.0.0.1");
    });
  });

  describe("2. End-to-End Anti-Spoofing & Proxy Topology Verification", () => {
    const legitimateClientIp = "203.0.113.195";

    it("resolves legitimate client IP correctly when single proxy hop adds client address", async () => {
      const res = await fetch(`${baseUrl}/test-otp-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": legitimateClientIp
        },
        body: JSON.stringify({ phoneNumber: "09120000001" })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.equal(data.clientIp, legitimateClientIp, "Legitimate client IP must be resolved correctly");
    });

    it("proves an attacker cannot spoof client IP by prepending an arbitrary IP in X-Forwarded-For", async () => {
      const attackerSpoofedIp = "10.99.88.77";
      // In a real reverse-proxy setup, the proxy appends the true client IP to any existing header
      const headerWithForgedPrepend = `${attackerSpoofedIp}, ${legitimateClientIp}`;

      const res = await fetch(`${baseUrl}/test-otp-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": headerWithForgedPrepend
        },
        body: JSON.stringify({ phoneNumber: "09120000002" })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      // Express trust proxy: 1 walks back 1 hop from socket and selects legitimateClientIp
      assert.equal(
        data.clientIp,
        legitimateClientIp,
        "Server must resolve to legitimate proxy-added IP, ignoring attacker-spoofed prepend"
      );
      assert.notEqual(
        data.clientIp,
        attackerSpoofedIp,
        "Server must NEVER trust attacker's forged IP"
      );
    });

    it("proves an attacker CANNOT bypass IP-based OTP rate limits by rotating forged X-Forwarded-For headers", async () => {
      // Attacker attempts to bypass OTP rate limits by sending requests with rotating fake IPs in X-Forwarded-For
      // Each request uses a distinct fake IP in the header, while coming from the same legitimate proxy client IP
      for (let i = 0; i < OTP_IP_MAX_REQUESTS; i++) {
        const fakeAttackerIp = `1.1.1.${i + 1}`;
        const forgedHeader = `${fakeAttackerIp}, ${legitimateClientIp}`;
        const distinctPhone = `091290000${i.toString().padStart(2, "0")}`;

        const res = await fetch(`${baseUrl}/test-otp-request`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": forgedHeader
          },
          body: JSON.stringify({ phoneNumber: distinctPhone })
        });

        assert.equal(
          res.status,
          200,
          `Request ${i + 1} within quota must succeed against legitimate IP`
        );
        const data = await res.json();
        assert.equal(data.clientIp, legitimateClientIp);
      }

      // 11th request: Attacker sends another rotating forged IP
      // If spoofing worked, this would pass as a 'new IP' (1.1.1.99).
      // With our fix, it is correctly identified as coming from legitimateClientIp and blocked with 429!
      const finalForgedHeader = `1.1.1.99, ${legitimateClientIp}`;
      const blockedRes = await fetch(`${baseUrl}/test-otp-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": finalForgedHeader
        },
        body: JSON.stringify({ phoneNumber: "09129999999" })
      });

      assert.equal(
        blockedRes.status,
        429,
        "11th request must be BLOCKED with HTTP 429 Too Many Requests despite header rotation"
      );
      const blockedData = await blockedRes.json();
      assert.equal(blockedData.clientIp, legitimateClientIp);
      assert.ok(
        blockedData.error?.includes("آدرس شبکه"),
        "Error message must specify IP rate limit exceeded"
      );
    });

    it("proves an attacker CANNOT bypass failed verification brute-force limits by rotating forged X-Forwarded-For headers", async () => {
      for (let i = 0; i < VERIFY_IP_MAX_ATTEMPTS; i++) {
        const fakeAttackerIp = `8.8.8.${i + 1}`;
        const forgedHeader = `${fakeAttackerIp}, ${legitimateClientIp}`;

        const res = await fetch(`${baseUrl}/test-otp-verify-fail`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Forwarded-For": forgedHeader
          }
        });

        assert.equal(res.status, 400);
      }

      // Next attempt must trigger rate limit lockout (HTTP 429)
      const finalForgedHeader = `8.8.8.100, ${legitimateClientIp}`;
      const blockedRes = await fetch(`${baseUrl}/test-otp-verify-fail`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Forwarded-For": finalForgedHeader
        }
      });

      assert.equal(
        blockedRes.status,
        429,
        "Brute force attempt must be BLOCKED with HTTP 429 despite rotating forged header"
      );
      const blockedData = await blockedRes.json();
      assert.ok(blockedData.error?.includes("تعداد دفعات تلاش اشتباه بیش از حد مجاز است"));
    });

    it("safely handles requests without any X-Forwarded-For header using socket address", async () => {
      const res = await fetch(`${baseUrl}/test-otp-request`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
          // No X-Forwarded-For header
        },
        body: JSON.stringify({ phoneNumber: "09120000009" })
      });

      assert.equal(res.status, 200);
      const data = await res.json();
      assert.ok(
        data.clientIp === "127.0.0.1" || data.clientIp === "::1" || data.clientIp === "::ffff:127.0.0.1",
        "Direct socket connection must safely resolve to local loopback socket IP"
      );
    });
  });
});
