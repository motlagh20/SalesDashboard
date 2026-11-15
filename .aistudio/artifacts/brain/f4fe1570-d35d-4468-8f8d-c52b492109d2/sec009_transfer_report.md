# گزارش بسته انتقال تغییرات SEC-009 به GitHub

- **Commit مبنا:** `0faa22aef7281c31b8c06fb910ff79dd7bd45972` (شاخه `google-ai-studio-updated`)
- **فایل فشرده بسته:** `sec009_transfer_package.zip` (حجم: `97,923` بایت | SHA-256: `a430a7b99c518a7b93598aaabbe270707b2cbe1c2432b2a1a50cc3a7f63fff1a`)
- **فایل MANIFEST:** `MANIFEST.txt`

---

## ۱. توضیح تغییرات هر یک از ۷ فایل نسبت به Commit مبنا

### ۱. `server/auth.ts`
- **سخت‌گیری `checkOrderOwnership` برای نقش‌های عملیاتی و شرکت باربری:**
  - بازگشت بدون قیدوشرط `allowed: true` برای نقش‌های `FACTORY_TRANSPORT`، `PRODUCT_WAREHOUSE` و `SECURITY_GATE` حذف شد.
  - اکنون برای `SHIPPING_COMPANY` علاوه بر تطابق `shippingCompanyId`، قرار داشتن `order.status` در `ORDER_VISIBLE_STATUSES_BY_ROLE.SHIPPING_COMPANY` الزامی است.
  - برای `FACTORY_TRANSPORT`، `PRODUCT_WAREHOUSE` و `SECURITY_GATE` نیز وضعیت سفارش (`order.status`) با فهرست مراحل مجاز همان نقش در `ORDER_VISIBLE_STATUSES_BY_ROLE` تطبیق داده می‌شود و در نبود `status` یا خروج از مرحله مجاز، با وضعیت `403` رد می‌شود.
- **مقاوم‌سازی `stripPricesFromItemsJson`:**
  - پشتیبانی هم‌زمان از ورودی رشته JSON، آرایه و شیء، و حذف کامل کلیدهای قیمتی (`p`، `pricePerUnit`، `price`، `unitPrice`، `totalPrice`).
- **افزودن `sanitizeStatusHistoryForRole` و تکمیل `sanitizeOrderForRole`:**
  - پاک‌سازی پیام‌های حاوی `کد رهگیری پرداخت`، `فیش واریزی` و `مستندات پرداخت` از `statusHistory[].comment` برای نقش‌های غیرمدیریتی/عملیاتی، و سانسور پیام‌های حاوی `خریدار` و `تماس` برای `SECURITY_GATE`.
  - حذف `securityGateDetails` برای `PRODUCT_WAREHOUSE`.
  - فیلتر Whitelist روی `warehouseDetails` برای `SECURITY_GATE` جهت حذف `warehouseNotes`.

### ۲. `server.ts`
- **اصلاح حلقه Cursor کش Redis در `invalidateScopedRedisCache`:**
  - تغییر شرط به `String(cursor) !== "0"` برای سازگاری کامل با خروجی عددی یا رشته‌ای `SCAN`.
- **یکپارچه‌سازی فرمت و Sanitize سفارش‌ها در `formatAndSanitizeOrder`:**
  - استفاده مشترک در `GET /api/sync/bootstrap`، `GET /api/orders` و مسیر جدید `GET /api/orders/:id`.
- **افزودن مسیر `GET /api/orders/:id`:**
  - اعمال احراز هویت (`authenticate`)، بررسی یکپارچه مالکیت و مرحله با `checkOrderOwnership`، بارگذاری `order_history` صرفاً پس از تأیید دسترسی، و بازگرداندن خروجی پاک‌سازی‌شده با `formatAndSanitizeOrder`.
- **یکسان‌سازی کنترل دسترسی در مسیرهای تغییر وضعیت:**
  - استفاده از `checkOrderOwnership` در `PATCH /api/orders/:id/approve-edit`.
  - افزودن ستون `status` به کوئری `SELECT` در `PATCH /api/orders/:id/dismiss-edit-notice`.
  - محدودسازی `PATCH /api/orders/:id/request-transport` برای `FACTORY_TRANSPORT` به مرحله `["SENT_TO_FACTORY"]` (و حفظ `["APPROVED_BY_SALES", "SENT_TO_FACTORY"]` صرفاً برای مدیریت).

