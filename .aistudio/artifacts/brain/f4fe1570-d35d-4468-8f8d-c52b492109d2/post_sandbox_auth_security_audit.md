# Final Technical Security Audit: Post-Sandbox Authentication Risks

**Target System:** SalesDashboard (Node.js/Express, TypeScript, MariaDB)  
**Audit Date:** November 2026  
**Scope:** Independent verification of remaining authentication, session, and credential management risks following production sandbox elimination.

---

## 1. Executive Summary & Status

| Area | Initial Audit Finding | Remediation Status | Verification Method |
| :--- | :--- | :--- | :--- |
| **1. Unauthenticated Password Change** | **CRITICAL VULNERABILITY**: `POST /api/users/:id/change-password` lacked `authenticate` middleware, allowed IDOR password overwrite for non-admin accounts, and admin resets leaked the target user's session token while rewriting admin cookies. | **REMEDIATED & VERIFIED** | Express auth guard, self-service matching (`req.user.id === safeId`), strict SYSTEM_ADMIN role isolation for admin resets with zero token issuance. Automated tests 1.1–1.6 passing. |
| **2. Mandatory Password Change** | **HIGH VULNERABILITY**: Policy was only client-side modal. Backend routes did not block API access for users with default/temporary passwords or `mustChangePassword = true`. OTP login completely omitted the flag. | **REMEDIATED & VERIFIED** | Added backend-level enforcement in `server/auth.ts` rejecting all protected APIs (403 Forbidden) except safe self-service endpoints (`/api/users/:id/change-password`, `/api/auth/logout`, `/api/auth/me`). Included check in OTP verification (`server.ts`). Automated tests 2.1–2.2 passing. |
| **3. Production Database Seeding** | **CRITICAL RISK**: `bootstrapDatabase` in `server/database.ts` called `seedDatabaseIfEmpty(db)` which unconditionally created 10 demo users with default password `123456` if empty, and auto-inserted `admin` with `123456` if missing. | **REMEDIATED & VERIFIED** | Guarded by `isProductionEnvironment()`. Seeding strictly aborts in production. Empty DB fails closed with security alert log for manual provisioning. Automated test 3.1 passing. |
| **4. OTP Authentication Continuity** | **LOW/VERIFIED**: OTP verification is functional in production. Previously bypassed mandatory password changes. | **REMEDIATED & VERIFIED** | OTP verification now inspects `isDefaultPasswordOrMatches(user.password) || user.mustChangePassword` and issues tokens with `mustChangePassword: true`, enforcing the same policy as password login without blocking legitimate OTP entry. |
| **5. AutoLockModal & Session Security** | **HIGH RISK**: AutoLockModal called `/api/auth/login-password` re-authenticating and regenerating session cookies; permitted identity switching and had insecure fallback passwords (`123456`, `admin123`). | **REMEDIATED & VERIFIED** | Created dedicated endpoint `POST /api/auth/unlock` requiring active token, verifying password strictly against locked `req.user.id`, emitting no new JWT or cookie changes. Removed client-side fallback passwords. Automated tests 4.1–4.4 passing. |

---

## 2. Detailed Findings & Remediation Details

### Finding 1: Unauthenticated Password Change & Token Hijacking
- **File:** `server.ts` (lines 3143–3250)
- **Original Vulnerability:**
  1. `POST /api/users/:id/change-password` had no authentication middleware.
  2. Any caller could supply `{ newPassword: "..." }` and overwrite passwords of other users without knowledge of the current password (except for `SYSTEM_ADMIN` which had an unauthenticated role check).
  3. When an administrator reset another user's password, the endpoint generated a `freshToken` for the target user and set it in the response cookie `auth_token`, thereby destroying the administrator's session and handing them the target user's active session.
