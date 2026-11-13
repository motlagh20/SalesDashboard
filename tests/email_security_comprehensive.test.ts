import { describe, it, before, after, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import net from "node:net";
import tls from "node:tls";
import https from "node:https";
import type http from "node:http";
import { execFileSync } from "node:child_process";
import {
  EmailEncryptionError,
  EmailValidationError,
  WEBHOOK_MAX_RESPONSE_BYTES,
  decryptSecret,
  encryptSecret,
  getEmailPublicSettings,
  getEmailSettings,
  getMaskedEmailSettings,
  isPrivateOrReservedIp,
  parseSafeCustomHeaders,
  resetEmailModuleForTesting,
  sanitizeEmailLogText,
  saveEmailSettings,
  sendEmail,
  setAllowPrivateSmtpForTesting,
  setAllowPrivateWebhookForTesting,
  setDnsLookupOverrideForTesting,
  setEmailEncryptionKeyForTesting,
  setEmailSettingsFilePathForTesting,
  setSmtpTimeoutsForTesting,
  setSmtpTlsOptionsForTesting,
  setWebhookTimeoutForTesting,
  setWebhookTlsOptionsForTesting,
  validateSmtpHost,
  validateWebhookUrl
} from "../server/email";

function generateSelfSignedCert(tmpDir: string): { key: Buffer; cert: Buffer } {
  const keyPath = path.join(tmpDir, "test-key.pem");
  const certPath = path.join(tmpDir, "test-cert.pem");
  const confPath = path.join(tmpDir, "openssl.cnf");
  fs.writeFileSync(
    confPath,
    [
      "[req]",
      "distinguished_name = req_distinguished_name",
      "x509_extensions = v3_req",
      "prompt = no",
      "[req_distinguished_name]",
      "CN = localhost",
      "[v3_req]",
      "subjectAltName = @alt_names",
      "[alt_names]",
      "DNS.1 = localhost",
      "IP.1 = 127.0.0.1"
    ].join("\n"),
    "utf8"
  );
  execFileSync(
    "openssl",
    [
      "req",
      "-x509",
      "-newkey",
      "rsa:2048",
      "-keyout",
      keyPath,
      "-out",
      certPath,
      "-days",
      "1",
      "-nodes",
      "-config",
      confPath
    ],
    { stdio: "ignore" }
  );
  return {
    key: fs.readFileSync(keyPath),
    cert: fs.readFileSync(certPath)
  };
}

function attachSmtpProtocol(
  socket: net.Socket | tls.TLSSocket,
  onMail: (mail: { authLine?: string; data: string }) => void,
  sendGreeting = true
) {
  let buffer = "";
  let inData = false;
  let dataLines: string[] = [];
  let authPending = false;
  let authLine: string | undefined;

  if (sendGreeting) {
    socket.write("220 localhost ESMTP TestServer\r\n");
  }

  socket.on("data", (chunk: Buffer) => {
    buffer += chunk.toString("utf8");
    while (buffer.includes("\r\n")) {
      const idx = buffer.indexOf("\r\n");
      const line = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);

      if (inData) {
        if (line === ".") {
          inData = false;
          onMail({ authLine, data: dataLines.join("\r\n") });
          dataLines = [];
          socket.write("250 2.0.0 Ok: queued as test-msg-001\r\n");
        } else {
          dataLines.push(line);
        }
        continue;
      }

      if (authPending) {
        authPending = false;
        authLine = line;
        socket.write("235 2.7.0 Authentication successful\r\n");
        continue;
      }

      const upper = line.toUpperCase();
      if (upper.startsWith("EHLO ") || upper.startsWith("HELO ")) {
        socket.write("250-localhost Hello\r\n250 AUTH PLAIN LOGIN\r\n");
      } else if (upper.startsWith("AUTH PLAIN")) {
        const rest = line.slice(10).trim();
        if (rest) {
          authLine = rest;
          socket.write("235 2.7.0 Authentication successful\r\n");
        } else {
          authPending = true;
          socket.write("334 \r\n");
        }
      } else if (upper.startsWith("MAIL FROM:")) {
        socket.write("250 2.1.0 Ok\r\n");
      } else if (upper.startsWith("RCPT TO:")) {
        socket.write("250 2.1.5 Ok\r\n");
      } else if (upper === "DATA") {
        inData = true;
        dataLines = [];
        socket.write("354 End data with <CR><LF>.<CR><LF>\r\n");
      } else if (upper === "QUIT") {
        socket.write("221 2.0.0 Bye\r\n");
        socket.end();
      } else {
        socket.write("250 Ok\r\n");
      }
    }
  });
}