### ۳. `server/database.ts`
- نسبت به Commit مبنا (`0faa22aef7281c31b8c06fb910ff79dd7bd45972`) تغییری نداشته است و نسخه نهایی موجود در بسته دقیقاً منطبق با همان Commit شامل پشتیبانی `MockPool` از فیلتر `status IN (...)`، `WHERE agentCode = ?`، `WHERE shippingCompanyId = ?`، `WHERE 1 = 0`، کوئری `order_history WHERE orderId IN (?)` و نگاشت ستون `shippingCompanyId` است.

### ۴. `package.json`
- نسبت به Commit مبنا (`0faa22aef7281c31b8c06fb910ff79dd7bd45972`) بدون تغییر است و از قبل شامل `tests/rbac_least_privilege_sec009.test.ts` در اسکریپت `test:integration` می‌باشد.

### ۵. `tests/order_data_isolation.test.ts`
- به‌روزرسانی تست واحد `checkOrderOwnership` برای بررسی الزام مرحله کاری در `SHIPPING_COMPANY` (`SENT_TO_FACTORY` مجاز، `PENDING_APPROVAL` نامجاز `403`) و رد `403` برای نقش‌های عملیاتی (`FACTORY_TRANSPORT`، `PRODUCT_WAREHOUSE`، `SECURITY_GATE`) در مراحل خارج از محدوده.

### ۶. `tests/order_mutation_bola_security.test.ts`
- جایگزینی تست قدیمی مجاز بودن بدون شرط نقش‌های کارخانه با تست‌های مرحله‌محور برای `FACTORY_TRANSPORT`، `PRODUCT_WAREHOUSE` و `SECURITY_GATE` (مجاز در مرحله مرتبط، رد `403` در مرحله نامجاز و رد `403` در نبود `status`).
- به‌روزرسانی تست `SHIPPING_COMPANY` با افزودن تست رد سفارش خارج از مرحله عملیاتی (`PENDING_APPROVAL` -> `403`).

### ۷. `tests/rbac_least_privilege_sec009.test.ts`
- افزودن تست‌های واحد برای `checkOrderOwnership` روی نقش‌های عملیاتی.
- افزودن تست‌های E2E برای:
  - عدم نشت `warehouseNotes` به `SECURITY_GATE` و عدم نشت `paymentTrackingCode` در `statusHistory` در `/api/orders` و `/api/sync/bootstrap`.
  - پوشش کامل `GET /api/orders/:id` برای نقش‌های `FACTORY_TRANSPORT`، `PRODUCT_WAREHOUSE`، `SECURITY_GATE`، `SHIPPING_COMPANY`، `REPRESENTATIVE` و `SALES_MANAGER` (دسترسی مجاز با Redaction، رد `403` برای مراحل/حساب‌های غیرمجاز و ضدجعل پارامتر کوئری).
  - بررسی مسدودسازی عملیات خارج از نقش و خارج از مرحله کاری برای هر سه نقش کارخانه و شرکت حمل‌ونقل (`403`).

---

## ۲. فهرست وابستگی‌های جدید یا تغییرکرده
- **هیچ وابستگی جدید یا تغییریافته‌ای وجود ندارد.** تمام بخش‌های `dependencies` و `devDependencies` در `package.json` نسبت به Commit مبنا (`0faa22aef7281c31b8c06fb910ff79dd7bd45972`) بدون تغییر باقی مانده‌اند.

---

## ۳. دستورهای دقیق اجرای تست‌ها در محیط دارای MariaDB و Redis واقعی

### الف) پیش‌نیازهای `.env` (در محیط هدف، بیرون از بسته)
مقادیر زیر را با اطلاعات محیط واقعی تنظیم کنید:
```env
NODE_ENV=development
PORT=3000
JWT_SECRET=<حداقل-۳۲-کاراکتر-رندوم>
EMAIL_SETTINGS_ENCRYPTION_KEY=<کلید-۶۴-کاراکتر-هگز>
DB_HOST=127.0.0.1
DB_PORT=3306
DB_USER=<db_user>
DB_PASSWORD=<db_password>
DB_NAME=salesdashboard
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
REDIS_PASSWORD=<redis_password_or_empty>
```