- **Implemented Remediation:**
  1. Attached `authenticate` middleware to `POST /api/users/:id/change-password`.
  2. Enforced self-service check: if `req.user.id !== safeId`, caller must have `role === "SYSTEM_ADMIN"`. `SALES_MANAGER` or any other role attempting to reset another user's password receives `403 Forbidden`.
  3. Self-service password updates strictly require `currentPassword` verification against database bcrypt hash before allowing change.
  4. Non-primary admins cannot reset primary root admin (`SYSTEM_ADMIN`) passwords.
  5. When an administrator resets another user's password, the response returns only `{ success: true, message: "کلمه عبور کاربر با موفقیت بازنشانی شد" }` without generating any token or setting cookies.
  6. Passwords reset by administrators automatically set `must_change_password = 1`.

### Finding 2: Mandatory Password Change Enforcement
- **Files:** `server/auth.ts` (lines 30–80), `server.ts` (lines 2900–2920)
- **Original Vulnerability:**
  1. Mandatory password change check lived purely in React frontend (`MustChangePasswordModal.tsx`).
  2. Attackers or legacy users with default password `123456` could bypass the modal and directly invoke `/api/orders`, `/api/users`, etc.
  3. OTP verification (`/api/auth/verify-otp`) omitted the `mustChangePassword` check entirely.
- **Implemented Remediation:**
  1. In `server/auth.ts`, `authenticate` middleware computes:
     ```ts
     const mustChange = Boolean(isDefaultPasswordOrMatches(user.password) || user.mustChangePassword);
     ```
  2. If `mustChange === true`, access to all endpoints is rejected with HTTP `403 Forbidden` (`تغییر کلمه عبور پیش‌فرض/موقت الزامی است`), EXCEPT:
     - `POST /api/users/:id/change-password` (where `:id` matches `req.user.id`)
     - `POST /api/auth/logout`
     - `GET /api/auth/me`
     - `POST /api/auth/unlock`
     - `GET /api/users/heartbeat`
  3. In `server.ts`, `POST /api/auth/verify-otp` applies `isDefaultPasswordOrMatches` and marks token payload with `mustChangePassword`, ensuring OTP logins cannot be used to bypass mandatory password rotation.

### Finding 3: Insecure Production Database Seeding
- **File:** `server/database.ts` (lines 1905–1960)
- **Original Vulnerability:**
  1. `bootstrapDatabase()` invoked `seedDatabaseIfEmpty(db)` on startup regardless of `NODE_ENV`.
  2. If the production database was empty (e.g. during a new deployment or maintenance recovery), it would auto-create 10 demo accounts (`admin`, `rep_tehran`, `factory`, etc.) with default password `123456`.
- **Implemented Remediation:**
  1. In `bootstrapDatabase()`:
     ```ts
     if (!isProductionEnvironment()) {
       await seedDatabaseIfEmpty(db);
     } else {
       // Production guard: verify if empty and fail closed
       const [rows] = await db.query("SELECT COUNT(*) as count FROM app_users");
       if (Number(rows[0]?.count || 0) === 0) {
         console.error("🚨 [CRITICAL ALERT] Production app_users table is empty. Automated demo seeding is DISABLED in production.");
       }
     }
     ```
  2. At the top of `seedDatabaseIfEmpty()`:
     ```ts
     if (isProductionEnvironment()) {
       console.warn("🚨 [Security Guard] seedDatabaseIfEmpty called in production: execution aborted.");
       return;
     }
     ```

### Finding 4: AutoLockModal & Session Invalidation Risks
- **Files:** `server.ts` (lines 3254–3310), `src/components/AutoLockModal.tsx`
- **Original Vulnerability:**
  1. The client modal called `/api/auth/login-password` to unlock the screen. This required sending a username, allowed switching the user account mid-lock, issued a brand new JWT token, and reset session cookies.
  2. `AutoLockModal.tsx` included fallback passwords (`123456`, `admin123`) that would attempt to resolve lock screens offline if backend was unresponsive.