describe("Email Service Comprehensive Security Suite (Encryption, SMTP TLS, Webhook SSRF)", () => {
  let tmpDir: string;
  let certPair: { key: Buffer; cert: Buffer };
  const VALID_KEY = "a9f4c2e19b7d6a034c8f11e2d3b4a59687f6e5d4c3b2a1908f7e6d5c4b3a2910";

  before(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "sales-email-sec-"));
    certPair = generateSelfSignedCert(tmpDir);
  });

  after(() => {
    resetEmailModuleForTesting();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    resetEmailModuleForTesting();
    const settingsPath = path.join(tmpDir, `settings-${Date.now()}-${Math.random().toString(36).slice(2)}.json`);
    setEmailSettingsFilePathForTesting(settingsPath);
    setEmailEncryptionKeyForTesting(VALID_KEY);
  });

  afterEach(() => {
    resetEmailModuleForTesting();
  });

  describe("A. AES-256-GCM Secret Encryption & Persistence", () => {
    it("should encrypt and decrypt secrets symmetrically with AAD binding and reject tampering", () => {
      const secret = "SmtpSuperSecret!2026";
      const payload = encryptSecret(secret, "smtpPassword");
      assert.equal(payload.v, 1);
      assert.equal(payload.alg, "aes-256-gcm");
      assert.notEqual(payload.data, Buffer.from(secret).toString("base64"));

      const decrypted = decryptSecret(payload, "smtpPassword");
      assert.equal(decrypted, secret);

      // Wrong AAD field name must fail authentication tag check
      assert.throws(() => decryptSecret(payload, "apiKey"), EmailEncryptionError);

      // Tampering with ciphertext or auth tag must fail closed
      const tamperedTag = {
        ...payload,
        tag: Buffer.from(Buffer.from(payload.tag, "base64").map((b, i) => (i === 0 ? b ^ 0xff : b))).toString("base64")
      };
      assert.throws(() => decryptSecret(tamperedTag, "smtpPassword"), EmailEncryptionError);
    });

    it("should fail closed when EMAIL_SETTINGS_ENCRYPTION_KEY is missing or weak", () => {
      // Save first with valid key
      saveEmailSettings({
        providerType: "SMTP",
        senderEmail: "noreply@company.com",
        smtpHost: "mail.example.com",
        smtpPort: 587,
        smtpUser: "mailer",
        smtpPassword: "MyTopSecretPassword#1"
      });

      // Clear encryption key -> public settings stay safe, decrypted read & secret write fail closed
      setEmailEncryptionKeyForTesting(null);
      const pub = getEmailPublicSettings();
      assert.equal(pub.passwordConfigured, true);
      assert.equal(pub.encryptionKeyConfigured, false);
      assert.equal((pub as any).smtpPassword, undefined);

      assert.throws(() => getEmailSettings(), EmailEncryptionError);
      assert.throws(
        () =>
          saveEmailSettings({
            providerType: "SMTP",
            smtpPassword: "AnotherSecretPassword"
          }),
        EmailEncryptionError
      );

      // Weak keys must be rejected
      setEmailEncryptionKeyForTesting("changeme");
      assert.throws(() => encryptSecret("test", "smtpPassword"), EmailEncryptionError);
      setEmailEncryptionKeyForTesting("aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
      assert.throws(() => encryptSecret("test", "smtpPassword"), EmailEncryptionError);
    });

    it("should never write plaintext secrets to disk, enforce 0600 permissions, preserve omitted secrets, and support explicit clearing", () => {
      const settingsPath = path.join(tmpDir, "encrypted-check.json");
      setEmailSettingsFilePathForTesting(settingsPath);

      const saved = saveEmailSettings({
        providerType: "SMTP",
        isEnabled: true,
        senderEmail: "noreply@example.com",
        smtpHost: "smtp.example.com",
        smtpPort: 465,
        smtpUser: "smtp-user",
        smtpPassword: "PlaintextShouldNeverAppearOnDisk99",
        webhookProvider: "RESEND",
        apiUrl: "https://api.resend.com/emails",
        apiKey: "re_SecretApiKeyNeverOnDisk_12345"
      });

      assert.equal(saved.passwordConfigured, true);
      assert.equal(saved.apiKeyConfigured, true);
      assert.equal((saved as any).smtpPassword, undefined);
      assert.equal((saved as any).apiKey, undefined);

      const diskText = fs.readFileSync(settingsPath, "utf8");
      assert.equal(diskText.includes("PlaintextShouldNeverAppearOnDisk99"), false);
      assert.equal(diskText.includes("re_SecretApiKeyNeverOnDisk_12345"), false);

      const diskJson = JSON.parse(diskText);
      assert.equal(diskJson.smtpPassword, undefined);
      assert.equal(diskJson.apiKey, undefined);
      assert.equal(diskJson.smtpPasswordEncrypted.alg, "aes-256-gcm");
      assert.equal(diskJson.apiKeyEncrypted.alg, "aes-256-gcm");

      const stat = fs.statSync(settingsPath);
      assert.equal(stat.mode & 0o777, 0o600);

      // Saving update with blank password must retain existing encrypted secret
      saveEmailSettings({ senderName: "Updated Name", smtpPassword: "" });
      const loaded = getEmailSettings();
      assert.equal(loaded.senderName, "Updated Name");
      assert.equal(loaded.smtpPassword, "PlaintextShouldNeverAppearOnDisk99");
      assert.equal(loaded.apiKey, "re_SecretApiKeyNeverOnDisk_12345");

      // Masked view never leaks credentials
      const masked = getMaskedEmailSettings();
      assert.equal((masked as any).smtpPassword, undefined);
      assert.equal((masked as any).apiKey, undefined);

      // Explicit clearing removes stored credentials
      const cleared = saveEmailSettings({ clearSmtpPassword: true, clearApiKey: true });
      assert.equal(cleared.passwordConfigured, false);
      assert.equal(cleared.apiKeyConfigured, false);
      const loadedAfterClear = getEmailSettings();
      assert.equal(loadedAfterClear.smtpPassword, "");
      assert.equal(loadedAfterClear.apiKey, "");
    });

    it("should fail closed on legacy plaintext file without key, and auto-migrate when key is configured", () => {
      const legacyPath = path.join(tmpDir, "legacy-plaintext.json");
      fs.writeFileSync(
        legacyPath,
        JSON.stringify({
          providerType: "SMTP",
          isEnabled: true,
          senderName: "Legacy",
          senderEmail: "legacy@example.com",
          smtpHost: "mail.example.com",
          smtpPort: 587,
          smtpUser: "legacy-user",
          smtpPassword: "LegacyPlainPassword#123"
        }),
        "utf8"
      );

      // Without key -> fails closed
      setEmailSettingsFilePathForTesting(legacyPath);
      setEmailEncryptionKeyForTesting(null);
      assert.throws(() => getEmailSettings(), EmailEncryptionError);

      // With valid key -> auto-migrates in place & strips plaintext
      setEmailSettingsFilePathForTesting(legacyPath);
      setEmailEncryptionKeyForTesting(VALID_KEY);
      const settings = getEmailSettings();
      assert.equal(settings.smtpPassword, "LegacyPlainPassword#123");

      const migratedDisk = fs.readFileSync(legacyPath, "utf8");
      assert.equal(migratedDisk.includes("LegacyPlainPassword#123"), false);
      const parsedDisk = JSON.parse(migratedDisk);
      assert.equal(parsedDisk.smtpPassword, undefined);
      assert.equal(parsedDisk.smtpPasswordEncrypted.alg, "aes-256-gcm");
    });
  });

  describe("B. Strict SMTP TLS Verification & Secret-Safe Logging", () => {
    it("should fail untrusted SMTP certificate (rejectUnauthorized: true) and succeed when CA is trusted on direct TLS", async () => {
      const receivedMails: Array<{ authLine?: string; data: string }> = [];
      const smtpServer = tls.createServer(
        {
          key: certPair.key,
          cert: certPair.cert
        },
        (socket) => attachSmtpProtocol(socket, (mail) => receivedMails.push(mail))
      );

      await new Promise<void>((resolve) => smtpServer.listen(0, "127.0.0.1", () => resolve()));
      const addr = smtpServer.address() as net.AddressInfo;

      try {
        setAllowPrivateSmtpForTesting(true);
        const secretPass = "UltraSecretSmtpPass_8812!";
        const baseConfig = saveEmailSettings({
          providerType: "SMTP",
          isEnabled: true,
          senderName: "Test System",
          senderEmail: "noreply@example.com",
          smtpHost: "127.0.0.1",
          smtpPort: addr.port,
          smtpSecure: true,
          smtpUser: "smtp-admin",
          smtpPassword: secretPass
        });
        assert.ok(baseConfig);

        // 1. Without trusting self-signed CA, strict TLS verification MUST reject the connection
        setSmtpTlsOptionsForTesting(null);
        const failRes = await sendEmail({
          to: "user@example.com",
          subject: "TLS Untrusted Test",
          html: "<p>Hello</p>"
        });
        assert.equal(failRes.success, false);
        assert.equal(receivedMails.length, 0);
        // Secret password must NEVER appear in logs or error message
        const combinedLogsFail = `${failRes.error || ""} ${failRes.logs.join("\n")}`;
        assert.equal(combinedLogsFail.includes(secretPass), false);

        // 2. With trusted CA explicitly pinned, TLS handshake succeeds cleanly
        setSmtpTlsOptionsForTesting({ ca: certPair.cert, servername: "localhost" });
        const okRes = await sendEmail({
          to: "user@example.com",
          subject: "TLS Trusted Test",
          html: "<p>Verified TLS Delivery</p>"
        });
        assert.equal(okRes.success, true, `Expected TLS SMTP send to succeed, got logs: ${okRes.logs.join(" | ")}`);
        assert.equal(receivedMails.length, 1);
        assert.ok(receivedMails[0].data.includes("Verified TLS Delivery"));
        assert.equal(okRes.logs.join("\n").includes(secretPass), false);
      } finally {
        smtpServer.close();
      }
    });

    it("should enforce STARTTLS on plaintext SMTP port 587 / non-465 requireTLS and reject untrusted cert", async () => {
      const receivedMails: Array<{ authLine?: string; data: string }> = [];
      const starttlsServer = net.createServer((rawSocket) => {
        let buffer = "";
        let upgraded = false;
        rawSocket.write("220 localhost ESMTP StartTlsServer\r\n");

        const onPlainData = (chunk: Buffer) => {
          if (upgraded) return;
          buffer += chunk.toString("utf8");
          while (buffer.includes("\r\n")) {
            const idx = buffer.indexOf("\r\n");
            const line = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const upper = line.toUpperCase();
            if (upper.startsWith("EHLO ") || upper.startsWith("HELO ")) {
              rawSocket.write("250-localhost Hello\r\n250 STARTTLS\r\n");
            } else if (upper === "STARTTLS") {
              upgraded = true;
              rawSocket.removeListener("data", onPlainData);
              rawSocket.write("220 2.0.0 Ready to start TLS\r\n");
              const tlsSocket = new tls.TLSSocket(rawSocket, {
                isServer: true,
                key: certPair.key,
                cert: certPair.cert
              });
              tlsSocket.on("error", () => {});
              attachSmtpProtocol(tlsSocket, (mail) => receivedMails.push(mail), false);
              break;
            }
          }
        };
        rawSocket.on("data", onPlainData);
      });

      await new Promise<void>((resolve) => starttlsServer.listen(0, "127.0.0.1", () => resolve()));
      const addr = starttlsServer.address() as net.AddressInfo;

      try {
        setAllowPrivateSmtpForTesting(true);
        saveEmailSettings({
          providerType: "SMTP",
          isEnabled: true,
          senderName: "STARTTLS Tester",
          senderEmail: "noreply@example.com",
          smtpHost: "127.0.0.1",
          smtpPort: addr.port,
          smtpSecure: false,
          smtpUser: "starttls-user",
          smtpPassword: "StartTlsSecretPassword#1"
        });

        // Untrusted CA fails during STARTTLS
        setSmtpTlsOptionsForTesting(null);
        const failRes = await sendEmail({
          to: "user@example.com",
          subject: "STARTTLS Fail Test",
          html: "<p>Hi</p>"
        });
        assert.equal(failRes.success, false);
        assert.equal(receivedMails.length, 0);

        // Trusted CA succeeds over STARTTLS
        setSmtpTlsOptionsForTesting({ ca: certPair.cert, servername: "localhost" });
        const okRes = await sendEmail({
          to: "user@example.com",
          subject: "STARTTLS Success Test",
          html: "<p>Encrypted via STARTTLS</p>"
        });
        assert.equal(okRes.success, true, `STARTTLS failed: ${okRes.logs.join(" | ")}`);
        assert.equal(receivedMails.length, 1);
      } finally {
        starttlsServer.close();
      }
    });

    it("should enforce SMTP connection timeouts and sanitize sensitive tokens/OTPs from logs", async () => {
      const hangingServer = net.createServer((socket) => {
        // Accept TCP connection but send zero SMTP banner bytes so greetingTimeout triggers
        socket.on("error", () => {});
      });
      await new Promise<void>((resolve) => hangingServer.listen(0, "127.0.0.1", () => resolve()));
      const addr = hangingServer.address() as net.AddressInfo;

      try {
        setAllowPrivateSmtpForTesting(true);
        setSmtpTimeoutsForTesting({ connectionTimeout: 150, greetingTimeout: 150, socketTimeout: 150 });
        saveEmailSettings({
          providerType: "SMTP",
          isEnabled: true,
          senderEmail: "noreply@example.com",
          smtpHost: "127.0.0.1",
          smtpPort: addr.port,
          smtpSecure: false,
          smtpUser: "u",
          smtpPassword: "MySecretPasswordToScrub"
        });

        const startedAt = Date.now();
        const res = await sendEmail({
          to: "user@example.com",
          subject: "Timeout Test",
          html: "<p>Hi</p>"
        });
        const elapsed = Date.now() - startedAt;
        assert.equal(res.success, false);
        assert.ok(elapsed < 4000, `Expected fast SMTP timeout, took ${elapsed}ms`);
      } finally {
        hangingServer.close();
      }

      const scrubbed = sanitizeEmailLogText(
        "Failed AUTH PLAIN dXNlcjpwYXNz with Bearer tok_abc_12345 pass=MySecretPasswordToScrub OTP 482910",
        ["MySecretPasswordToScrub", "re_secret_api_key"]
      );
      assert.equal(scrubbed.includes("MySecretPasswordToScrub"), false);
      assert.equal(scrubbed.includes("tok_abc_12345"), false);
      assert.equal(scrubbed.includes("dXNlcjpwYXNz"), false);
      assert.equal(scrubbed.includes("482910"), false);
    });
  });

  describe("C. Webhook SSRF Protection & HTTPS Transport Security", () => {
    it("should reject non-HTTPS, URL credentials, private/reserved IPs, IPv6 ULA/loopback/mapped, and DNS rebinding", async () => {
      const blockedUrls = [
        "http://api.example.com/email",
        "https://user:pass@api.example.com/email",
        "https://localhost/email",
        "https://127.0.0.1/email",
        "https://10.0.0.5/email",
        "https://172.16.12.1/email",
        "https://192.168.1.50/email",
        "https://169.254.169.254/latest/meta-data",
        "https://[::1]/email",
        "https://[fc00::1]/email",
        "https://[fd12:3456::1]/email",
        "https://[fe80::1]/email",
        "https://[::ffff:127.0.0.1]/email",
        "https://[::ffff:169.254.169.254]/email",
        "https://metadata.google.internal/computeMetadata/v1/"
      ];

      for (const badUrl of blockedUrls) {
        await assert.rejects(() => validateWebhookUrl(badUrl), EmailValidationError, `Expected block for ${badUrl}`);
      }

      assert.equal(isPrivateOrReservedIp("::ffff:127.0.0.1"), true);
      assert.equal(isPrivateOrReservedIp("8.8.8.8"), false);
      assert.equal(isPrivateOrReservedIp("2606:4700:4700::1111"), false);

      // DNS lookup resolving an external domain to internal private IP must fail (DNS rebinding protection)
      setDnsLookupOverrideForTesting(async () => [
        { address: "93.184.216.34", family: 4 },
        { address: "10.0.0.8", family: 4 }
      ]);
      await assert.rejects(() => validateWebhookUrl("https://evil-dual-record.example.com/hook"), EmailValidationError);
      await assert.rejects(() => validateSmtpHost("evil-dual-smtp.example.com"), EmailValidationError);

      // Public DNS resolution succeeds and returns pinned public IP
      setDnsLookupOverrideForTesting(async () => [{ address: "151.101.1.69", family: 4 }]);
      const validated = await validateWebhookUrl("https://api.resend.com/emails");
      assert.equal(validated.pinnedIp, "151.101.1.69");
      assert.equal(validated.family, 4);
    });

    it("should block forbidden security headers and CRLF injection in custom headers", () => {
      assert.throws(() => parseSafeCustomHeaders("Authorization: Bearer evil"), EmailValidationError);
      assert.throws(() => parseSafeCustomHeaders("Host: metadata.google.internal"), EmailValidationError);
      assert.throws(() => parseSafeCustomHeaders("X-Postmark-Server-Token: stolen"), EmailValidationError);
      assert.throws(() => parseSafeCustomHeaders("Cookie: session=abc"), EmailValidationError);
      assert.throws(() => parseSafeCustomHeaders("X-Bad\0Header: val"), EmailValidationError);

      const ok = parseSafeCustomHeaders("X-App-Source: SalesDashboard\nX-Environment: production");
      assert.deepEqual(ok, {
        "X-App-Source": "SalesDashboard",
        "X-Environment": "production"
      });
    });

    it("should reject HTTP 3xx redirects, >64KB response bombs, slow hangs, and deliver GENERIC/RESEND/POSTMARK over strict HTTPS", async () => {
      let mode: "OK" | "REDIRECT" | "OVERSIZE" | "HANG" = "OK";
      const capturedRequests: Array<{ headers: http.IncomingHttpHeaders; body: any; method?: string }> = [];

      const httpsServer = https.createServer(
        {
          key: certPair.key,
          cert: certPair.cert
        },
        (req, res) => {
          const chunks: Buffer[] = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => {
            const raw = Buffer.concat(chunks).toString("utf8");
            capturedRequests.push({
              method: req.method,
              headers: req.headers,
              body: raw ? JSON.parse(raw) : null
            });

            if (mode === "REDIRECT") {
              res.writeHead(302, { Location: "http://169.254.169.254/latest/meta-data" });
              res.end();
              return;
            }
            if (mode === "OVERSIZE") {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end("A".repeat(WEBHOOK_MAX_RESPONSE_BYTES + 2048));
              return;
            }
            if (mode === "HANG") {
              // Deliberately never respond
              return;
            }

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ id: "msg_ok_123" }));
          });
        }
      );

      await new Promise<void>((resolve) => httpsServer.listen(0, "127.0.0.1", () => resolve()));
      const addr = httpsServer.address() as net.AddressInfo;

      try {
        setAllowPrivateWebhookForTesting(true);
        setWebhookTlsOptionsForTesting({ ca: certPair.cert, servername: "localhost" });

        // 1. RESEND adapter
        saveEmailSettings({
          providerType: "WEBHOOK_API",
          webhookProvider: "RESEND",
          isEnabled: true,
          senderName: "Sales",
          senderEmail: "sales@example.com",
          apiUrl: `https://localhost:${addr.port}/emails`,
          apiKey: "re_test_key_998877",
          customHeaders: "X-Custom-Tenant: tabarestan"
        });
        const resendRes = await sendEmail({
          to: "buyer@example.com",
          subject: "Resend Test",
          html: "<p>Resend Body</p>"
        });
        assert.equal(resendRes.success, true, `Resend failed: ${resendRes.logs.join(" | ")}`);
        assert.equal(capturedRequests.length, 1);
        assert.equal(capturedRequests[0].headers["authorization"], "Bearer re_test_key_998877");
        assert.equal(capturedRequests[0].headers["x-custom-tenant"], "tabarestan");
        assert.deepEqual(capturedRequests[0].body.to, ["buyer@example.com"]);
        assert.equal(resendRes.logs.join("\n").includes("re_test_key_998877"), false);

        // 2. POSTMARK adapter
        saveEmailSettings({
          providerType: "WEBHOOK_API",
          webhookProvider: "POSTMARK",
          isEnabled: true,
          senderName: "Sales",
          senderEmail: "sales@example.com",
          apiUrl: `https://localhost:${addr.port}/email`,
          apiKey: "pm_server_token_5544"
        });
        const pmRes = await sendEmail({
          to: "buyer@example.com",
          subject: "Postmark Test",
          html: "<p>PM</p>"
        });
        assert.equal(pmRes.success, true);
        assert.equal(capturedRequests[1].headers["x-postmark-server-token"], "pm_server_token_5544");
        assert.equal(capturedRequests[1].body.MessageStream, "outbound");
        assert.equal(capturedRequests[1].body.HtmlBody, "<p>PM</p>");

        // 3. Reject HTTP 302 redirect (SSRF bypass prevention)
        mode = "REDIRECT";
        const redirectRes = await sendEmail({ to: "buyer@example.com", subject: "Redirect", html: "<p>x</p>" });
        assert.equal(redirectRes.success, false);

        // 4. Reject > 64KB response body
        mode = "OVERSIZE";
        const oversizeRes = await sendEmail({ to: "buyer@example.com", subject: "Oversize", html: "<p>x</p>" });
        assert.equal(oversizeRes.success, false);

        // 5. Timeout enforcement
        mode = "HANG";
        setWebhookTimeoutForTesting(150);
        const hangStart = Date.now();
        const hangRes = await sendEmail({ to: "buyer@example.com", subject: "Hang", html: "<p>x</p>" });
        assert.equal(hangRes.success, false);
        assert.ok(Date.now() - hangStart < 3000);
      } finally {
        httpsServer.close();
      }
    });
  });
});