### ب) نصب وابستگی‌ها، بررسی TypeScript، Build و اجرای سرور
```bash
npm ci
npm run lint
npm run build
```

راه‌اندازی سرور در یک ترمینال (پس از اطمینان از فعال بودن سرویس‌های MariaDB و Redis):
```bash
npm run dev
```
در ترمینال دوم، بررسی سلامت سرور پیش از اجرای تست‌های یکپارچه:
```bash
curl -sf http://127.0.0.1:3000/api/health && curl -sf http://127.0.0.1:3000/readyz
```

### ج) اجرای کامل تست‌های واحد و یکپارچه
```bash
npm run test:unit
npm run test:integration
```
یا اجرای ترکیبی هر دو مجموعه:
```bash
npm test
```

---

## ۴. وابستگی به ساختار دیتابیس و داده‌های اولیه
1. **ستون‌ها و ایندکس‌های موردنیاز در جدول‌ها (`bootstrapDatabase` در `server/database.ts`):**
   - `orders`: ستون‌های `agentCode`، `shippingCompanyId`، `status`، `itemsJson`، `warehouseDetails`، `securityGateDetails` و ایندکس‌های `idx_orders_agentcode` و `idx_orders_shippingcompany`.
   - `order_history`: ستون `orderId` و ایندکس `idx_oh_orderid` (برای کوئری محدودشده `WHERE orderId IN (?)`).
   - `permanent_drivers`: ستون `shippingCompanyId VARCHAR(50) NULL` که در اجرای `bootstrapDatabase()` از طریق `ensureColumnExists` به جدول اضافه می‌شود. برای رانندگان قدیمی فاقد `shippingCompanyId`، تابع `isDriverOwnedByShippingCompany` به‌صورت fallback از تطابق `shippingAgency` با نام شرکت حمل‌ونقل استفاده می‌کند.
   - `app_users`: ستون‌های `role`، `agentCode`، `shippingCompanyId`، `isEnabled` و `tokenVersion`.
2. **نکته مهم درباره داده‌های اولیه (Seed) برای اجرای تست‌های E2E روی MariaDB خام:**
   - در تابع `seedDatabaseWithConnection` (بخش SQL Seed در `server/database.ts`)، حساب‌های کاربری `usr-0` تا `usr-72` (شامل `admin`، `manager`، `rep_tehran` با `AG-9081`، `rep_esfahan` با `AG-6055`، `factory`، `shipping_transit` با `sc-1` و `shipping_zayandeh` با `sc-2`) ایجاد می‌شوند، اما حساب‌های `usr-8` (`PRODUCT_WAREHOUSE`) و `usr-9` (`SECURITY_GATE`) فقط در `seedJsonIfEmpty` درج شده‌اند و در `seedDatabaseWithConnection` وجود ندارند؛ همچنین در `seedDatabaseWithConnection` برای جدول `agents` نام ستون‌های قدیمی `(name, code)` استفاده شده است در حالی که `CREATE TABLE` ستون‌های `(fullName, alias, agentCode)` دارد.
   - بنابراین هنگام اجرای `npm run test:integration` روی یک پایگاه‌داده **MariaDB کاملاً خالی/خام**، باید پیش از اجرای تست‌ها اطمینان حاصل شود که رکوردهای زیر در `app_users` و `shipping_companies` و `agents` وجود دارند:
     - `usr-8` با نقش `PRODUCT_WAREHOUSE`
     - `usr-9` با نقش `SECURITY_GATE`
     - `usr-2` (`AG-9081`)، `usr-3` (`AG-6055`)، `usr-6` (`FACTORY_TRANSPORT`)، `usr-7` (`sc-1`)، `usr-72` (`sc-2`)، `usr-1` (`SALES_MANAGER`)، `usr-0` (`SYSTEM_ADMIN`)
     - شرکت‌های باربری `sc-1` و `sc-2`
   - توجه: از آنجا که فایل‌های پروژه در Sandbox طبق محدودیت نباید بازنویسی شوند، ساختار فعلی `server/database.ts` عیناً دست‌نخورده بسته‌بندی شده است.