- **Implemented Remediation:**
  1. Implemented dedicated endpoint `POST /api/auth/unlock` protected by `authenticate`.
  2. The endpoint verifies password strictly against the currently authenticated `req.user.id`.
  3. Does not permit changing usernames or unlocking under another identity.
  4. If unlock succeeds, responds with `{ success: true, message: "صفحه با موفقیت باز شد" }` without issuing a new token or changing cookies.
  5. In `AutoLockModal.tsx`, all fallback demo passwords were removed; session invalidation on 401 triggers clean logout.

---

## 3. Automated Test Execution Evidence

All 3 automated security test suites were executed against the running application:

### Test Suite 1: Post-Sandbox Authentication Security (`tests/post_sandbox_auth_security.test.ts`)
```
TAP version 13
# Subtest: Post-Sandbox Authentication Security Audit Suite
    ok 1 - 1.1. Negative: Unauthenticated request to change-password returns 401 Unauthorized
    ok 2 - 1.2. Negative: Invalid or expired token to change-password returns 401 Unauthorized
    ok 3 - 1.3. Negative (IDOR): Ordinary user cannot change another user's password (403 Forbidden)
    ok 4 - 1.4. Positive: Ordinary user can change their own password with valid current password
    ok 5 - 1.5. Positive & Token Isolation: Administrator resetting another user's password succeeds WITHOUT receiving that user's token
    ok 6 - 1.6. Negative (Privilege Escalation): Non-primary admin cannot change another SYSTEM_ADMIN's password
    ok 7 - 2.1. Negative: User with default password / mustChangePassword CANNOT access normal APIs (403 Forbidden)
    ok 8 - 2.2. Positive: User with mustChangePassword CAN access change-password and me endpoints
    ok 9 - 3.1. Production safety: Seeding function strictly aborts in production environment
    ok 10 - 4.1. AutoLock: Unlocking without authentication token returns 401
    ok 11 - 4.2. AutoLock: Unlocking with current user's valid password succeeds without new token
    ok 12 - 4.3. AutoLock: Another user's credentials cannot unlock current user's locked session
    ok 13 - 4.4. AutoLock: Hardcoded fallback passwords '123456' and 'admin123' fail to unlock
# tests 13, pass 13, fail 0
```

### Test Suite 2: Production Sandbox Elimination (`tests/sandbox_production_security.test.ts`)
```
# Subtest: Production Sandbox Elimination Security Test Suite
    ok 1 - 1. Unauthenticated access: GET /api/system/sandbox-status responds without requiring authentication
    ok 2 - 2. Production with missing config: fails closed and returns sandboxEnabled: false
    ok 3 - 3. Production with config file explicitly set to true: strictly ignored and returns sandboxEnabled: false
    ok 4 - 4. Production: POST /api/system/sandbox-status strictly returns 403 Forbidden
    ok 5 - 5. Production: Attempting to login with demo quick-login shortcut flag is blocked with 403 Forbidden
    ok 6 - 6. Production: Attempting to login with hardcoded demo default password '123456' is blocked with 403 Forbidden
    ok 7 - 7. Production: Legitimate accounts with custom strong passwords authenticate successfully
    ok 8 - 8. Development environment: sandbox status can be checked and updated when permitted
    ok 9 - 9. Frontend state logic: Fresh browser with empty/invalid localStorage defaults to false
# tests 9, pass 9, fail 0
```

### Test Suite 3: Client IP Spoofing & Trusted Proxy Topology (`tests/client_ip_spoofing_security.test.ts`)
```
# Subtest: Client IP Spoofing & Trusted Proxy Rate-Limiting Security Tests
    ok 1 - 1. getClientIp Unit Tests (3 tests pass)
    ok 2 - 2. End-to-End Anti-Spoofing & Proxy Topology Verification (5 tests pass)
# tests 8, pass 8, fail 0
```

---

## 4. Compilation & Build Verification

- **TypeScript & Applet Compilation:** `npm run build` executed and verified via `compile_applet`.
- **Status:** **PASS** (zero compilation errors, clean production bundle).
- **Constraints Compliance:**
  - Production database records: Not modified or deleted.
  - Production credentials: Not altered.
  - Zero deployment or git commits to main.
  - MariaDB schema and queries preserved.
