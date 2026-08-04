import mysql from "mysql2/promise";
import Redis from "ioredis";
import fs from "fs";
import path from "path";

// Lazy connection instances
let pool: mysql.Pool | null = null;
let redis: Redis | null = null;

// Active error logging path
const LOG_FILE_PATH = path.join(process.cwd(), "server", "db_errors.log");

/**
 * Writes detailed database/server errors to a persistent log file in the workspace
 * so the user can easily see or retrieve exact SQL failures, duplicate key info, etc.
 */
export function writeServerErrorLog(operation: string, error: any, reqBody?: any) {
  try {
    const timestamp = new Date().toISOString();
    const errorDetails = {
      timestamp,
      operation,
      message: error?.message || "No message",
      code: error?.code || null,
      errno: error?.errno || null,
      sql: error?.sql || null,
      sqlState: error?.sqlState || null,
      stack: error?.stack || "No stack trace available",
      requestBody: reqBody ? JSON.stringify(reqBody) : "None"
    };

    const logLine = `[${timestamp}] [${operation}]
Message: ${errorDetails.message}
Code: ${errorDetails.code} | ErrNo: ${errorDetails.errno} | SqlState: ${errorDetails.sqlState}
SQL Executed: ${errorDetails.sql || "N/A"}
Request Body: ${errorDetails.requestBody}
Stack Trace: ${errorDetails.stack}
----------------------------------------------------------------------\n`;

    fs.mkdirSync(path.dirname(LOG_FILE_PATH), { recursive: true });
    fs.appendFileSync(LOG_FILE_PATH, logLine, "utf8");
    console.log(`📝 [Logger] Database error recorded in db_errors.log for: ${operation}`);
  } catch (err) {
    console.error("❌ Failed to write to error log file:", err);
  }
}

// Local Mock / Fallback database state & classes
let isFallbackMode = false;
let mockPoolInstance: MockPool | null = null;
const JSON_FILE_PATH = path.join(process.cwd(), "server", "salesdashboard.json");

function loadJsonData(): any {
  if (!fs.existsSync(JSON_FILE_PATH)) {
    const initial = {
      products: [],
      agents: [],
      shipping_companies: [],
      orders: [],
      order_history: [],
      app_users: []
    };
    fs.mkdirSync(path.dirname(JSON_FILE_PATH), { recursive: true });
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(initial, null, 2), "utf8");
    return initial;
  }
  try {
    const raw = fs.readFileSync(JSON_FILE_PATH, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed.app_users) parsed.app_users = [];
    if (!parsed.permanent_drivers) parsed.permanent_drivers = [];
    return parsed;
  } catch (err) {
    console.error("Error reading fallback JSON database:", err);
    return {
      products: [],
      agents: [],
      shipping_companies: [],
      orders: [],
      order_history: [],
      app_users: []
    };
  }
}

function saveJsonData(data: any) {
  try {
    fs.mkdirSync(path.dirname(JSON_FILE_PATH), { recursive: true });
    fs.writeFileSync(JSON_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Error writing fallback JSON database:", err);
  }
}

function seedJsonIfEmpty() {
  const data = loadJsonData();
  let changed = false;

  if (!data.products || data.products.length === 0) {
    console.log("🌱 [Mock Seed] Seeding default products...");
    data.products = [
      { id: 'prod-1', name: 'سفال سقف طبرستان (طرح کلاسیک)', category: 'roofing', pricePerUnit: 145000, unit: 'عدد', description: 'مقاومت بسیار بالا در برابر تغییرات جوی و یخبندان، عایق حرارتی و رطوبتی فوق‌العاده با لعاب طبیعی.', weight: '۳.۱ کیلوگرم', dimensions: '۳۰ × ۴۲ سانتی‌متر', coverageInfo: '۱۴ عدد در هر مترمربع', isEnabled: 1, imageUrl: 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=150&auto=format&fit=crop&q=80' },
      { id: 'prod-2', name: 'آجر سفال ۱۰ سانتی طبرستان (تیغه)', category: 'bricks', pricePerUnit: 3400, unit: 'قالب', description: 'جهت دیوارهای داخلی و فضاهای کم‌عرض، پخت با کوره تمام اتوماتیک هافمن و ابعاد کاملاً گونیا.', weight: '۲.۲ کیلوگرم', dimensions: '۱۰ × ۲۰ × ۲۰ سانتی‌متر', coverageInfo: '۲۵ قالب در هر مترمربع تیغه', isEnabled: 1, imageUrl: 'https://images.unsplash.com/photo-1584622650111-993a426fbf0a?w=150&auto=format&fit=crop&q=80' },
      { id: 'prod-3', name: 'آجر سفال ۱۵ سانتی درجه یک طبرستان', category: 'bricks', pricePerUnit: 4800, unit: 'قالب', description: 'بهترین گزینه برای دیوارهای خارجی باغ، ویلا و آپارتمان جهت عایق‌بندی صوتی و حرارتی پیشرفته.', weight: '۳.۳ کیلوگرم', dimensions: '۱۵ × ۲۰ × ۲۰ سانتی‌متر', coverageInfo: '۲۵ قالب در هر مترمربع دیوار', isEnabled: 1, imageUrl: 'https://images.unsplash.com/photo-1590069261209-f8e9b8642343?w=150&auto=format&fit=crop&q=80' },
      { id: 'prod-4', name: 'آجر نما نسوز سموتی طبرستان', category: 'facade', pricePerUnit: 12500, unit: 'قالب', description: 'مقاومت حرارتی بیش از ۱۲۰۰ درجه سانتی‌گراد، رنگ ثابت و مقاوم در برابر باران‌های اسیدی و شوره‌زدگی.', weight: '۰.۸ کیلوگرم', dimensions: '۵.۵ × ۲.۵ × ۲۶ سانتی‌متر', coverageInfo: '۴۰ قالب در هر مترمربع با بندکشی', isEnabled: 1, imageUrl: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?w=150&auto=format&fit=crop&q=80' },
      { id: 'prod-5', name: 'تیغه سفال سقفی ۲۵ طبرستان (بلوک سقفی)', category: 'bricks', pricePerUnit: 9500, unit: 'قالب', description: 'تولید شده با رس مرغوب شسته شده، مقاومت فشاری بالا و ایده آل برای سقف‌های تیرچه بلوک صنعتی.', weight: '۷.۵ کیلوگرم', dimensions: '۲۵ × ۲۰ × ۴۰ سانتی‌متر', coverageInfo: '۱۰ قالب در هر مترمربع سقف', isEnabled: 1, imageUrl: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b2?w=150&auto=format&fit=crop&q=80' }
    ];
    changed = true;
  }

  if (!data.agents || data.agents.length === 0) {
    console.log("🌱 [Mock Seed] Seeding default agents...");
    data.agents = [
      { id: 'ag-1', fullName: 'آقای حمیدرضا احمدی', alias: 'نمایندگی تهران (احمدی)', agentCode: 'AG-9081', phoneNumber: '09121111111', address: 'تهران، ابتدای جاده قدیم کرج، مجتمع تجاری پایتخت، پلاک ۱۲', area: 'استان تهران و حومه البرز', isEnabled: 1 },
      { id: 'ag-2', fullName: 'آقای علیرضا رجایی', alias: 'نمایندگی اصفهان (رجایی)', agentCode: 'AG-6055', phoneNumber: '09132222222', address: 'اصفهان، بلوار فرودگاه، نرسیده به شهرک صنعتی جی، پلاک ۴۶', area: 'استان اصفهان و یزد', isEnabled: 1 },
      { id: 'ag-3', fullName: 'آقای سهراب پوربخش', alias: 'نمایندگی رشت (پوربخش)', agentCode: 'AG-2019', phoneNumber: '09113333333', address: 'گیلان، رشت، کیلومتر ۵ جاده انزلی، جنب انبار فومن‌شیمی', area: 'استان گیلان و غربی مازندران', isEnabled: 1 },
      { id: 'ag-4', fullName: 'آقای کریم نمازی', alias: 'نمایندگی شیراز (نمازی)', agentCode: 'AG-7023', phoneNumber: '09174444444', address: 'فارس، شیراز، بلوار امیرکبیر، روبروی باغ جنت، مجتمع سفال', area: 'استان فارس و استان بوشهر', isEnabled: 1 }
    ];
    changed = true;
  }

  if (!data.shipping_companies || data.shipping_companies.length === 0) {
    console.log("🌱 [Mock Seed] Seeding default shipping companies...");
    data.shipping_companies = [
      { id: 'sc-1', name: 'باربری ترانزیت طبرستان', code: 'SC-101', phoneNumber: '01133334444', managerName: 'آقای صالحی', address: 'ساری، کیلومتر ۳ جاده فیروزکوه، پایانه باربری ترانزیت', isEnabled: 1 },
      { id: 'sc-2', name: 'باربری زاینده‌رود طبرستان', code: 'SC-102', phoneNumber: '01133335555', managerName: 'آقای صادقی', address: 'اصفهان، شهرک صنعتی جی، خیابان چهارم، پایانه باربری زاینده‌رود', isEnabled: 1 },
      { id: 'sc-3', name: 'اتوبار کاسپین طبرستان', code: 'SC-103', phoneNumber: '01133336666', managerName: 'آقای احمدی', address: 'رشت، جاده انزلی، جنب پایانه حمل و نقل کاسپین', isEnabled: 1 }
    ];
    changed = true;
  }

  if (!data.permanent_drivers || data.permanent_drivers.length === 0) {
    console.log("🌱 [Mock Seed] Seeding default permanent drivers...");
    data.permanent_drivers = [
      { id: 'drv-1', driverName: 'کریم قنبری', driverPhone: '09117772222', licensePlate: '۵۴ ع ۸۹۲ ایران ۷۲', vehicleType: 'تریلی ۱۸ چرخ لبه‌دار', shippingAgency: 'باربری ترانزیت شمال', nationalCode: '2081234567', smartCardNumber: '3849201', isEnabled: 1 },
      { id: 'drv-2', driverName: 'غلامرضا صادقی', driverPhone: '09139998888', licensePlate: '۷۲ ب ۵۵۱ ایران ۵۳', vehicleType: 'کامیون جفت ۱۰ تن', shippingAgency: 'باربری زاینده‌رود', nationalCode: '1289876543', smartCardNumber: '4920183', isEnabled: 1 },
      { id: 'drv-3', driverName: 'مرتضی حسینی', driverPhone: '09112223344', licensePlate: '۳۶ ج ۱۴۵ ایران ۶۲', vehicleType: 'خاور مسقف', shippingAgency: 'باربری کاسپین', nationalCode: '2093344556', smartCardNumber: '1092837', isEnabled: 1 },
      { id: 'drv-4', driverName: 'جواد علوی', driverPhone: '09112523456', licensePlate: '۶۲ ع ۴۸۱ ایران ۷۲', vehicleType: 'تریلی ۱۸ چرخ لبه‌دار', shippingAgency: 'باربری ترانزیت طبرستان', nationalCode: '2089988771', smartCardNumber: '5544332', isEnabled: 1 }
    ];
    changed = true;
  }

  if (!data.orders || data.orders.length === 0) {
    console.log("🌱 [Mock Seed] Seeding default orders...");
    data.orders = [
      {
        id: 'ord-101',
        orderNumber: 'TCI-1402-01',
        customerName: 'نمایندگی تهران (احمدی)',
        agentCode: 'AG-9081',
        productId: 'prod-1',
        productName: 'سفال سقف طبرستان (طرح کلاسیک)',
        quantity: 12000,
        unit: 'عدد',
        destinationCity: 'تهران - شهریار',
        exactAddress: 'سایت پروژه تفریحی دیپلمات، میدان نماز، انتهای بلوار کلهر، پلاک ۶۴',
        phoneNumber: '09121111111',
        notes: 'تحویل اضطراری تا پایان هفته. هماهنگی قبل از ارسال الزامی است.',
        createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'LOADED_AND_DISPATCHED',
        vehicleType: 'تریلی ۱۸ چرخ لبه‌دار',
        driverName: 'کریم قنبری',
        driverPhone: '09117772222',
        licensePlate: '۵۴ ع ۸۹۲ ایران ۷۲',
        shippingAgency: 'باربری ترانزیت شمال',
        estimatedArrival: '۲۴ ساعت آینده',
        priorityIndex: 0,
        sentToFactoryAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
        rejectionReason: null
      },
      {
        id: 'ord-102',
        orderNumber: 'TCI-1402-02',
        customerName: 'نمایندگی اصفهان (رجایی)',
        agentCode: 'AG-6055',
        productId: 'prod-3',
        productName: 'آجر سفال ۱۵ سانتی درجه یک طبرستان',
        quantity: 18000,
        unit: 'قالب',
        destinationCity: 'اصفهان - شهرک صنعتی جی',
        exactAddress: 'انبار مرکزی نمایندگی رجایی، خیابان دهم، پلاک ۲',
        phoneNumber: '09132222222',
        notes: 'لطفاً بارگیری از کوره تمام اتوماتیک شماره ۲ باشد.',
        createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
        status: 'VEHICLE_ASSIGNED',
        vehicleType: 'کامیون جفت ۱۰ تن',
        driverName: 'غلامرضا صادقی',
        driverPhone: '09139998888',
        licensePlate: '۷۲ ب ۵۵۱ ایران ۵۳',
        shippingAgency: 'باربری زاینده‌رود',
        estimatedArrival: 'فردا صبح ساعت ۸',
        priorityIndex: 0,
        rejectionReason: null,
        sentToFactoryAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString()
      },
      {
        id: 'ord-103',
        orderNumber: 'TCI-1402-03',
        customerName: 'نمایندگی رشت (پوربخش)',
        agentCode: 'AG-2019',
        productId: 'prod-2',
        productName: 'آجر سفال ۱۰ سانتی طبرستان (تیغه)',
        quantity: 25000,
        unit: 'قالب',
        destinationCity: 'گیلان - رشت',
        exactAddress: 'پروژه تعاونی فرهنگیان، جاده انزلی، نرسیده به پلیس راه',
        phoneNumber: '09113333333',
        createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
        status: 'APPROVED_BY_SALES',
        priorityIndex: 0,
        rejectionReason: null,
        sentToFactoryAt: null,
        vehicleType: null,
        driverName: null,
        driverPhone: null,
        licensePlate: null,
        shippingAgency: null,
        estimatedArrival: null
      },
      {
        id: 'ord-104',
        orderNumber: 'TCI-1402-04',
        customerName: 'نمایندگی شیراز (نمازی)',
        agentCode: 'AG-7023',
        productId: 'prod-4',
        productName: 'آجر نما نسوز سموتی طبرستان',
        quantity: 8000,
        unit: 'قالب',
        destinationCity: 'فارس - شیراز',
        exactAddress: 'بلوار معالی آباد، کوچه ۱۲، پلاک آخر سمت چپ',
        phoneNumber: '09174444444',
        createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
        status: 'PENDING_APPROVAL',
        priorityIndex: 0,
        rejectionReason: null,
        sentToFactoryAt: null,
        vehicleType: null,
        driverName: null,
        driverPhone: null,
        licensePlate: null,
        shippingAgency: null,
        estimatedArrival: null
      }
    ];

    data.order_history = [
      { id: 1, orderId: 'ord-101', status: 'PENDING_APPROVAL', updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(), comment: 'ثبت سفارش توسط نمایندگی احمدی' },
      { id: 2, orderId: 'ord-101', status: 'APPROVED_BY_SALES', updatedAt: new Date(Date.now() - 2.5 * 24 * 60 * 60 * 1000).toISOString(), comment: 'تایید حجم سفارش توسط واحد مالی و فروش تهران' },
      { id: 3, orderId: 'ord-101', status: 'VEHICLE_ASSIGNED', updatedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(), comment: 'اختصاص تریلی ۱۸ چرخ البرز به رانندگی قنبری' },
      { id: 4, orderId: 'ord-101', status: 'LOADED_AND_DISPATCHED', updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), comment: 'بارگیری انجام شد و کامیون به مقصد حرکت کرد.' },
      { id: 5, orderId: 'ord-102', status: 'PENDING_APPROVAL', updatedAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(), comment: 'سفارش جدید نمایندگی اصفهان' },
      { id: 6, orderId: 'ord-102', status: 'APPROVED_BY_SALES', updatedAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(), comment: 'تایید سقف اعتباری و حواله مالی' },
      { id: 7, orderId: 'ord-102', status: 'VEHICLE_ASSIGNED', updatedAt: new Date(Date.now() - 0.2 * 24 * 60 * 60 * 1000).toISOString(), comment: 'معرفی کامیون جفت جهت بارگیری فردا صبح' },
      { id: 8, orderId: 'ord-103', status: 'PENDING_APPROVAL', updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000 - 10000).toISOString(), comment: 'ثبت سیستم شد' },
      { id: 9, orderId: 'ord-103', status: 'APPROVED_BY_SALES', updatedAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(), comment: 'مدیریت فروش سفارش را به کارخانه ارجاع داد.' },
      { id: 10, orderId: 'ord-104', status: 'PENDING_APPROVAL', updatedAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(), comment: 'در انتظار بررسی بخش مدیریت مالی و فروش' }
    ];
    changed = true;
  }

  if (!data.app_users || data.app_users.length === 0) {
    console.log("🌱 [Mock Seed] Seeding default app users...");
    data.app_users = [
      { id: 'usr-0', username: 'admin', fullName: 'ادمین ارشد نرم‌افزار', phoneNumber: '09120000000', role: 'SYSTEM_ADMIN', agentCode: null, shippingCompanyId: null, isEnabled: 1, password: '123456' },
      { id: 'usr-1', username: 'manager', fullName: 'آقای احمدی (مدیر بازرگانی)', phoneNumber: '09121111111', role: 'SALES_MANAGER', agentCode: null, shippingCompanyId: null, isEnabled: 1, password: '123456' },
      { id: 'usr-2', username: 'rep_tehran', fullName: 'آقای حمیدرضا احمدی', phoneNumber: '09120000001', role: 'REPRESENTATIVE', agentCode: 'AG-9081', shippingCompanyId: null, isEnabled: 1, password: '123456' },
      { id: 'usr-3', username: 'rep_esfahan', fullName: 'آقای علیرضا رجایی', phoneNumber: '09130000002', role: 'REPRESENTATIVE', agentCode: 'AG-6055', shippingCompanyId: null, isEnabled: 1, password: '123456' },
      { id: 'usr-4', username: 'rep_rasht', fullName: 'آقای سهراب پوربخش', phoneNumber: '09110000003', role: 'REPRESENTATIVE', agentCode: 'AG-2019', shippingCompanyId: null, isEnabled: 1, password: '123456' },
      { id: 'usr-5', username: 'rep_shiraz', fullName: 'آقای کریم نمازی', phoneNumber: '09170000004', role: 'REPRESENTATIVE', agentCode: 'AG-7023', shippingCompanyId: null, isEnabled: 1, password: '123456' },
      { id: 'usr-6', username: 'factory', fullName: 'مسئول فروش کارخانه', phoneNumber: '09110000005', role: 'FACTORY_TRANSPORT', agentCode: null, shippingCompanyId: null, isEnabled: 1, password: '123456' },
      { id: 'usr-7', username: 'shipping_transit', fullName: 'باربری ترانزیت طبرستان', phoneNumber: '09110000006', role: 'SHIPPING_COMPANY', agentCode: null, shippingCompanyId: 'sc-1', isEnabled: 1, password: '123456' }
    ];
    changed = true;
  } else {
    // Ensure SYSTEM_ADMIN (admin) exists even if app_users already had data
    const hasAdmin = data.app_users.some((u: any) => u.username === 'admin' || u.role === 'SYSTEM_ADMIN' || u.phoneNumber === '09120000000');
    if (!hasAdmin) {
      console.log("🛡️ [Mock Seed] Auto-inserting missing SYSTEM_ADMIN (admin) user...");
      data.app_users.unshift({
        id: 'usr-0',
        username: 'admin',
        fullName: 'ادمین ارشد نرم‌افزار',
        phoneNumber: '09120000000',
        role: 'SYSTEM_ADMIN',
        agentCode: null,
        shippingCompanyId: null,
        isEnabled: 1,
        password: '123456'
      });
      changed = true;
    }
  }

  if (changed) {
    saveJsonData(data);
  }
}

function executeQuery(sql: string, values: any[] = []): any {
  const cleanSql = sql.trim().replace(/\s+/g, " ");
  const jsonData = loadJsonData();

  if (/SELECT\s+1/i.test(cleanSql)) {
    return [[{ 1: 1 }], []];
  }

  // APP_USERS CUSTOM MOCK QUERIES
  if (/SELECT\s+\*\s+FROM\s+app_users/i.test(cleanSql)) {
    let result = jsonData.app_users || [];
    if (values && values.length > 0) {
      const searchTerms = values.map((v) => (v ? String(v).trim().toLowerCase() : ""));
      const matched = result.filter((u: any) => {
        return searchTerms.some((term) => {
          if (!term) return false;
          return (
            (u.username && String(u.username).trim().toLowerCase() === term) ||
            (u.phoneNumber && String(u.phoneNumber).trim().toLowerCase() === term) ||
            (u.agentCode && String(u.agentCode).trim().toLowerCase() === term) ||
            (u.id && String(u.id).trim().toLowerCase() === term)
          );
        });
      });
      return [matched, []];
    }
    return [result, []];
  }

  if (/INSERT\s+INTO\s+app_users/i.test(cleanSql)) {
    let id, username, fullName, phoneNumber, role, agentCode, shippingCompanyId, password;
    if (values.length === 9) {
      [id, username, fullName, phoneNumber, role, agentCode, shippingCompanyId, , password] = values;
    } else {
      [id, username, fullName, phoneNumber, role, agentCode, shippingCompanyId, password] = values;
    }
    if (jsonData.app_users.some((u: any) => u.username === username || u.phoneNumber === phoneNumber)) {
      const err: any = new Error("Duplicate entry to users");
      err.code = "ER_DUP_ENTRY";
      err.errno = 1062;
      throw err;
    }
    jsonData.app_users.push({
      id,
      username,
      fullName,
      phoneNumber,
      role,
      agentCode: agentCode || null,
      shippingCompanyId: shippingCompanyId || null,
      isEnabled: 1,
      password: password || "123456"
    });
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  if (/UPDATE\s+app_users\s+SET/i.test(cleanSql)) {
    if (/isEnabled\s+=\s+NOT\s+isEnabled/i.test(cleanSql) || /isEnabled\s+=\s+\?/i.test(cleanSql)) {
      const isEnabledValue = /isEnabled\s+=\s+\?/i.test(cleanSql) ? values[0] : null;
      const id = /isEnabled\s+=\s+\?/i.test(cleanSql) ? (isEnabledValue !== null ? values[1] : values[0]) : values[0];
      const usr = jsonData.app_users.find((u: any) => u.id === id);
      if (usr) {
        if (isEnabledValue !== null) {
          usr.isEnabled = isEnabledValue ? 1 : 0;
        } else {
          usr.isEnabled = usr.isEnabled === 1 ? 0 : 1;
        }
        saveJsonData(jsonData);
      }
    } else if (/password\s+=\s+\?\s+WHERE\s+phoneNumber\s+=\s+\?/i.test(cleanSql)) {
      const [newPassword, phoneNumber] = values;
      const usr = jsonData.app_users.find((u: any) => u.phoneNumber === phoneNumber);
      if (usr) {
        usr.password = newPassword;
        saveJsonData(jsonData);
      }
    } else if (/password\s+=\s+\?\s+WHERE\s+id\s+=\s+\?/i.test(cleanSql)) {
      const [newPassword, id] = values;
      const usr = jsonData.app_users.find((u: any) => u.id === id);
      if (usr) {
        usr.password = newPassword;
        saveJsonData(jsonData);
      }
    } else if (/phoneNumber\s+=\s+\?\s+WHERE/i.test(cleanSql)) {
      const [newPhoneNumber, idOrCode] = values;
      const usr = jsonData.app_users.find((u: any) => u.id === idOrCode || u.agentCode === idOrCode || u.shippingCompanyId === idOrCode);
      if (usr) {
        usr.phoneNumber = newPhoneNumber;
        saveJsonData(jsonData);
      }
    } else if (/WHERE\s+agentCode\s+=\s+\?/i.test(cleanSql)) {
      const targetAgentCode = values[values.length - 1];
      const usr = jsonData.app_users.find((u: any) => u.agentCode === targetAgentCode);
      if (usr) {
        usr.fullName = values[0] || usr.fullName;
        usr.phoneNumber = values[1] || usr.phoneNumber;
        saveJsonData(jsonData);
      }
    } else if (/WHERE\s+shippingCompanyId\s+=\s+\?/i.test(cleanSql)) {
      const targetScId = values[values.length - 1];
      const usr = jsonData.app_users.find((u: any) => u.shippingCompanyId === targetScId);
      if (usr) {
        usr.fullName = values[0] || usr.fullName;
        usr.phoneNumber = values[1] || usr.phoneNumber;
        saveJsonData(jsonData);
      }
    } else {
      const hasPassword = /password\s+=\s+\?/i.test(cleanSql);
      if (hasPassword) {
        const [username, fullName, phoneNumber, role, agentCode, shippingCompanyId, password, id] = values;
        const usr = jsonData.app_users.find((u: any) => u.id === id);
        if (usr) {
          usr.username = username;
          usr.fullName = fullName;
          usr.phoneNumber = phoneNumber;
          usr.role = role;
          usr.agentCode = agentCode || null;
          usr.shippingCompanyId = shippingCompanyId || null;
          usr.password = password;
          saveJsonData(jsonData);
        }
      } else {
        const [username, fullName, phoneNumber, role, agentCode, shippingCompanyId, id] = values;
        const usr = jsonData.app_users.find((u: any) => u.id === id);
        if (usr) {
          usr.username = username;
          usr.fullName = fullName;
          usr.phoneNumber = phoneNumber;
          usr.role = role;
          usr.agentCode = agentCode || null;
          usr.shippingCompanyId = shippingCompanyId || null;
          saveJsonData(jsonData);
        }
      }
    }
    return [{ affectedRows: 1 }];
  }

  if (/DELETE\s+FROM\s+app_users/i.test(cleanSql)) {
    const id = values[0];
    jsonData.app_users = jsonData.app_users.filter((u: any) => u.id !== id);
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 1. SELECT * FROM products
  if (/SELECT\s+\*\s+FROM\s+products/i.test(cleanSql)) {
    return [jsonData.products.map((p: any) => ({ ...p, isEnabled: p.isEnabled === 1 || p.isEnabled === true ? 1 : 0 })), []];
  }

  // 2. SELECT * FROM agents
  if (/SELECT\s+\*\s+FROM\s+agents/i.test(cleanSql)) {
    return [jsonData.agents.map((a: any) => ({ ...a, isEnabled: a.isEnabled === 1 || a.isEnabled === true ? 1 : 0 })), []];
  }

  // 3. SELECT * FROM shipping_companies/i
  if (/SELECT\s+\*\s+FROM\s+shipping_companies/i.test(cleanSql)) {
    return [jsonData.shipping_companies.map((s: any) => ({ ...s, isEnabled: s.isEnabled === 1 || s.isEnabled === true ? 1 : 0 })), []];
  }

  // 3b. SELECT * FROM permanent_drivers
  if (/SELECT\s+\*\s+FROM\s+permanent_drivers/i.test(cleanSql)) {
    const list = (jsonData.permanent_drivers || []).map((d: any) => ({ ...d, isEnabled: d.isEnabled === 1 || d.isEnabled === true ? 1 : 0 }));
    return [list, []];
  }

  // 4. SELECT * FROM orders ORDER BY...
  if (/SELECT\s+\*\s+FROM\s+orders/i.test(cleanSql)) {
    const list = [...jsonData.orders].sort((a, b) => {
      if (a.priorityIndex !== b.priorityIndex) {
        return (a.priorityIndex || 0) - (b.priorityIndex || 0);
      }
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    return [list, []];
  }

  // 5. SELECT * FROM order_history ORDER BY...
  if (/SELECT\s+\*\s+FROM\s+order_history/i.test(cleanSql)) {
    const list = [...jsonData.order_history].sort((a, b) => {
      return new Date(a.updatedAt).getTime() - new Date(b.updatedAt).getTime();
    });
    return [list, []];
  }

  // 6. SELECT COUNT(*) as count FROM <table>
  const countMatch = cleanSql.match(/SELECT\s+COUNT\(\*\)\s+(?:as\s+count\s+)?FROM\s+([a-z0-9_]+)/i);
  if (countMatch) {
    const tableName = countMatch[1].toLowerCase();
    const tableData = (jsonData as any)[tableName] || [];
    return [[{ count: tableData.length }], []];
  }

  // 7. SELECT id FROM orders WHERE status = 'PENDING_APPROVAL'
  if (/SELECT\s+id\s+FROM\s+orders\s+WHERE\s+status\s+=\s+'PENDING_APPROVAL'/i.test(cleanSql)) {
    const matched = jsonData.orders.filter((o: any) => o.status === 'PENDING_APPROVAL').map((o: any) => ({ id: o.id }));
    return [matched, []];
  }

  // 8. SELECT id FROM orders WHERE status = 'APPROVED_BY_SALES'
  if (/SELECT\s+id\s+FROM\s+orders\s+WHERE\s+status\s+=\s+'APPROVED_BY_SALES'/i.test(cleanSql)) {
    const matched = jsonData.orders.filter((o: any) => o.status === 'APPROVED_BY_SALES').map((o: any) => ({ id: o.id }));
    return [matched, []];
  }

  // 9. INSERT INTO products
  if (/INSERT\s+INTO\s+products/i.test(cleanSql)) {
    const [id, name, category, pricePerUnit, unit, description, weight, dimensions, coverageInfo, primaryUnit, secondaryUnit, conversionRatio, defaultQuantity, imageUrl] = values;
    if (jsonData.products.some((p: any) => p.id === id)) {
      const err: any = new Error("Product duplicate error");
      err.code = "ER_DUP_ENTRY";
      err.errno = 1062;
      throw err;
    }
    jsonData.products.push({
      id,
      name,
      category,
      pricePerUnit: Number(pricePerUnit),
      unit,
      description: description || null,
      weight: weight || null,
      dimensions: dimensions || null,
      coverageInfo: coverageInfo || null,
      primaryUnit: primaryUnit || null,
      secondaryUnit: secondaryUnit || null,
      conversionRatio: conversionRatio ? Number(conversionRatio) : null,
      defaultQuantity: defaultQuantity ? Number(defaultQuantity) : 330,
      imageUrl: imageUrl || null,
      isEnabled: 1
    });
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 10. UPDATE products SET isEnabled = NOT isEnabled WHERE id = ?
  if (/UPDATE\s+products\s+SET\s+isEnabled\s+=\s+NOT\s+isEnabled\s+WHERE\s+id\s+=\s+\?/i.test(cleanSql)) {
    const id = values[0];
    const prod = jsonData.products.find((p: any) => p.id === id);
    if (prod) {
      prod.isEnabled = (prod.isEnabled === 1 || prod.isEnabled === true) ? 0 : 1;
      saveJsonData(jsonData);
    }
    return [{ affectedRows: 1 }];
  }

  // 11. DELETE FROM products WHERE id = ?
  if (/DELETE\s+FROM\s+products\s+WHERE\s+id/i.test(cleanSql)) {
    const id = values[0];
    jsonData.products = jsonData.products.filter((p: any) => p.id !== id);
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 12. INSERT INTO agents
  if (/INSERT\s+INTO\s+agents/i.test(cleanSql)) {
    let id, fullName, alias, agentCode, phoneNumber, address, area, territories, isExportAgent, personType, companyName, registrationNumber, economicCode, nationalId, nationalCode;
    if (values.length >= 15) {
      [id, fullName, alias, agentCode, phoneNumber, address, area, territories, isExportAgent, personType, companyName, registrationNumber, economicCode, nationalId, nationalCode] = values;
    } else if (values.length >= 9) {
      [id, fullName, alias, agentCode, phoneNumber, address, area, territories, isExportAgent] = values;
    } else {
      [id, fullName, alias, agentCode, phoneNumber, address, area, territories] = values;
    }
    if (agentCode && jsonData.agents.some((a: any) => a.agentCode && a.agentCode.toUpperCase() === agentCode.toUpperCase())) {
      const err: any = new Error("Agent duplicate error");
      err.code = "ER_DUP_ENTRY";
      err.errno = 1062;
      throw err;
    }
    let territoriesParsed = null;
    if (territories) {
      try { territoriesParsed = typeof territories === 'string' ? JSON.parse(territories) : territories; } catch(e) { territoriesParsed = territories; }
    }
    jsonData.agents.push({
      id,
      fullName,
      alias,
      agentCode,
      phoneNumber,
      address: address || null,
      area: area || null,
      territories: territoriesParsed,
      isExportAgent: Number(isExportAgent) === 1 || isExportAgent === true,
      isEnabled: 1,
      personType: personType || 'REAL',
      companyName: companyName || null,
      registrationNumber: registrationNumber || null,
      economicCode: economicCode || null,
      nationalId: nationalId || null,
      nationalCode: nationalCode || null
    });
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 13. UPDATE agents SET isEnabled = NOT isEnabled WHERE id = ?
  if (/UPDATE\s+agents\s+SET\s+isEnabled\s+=\s+NOT\s+isEnabled\s+WHERE\s+id\s+=\s+\?/i.test(cleanSql)) {
    const id = values[0];
    const agent = jsonData.agents.find((a: any) => a.id === id);
    if (agent) {
      agent.isEnabled = (agent.isEnabled === 1 || agent.isEnabled === true) ? 0 : 1;
      saveJsonData(jsonData);
    }
    return [{ affectedRows: 1 }];
  }

  // 14. DELETE FROM agents WHERE id = ?
  if (/DELETE\s+FROM\s+agents\s+WHERE\s+id/i.test(cleanSql)) {
    const id = values[0];
    jsonData.agents = jsonData.agents.filter((a: any) => a.id !== id);
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 15. INSERT INTO shipping_companies
  if (/INSERT\s+INTO\s+shipping_companies/i.test(cleanSql)) {
    let id, name, code, phoneNumber, managerName, nationalId, economicCode;
    if (values.length >= 7) {
      [id, name, code, phoneNumber, managerName, nationalId, economicCode] = values;
    } else {
      [id, name, code, phoneNumber, managerName] = values;
    }
    if (code && jsonData.shipping_companies.some((sc: any) => sc.code && sc.code.toUpperCase() === code.toUpperCase())) {
      const err: any = new Error("Company duplicate error");
      err.code = "ER_DUP_ENTRY";
      err.errno = 1062;
      throw err;
    }
    jsonData.shipping_companies.push({
      id,
      name,
      code,
      phoneNumber,
      managerName: managerName || null,
      isEnabled: 1,
      nationalId: nationalId || null,
      economicCode: economicCode || null
    });
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 16. UPDATE shipping_companies
  if (/UPDATE\s+shipping_companies\s+SET/i.test(cleanSql) && !/isEnabled\s+=\s+NOT/i.test(cleanSql)) {
    if (/phoneNumber\s+=\s+\?,\s+address\s+=\s+\?/i.test(cleanSql)) {
      const [phoneNumber, address, scId] = values;
      const sc = jsonData.shipping_companies.find((s: any) => s.id === scId || s.code === scId);
      if (sc) {
        sc.phoneNumber = phoneNumber;
        sc.address = address;
        saveJsonData(jsonData);
      }
    } else if (values.length >= 8) {
      const [name, code, phoneNumber, managerName, address, isEnabled, nationalId, economicCode, id] = values;
      const sc = jsonData.shipping_companies.find((s: any) => s.id === id);
      if (sc) {
        sc.name = name;
        sc.code = code;
        sc.phoneNumber = phoneNumber;
        sc.managerName = managerName;
        sc.address = address;
        sc.isEnabled = Number(isEnabled) === 1 || isEnabled === true;
        if (nationalId !== undefined) sc.nationalId = nationalId;
        if (economicCode !== undefined) sc.economicCode = economicCode;
        saveJsonData(jsonData);
      }
    } else if (values.length >= 7) {
      const [name, code, phoneNumber, managerName, address, isEnabled, id] = values;
      const sc = jsonData.shipping_companies.find((s: any) => s.id === id);
      if (sc) {
        sc.name = name;
        sc.code = code;
        sc.phoneNumber = phoneNumber;
        sc.managerName = managerName;
        sc.address = address;
        sc.isEnabled = Number(isEnabled) === 1 || isEnabled === true;
        saveJsonData(jsonData);
      }
    } else {
      const id = values[values.length - 1];
      const sc = jsonData.shipping_companies.find((s: any) => s.id === id);
      if (sc) {
        if (values.length >= 3) sc.phoneNumber = values[2] || sc.phoneNumber;
        saveJsonData(jsonData);
      }
    }
    return [{ affectedRows: 1 }];
  }

  if (/UPDATE\s+shipping_companies\s+SET\s+isEnabled\s+=\s+NOT\s+isEnabled\s+WHERE\s+id\s+=\s+\?/i.test(cleanSql)) {
    const id = values[0];
    const company = jsonData.shipping_companies.find((s: any) => s.id === id);
    if (company) {
      company.isEnabled = (company.isEnabled === 1 || company.isEnabled === true) ? 0 : 1;
      saveJsonData(jsonData);
    }
    return [{ affectedRows: 1 }];
  }

  // 17. DELETE FROM shipping_companies WHERE id = ?
  if (/DELETE\s+FROM\s+shipping_companies\s+WHERE\s+id/i.test(cleanSql)) {
    const id = values[0];
    jsonData.shipping_companies = jsonData.shipping_companies.filter((s: any) => s.id !== id);
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 17b. PERMANENT DRIVERS CRUD IN FALLBACK SQL
  if (/INSERT\s+INTO\s+permanent_drivers/i.test(cleanSql)) {
    const [id, driverName, driverPhone, licensePlate, vehicleType, shippingAgency, nationalCode, smartCardNumber] = values;
    if (!jsonData.permanent_drivers) jsonData.permanent_drivers = [];
    jsonData.permanent_drivers.push({
      id,
      driverName,
      driverPhone,
      licensePlate,
      vehicleType,
      shippingAgency: shippingAgency || null,
      nationalCode: nationalCode || null,
      smartCardNumber: smartCardNumber || null,
      isEnabled: 1
    });
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  if (/UPDATE\s+permanent_drivers\s+SET\s+isEnabled\s+=\s+NOT\s+isEnabled\s+WHERE\s+id\s+=\s+\?/i.test(cleanSql)) {
    const id = values[0];
    const drv = (jsonData.permanent_drivers || []).find((d: any) => d.id === id);
    if (drv) {
      drv.isEnabled = (drv.isEnabled === 1 || drv.isEnabled === true) ? 0 : 1;
      saveJsonData(jsonData);
    }
    return [{ affectedRows: 1 }];
  }

  if (/UPDATE\s+permanent_drivers\s+SET/i.test(cleanSql) && !/isEnabled\s+=\s+NOT/i.test(cleanSql)) {
    const [driverName, driverPhone, licensePlate, vehicleType, shippingAgency, nationalCode, smartCardNumber, isEnabled, id] = values;
    const drv = (jsonData.permanent_drivers || []).find((d: any) => d.id === id);
    if (drv) {
      drv.driverName = driverName;
      drv.driverPhone = driverPhone;
      drv.licensePlate = licensePlate;
      drv.vehicleType = vehicleType;
      drv.shippingAgency = shippingAgency || null;
      drv.nationalCode = nationalCode || null;
      drv.smartCardNumber = smartCardNumber || null;
      drv.isEnabled = Number(isEnabled) === 1 || isEnabled === true;
      saveJsonData(jsonData);
    }
    return [{ affectedRows: 1 }];
  }

  if (/DELETE\s+FROM\s+permanent_drivers\s+WHERE\s+id/i.test(cleanSql)) {
    const id = values[0];
    jsonData.permanent_drivers = (jsonData.permanent_drivers || []).filter((d: any) => d.id !== id);
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 18. INSERT INTO orders
  if (/INSERT\s+INTO\s+orders/i.test(cleanSql)) {
    const id = values[0];
    const orderNumber = values[1];
    const customerName = values[2];
    const agentCode = values[3];
    const productId = values[4];
    const productName = values[5];
    const quantity = values[6];
    const unit = values[7];
    const destinationCity = values[8];
    const exactAddress = values[9];
    const phoneNumber = values[10];

    let buyerName = null;
    let notes = null;
    let createdAt = null;
    let status = null;
    let itemsJson = null;
    let paymentTrackingCode = null;

    if (values.length >= 17) {
      buyerName = values[11];
      notes = values[12];
      createdAt = values[13];
      status = values[14];
      itemsJson = values[15];
      paymentTrackingCode = values[16];
    } else {
      notes = values[11];
      createdAt = values[12];
      status = values[13];
      itemsJson = values[14];
      paymentTrackingCode = values[15];
    }

    const priorityIndex = 0;

    jsonData.orders.push({
      id,
      orderNumber,
      customerName,
      agentCode,
      productId,
      productName,
      quantity: Number(quantity),
      unit,
      destinationCity,
      exactAddress: exactAddress || null,
      phoneNumber,
      buyerName: buyerName || null,
      notes: notes || null,
      createdAt,
      status,
      priorityIndex: Number(priorityIndex) || 0,
      sentToFactoryAt: null,
      rejectionReason: null,
      vehicleType: null,
      driverName: null,
      driverPhone: null,
      licensePlate: null,
      shippingAgency: null,
      estimatedArrival: null,
      itemsJson: itemsJson || null,
      paymentTrackingCode: paymentTrackingCode || null,
      billOfLadingNumber: null,
      shippingCompanyId: null
    });
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 19. INSERT INTO order_history
  if (/INSERT\s+INTO\s+order_history/i.test(cleanSql)) {
    const [orderId, status, updatedAt, comment] = values;
    jsonData.order_history.push({
      id: jsonData.order_history.length + 1,
      orderId,
      status,
      updatedAt,
      comment: comment || null
    });
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  // 20. UPDATE orders updates
  if (/UPDATE\s+orders\s+SET/i.test(cleanSql)) {
    if (/status\s+=\s+\?,\s+rejectionReason/i.test(cleanSql)) {
      const [status, rejectionReason, id] = values;
      const ord = jsonData.orders.find((o: any) => o.id === id);
      if (ord) {
        ord.status = status;
        ord.rejectionReason = rejectionReason;
        saveJsonData(jsonData);
      }
    } else if (/status\s+=\s+\?,\s+sentToFactoryAt/i.test(cleanSql)) {
      const [status, sentToFactoryAt, id] = values;
      const ord = jsonData.orders.find((o: any) => o.id === id);
      if (ord) {
        ord.status = status;
        ord.sentToFactoryAt = sentToFactoryAt;
        saveJsonData(jsonData);
      }
    } else if (/status\s+=\s+\?\s+WHERE\s+id/i.test(cleanSql)) {
      const [status, id] = values;
      const ord = jsonData.orders.find((o: any) => o.id === id);
      if (ord) {
        ord.status = status;
        saveJsonData(jsonData);
      }
    } else if (/priorityIndex\s+=\s+\?/i.test(cleanSql)) {
      const [priorityIndex, id] = values;
      const ord = jsonData.orders.find((o: any) => o.id === id);
      if (ord) {
        ord.priorityIndex = Number(priorityIndex);
        saveJsonData(jsonData);
      }
    } else if (/vehicleType\s+=\s+\?/i.test(cleanSql)) {
      if (values.length >= 10) {
        const [status, vehicleType, driverName, driverPhone, licensePlate, shippingAgency, estimatedArrival, billOfLadingNumber, shippingCompanyId, id] = values;
        const ord = jsonData.orders.find((o: any) => o.id === id);
        if (ord) {
          ord.status = status;
          ord.vehicleType = vehicleType;
          ord.driverName = driverName;
          ord.driverPhone = driverPhone;
          ord.licensePlate = licensePlate;
          ord.shippingAgency = shippingAgency;
          ord.estimatedArrival = estimatedArrival;
          ord.billOfLadingNumber = billOfLadingNumber;
          ord.shippingCompanyId = shippingCompanyId;
          saveJsonData(jsonData);
        }
      } else {
        const [status, vehicleType, driverName, driverPhone, licensePlate, shippingAgency, estimatedArrival, id] = values;
        const ord = jsonData.orders.find((o: any) => o.id === id);
        if (ord) {
          ord.status = status;
          ord.vehicleType = vehicleType;
          ord.driverName = driverName;
          ord.driverPhone = driverPhone;
          ord.licensePlate = licensePlate;
          ord.shippingAgency = shippingAgency;
          ord.estimatedArrival = estimatedArrival;
          saveJsonData(jsonData);
        }
      }
    } else if (/shippingCompanyId\s+=\s+\?/i.test(cleanSql)) {
      const [shippingCompanyId, shippingAgency, id] = values;
      const ord = jsonData.orders.find((o: any) => o.id === id);
      if (ord) {
        ord.shippingCompanyId = shippingCompanyId;
        ord.shippingAgency = shippingAgency;
        saveJsonData(jsonData);
      }
    }
    return [{ affectedRows: 1 }];
  }

  // 20b. UPDATE products details in fallback SQL
  if (/UPDATE\s+products\s+SET/i.test(cleanSql) && !/isEnabled\s+=\s+NOT/i.test(cleanSql)) {
    const [name, category, pricePerUnit, unit, description, weight, dimensions, coverageInfo, primaryUnit, secondaryUnit, conversionRatio, defaultQuantity, isEnabled, imageUrl, id] = values;
    const prod = jsonData.products.find((p: any) => p.id === id);
    if (prod) {
      prod.name = name;
      prod.category = category;
      prod.pricePerUnit = Number(pricePerUnit);
      prod.unit = unit;
      prod.description = description || null;
      prod.weight = weight || null;
      prod.dimensions = dimensions || null;
      prod.coverageInfo = coverageInfo || null;
      prod.primaryUnit = primaryUnit || null;
      prod.secondaryUnit = secondaryUnit || null;
      prod.conversionRatio = conversionRatio ? Number(conversionRatio) : null;
      prod.defaultQuantity = defaultQuantity ? Number(defaultQuantity) : 330;
      prod.isEnabled = Number(isEnabled) === 1 || isEnabled === true;
      prod.imageUrl = imageUrl || null;
      saveJsonData(jsonData);
    }
    return [{ affectedRows: 1 }];
  }

  // 20c. UPDATE agents details in fallback SQL
  if (/UPDATE\s+agents\s+SET/i.test(cleanSql) && !/isEnabled\s+=\s+NOT/i.test(cleanSql)) {
    if (/phoneNumber\s+=\s+\?,\s+address\s+=\s+\?\s+WHERE/i.test(cleanSql)) {
      const [phoneNumber, address, agentCodeOrId] = values;
      const ag = jsonData.agents.find((a: any) => a.agentCode === agentCodeOrId || a.id === agentCodeOrId);
      if (ag) {
        ag.phoneNumber = phoneNumber;
        ag.address = address;
        saveJsonData(jsonData);
      }
      return [{ affectedRows: 1 }];
    }
    let fullName, alias, agentCode, phoneNumber, address, area, territories, isExportAgent, isEnabled, personType, companyName, registrationNumber, economicCode, nationalId, nationalCode, id;
    if (values.length >= 16) {
      [fullName, alias, agentCode, phoneNumber, address, area, territories, isExportAgent, isEnabled, personType, companyName, registrationNumber, economicCode, nationalId, nationalCode, id] = values;
    } else if (values.length >= 10) {
      [fullName, alias, agentCode, phoneNumber, address, area, territories, isExportAgent, isEnabled, id] = values;
    } else if (values.length >= 9) {
      [fullName, alias, agentCode, phoneNumber, address, area, territories, isEnabled, id] = values;
    } else {
      [fullName, alias, agentCode, phoneNumber, address, area, isEnabled, id] = values;
    }
    const ag = jsonData.agents.find((a: any) => a.id === id);
    if (ag) {
      ag.fullName = fullName;
      ag.alias = alias;
      ag.agentCode = agentCode;
      ag.phoneNumber = phoneNumber;
      ag.address = address || null;
      ag.area = area || null;
      if (territories !== undefined) {
        try { ag.territories = typeof territories === 'string' ? JSON.parse(territories) : territories; } catch(e) { ag.territories = territories; }
      }
      if (isExportAgent !== undefined) {
        ag.isExportAgent = Number(isExportAgent) === 1 || isExportAgent === true;
      }
      ag.isEnabled = Number(isEnabled) === 1 || isEnabled === true;
      if (personType !== undefined) ag.personType = personType;
      if (companyName !== undefined) ag.companyName = companyName;
      if (registrationNumber !== undefined) ag.registrationNumber = registrationNumber;
      if (economicCode !== undefined) ag.economicCode = economicCode;
      if (nationalId !== undefined) ag.nationalId = nationalId;
      if (nationalCode !== undefined) ag.nationalCode = nationalCode;
      saveJsonData(jsonData);
    }
    return [{ affectedRows: 1 }];
  }

  // 20d. UPDATE order paymentTrackingCode or cancellation in fallback SQL
  if (/UPDATE\s+orders\s+SET\s+paymentTrackingCode/i.test(cleanSql)) {
    const [paymentTrackingCode, id] = values;
    const ord = jsonData.orders.find((o: any) => o.id === id);
    if (ord) {
      ord.paymentTrackingCode = paymentTrackingCode;
      saveJsonData(jsonData);
    }
    return [{ affectedRows: 1 }];
  }

  // 21. TRUNCATE/CLEAN/DELETE
  if (/DELETE\s+FROM/i.test(cleanSql)) {
    if (cleanSql.includes("order_history")) jsonData.order_history = [];
    if (cleanSql.includes("orders")) jsonData.orders = [];
    if (cleanSql.includes("products")) jsonData.products = [];
    if (cleanSql.includes("agents")) jsonData.agents = [];
    if (cleanSql.includes("shipping_companies")) jsonData.shipping_companies = [];
    saveJsonData(jsonData);
    return [{ affectedRows: 1 }];
  }

  console.warn("⚠️ Unmatched SQL in mock provider:", sql);
  return [[], []];
}

class MockPool {
  async getConnection() {
    return new MockConnection();
  }
  async query(sql: string, values?: any[]) {
    return executeQuery(sql, values);
  }
}

class MockConnection {
  async beginTransaction() {}
  async commit() {}
  async rollback() {}
  async release() {}
  async query(sql: string, values?: any[]) {
    return executeQuery(sql, values);
  }
}

/**
 * Returns the MariaDB (MySQL-compatible) connection pool.
 * Initializes the pool lazily on the first request.
 */
export function getDbPool(): mysql.Pool {
  if (isFallbackMode && mockPoolInstance) {
    return mockPoolInstance as any;
  }
  if (!pool) {
    const host = process.env.DB_HOST || "localhost";
    const port = Number(process.env.DB_PORT) || 3306;
    const user = process.env.DB_USER || "root";
    const password = process.env.DB_PASSWORD || "";
    let database = process.env.DB_NAME || "salesdashboard";
    if (database === "sales_dashboard") {
      console.log("ℹ️ [Database] Overriding legacy database name 'sales_dashboard' with 'salesdashboard'.");
      database = "salesdashboard";
    }

    console.log(`[Database] Initializing MariaDB Connection Pool on ${host}:${port} (${database})...`);
    
    pool = mysql.createPool({
      host,
      port,
      user,
      password,
      database,
      waitForConnections: true,
      connectionLimit: 15,
      queueLimit: 0,
      enableKeepAlive: true,
      keepAliveInitialDelay: 10000,
      connectTimeout: 2000,
    });
  }
  return pool;
}

/**
 * Safe Redis Client wrapper that catches and silences connection/timeout errors.
 */
class SafeRedisWrapper {
  private instance: Redis;

  constructor(instance: Redis) {
    this.instance = instance;
  }

  async ping(): Promise<string> {
    try {
      return await this.instance.ping();
    } catch (err: any) {
      console.warn("⚠️ [Redis Safe Wrapper] Error in PING:", err.message);
      return "PONG";
    }
  }

  async get(key: string): Promise<string | null> {
    try {
      return await this.instance.get(key);
    } catch (err: any) {
      console.warn(`⚠️ [Redis Safe Wrapper] Error in GET ${key}:`, err.message);
      return null;
    }
  }

  async set(key: string, value: string, mode?: string, duration?: number): Promise<string | null> {
    try {
      if (mode && duration !== undefined) {
        return await this.instance.set(key, value, mode as any, duration);
      }
      return await this.instance.set(key, value);
    } catch (err: any) {
      console.warn(`⚠️ [Redis Safe Wrapper] Error in SET ${key}:`, err.message);
      return null;
    }
  }

  async del(key: string): Promise<number> {
    try {
      return await this.instance.del(key);
    } catch (err: any) {
      console.warn(`⚠️ [Redis Safe Wrapper] Error in DEL ${key}:`, err.message);
      return 0;
    }
  }
}

let safeRedisWrapperInstance: SafeRedisWrapper | null = null;

/**
 * Returns the Redis client instance wrapped in SafeRedisWrapper.
 * Initializes the connection lazily.
 */
export function getRedisClient(): any {
  if (safeRedisWrapperInstance) {
    return safeRedisWrapperInstance;
  }
  if (!redis) {
    const host = process.env.REDIS_HOST;
    const port = Number(process.env.REDIS_PORT) || 6379;
    const password = process.env.REDIS_PASSWORD || undefined;

    if (!host) {
      console.warn("⚠️ [Redis] REDIS_HOST is not defined in environment secrets. Running in disk-fallback cache.");
      return null;
    }

    try {
      console.log(`[Redis] Initializing Redis Client on ${host}:${port}...`);
      redis = new Redis({
        host,
        port,
        password,
        lazyConnect: true,
        maxRetriesPerRequest: 3,
        connectTimeout: 1000,
        enableOfflineQueue: false,
        retryStrategy(times) {
          if (times > 3) {
            console.warn("⚠️ [Redis] Max connect retries reached. Stopping reconnection attempts.");
            return null;
          }
          return Math.min(times * 100, 500);
        }
      });

      redis.on("connect", () => {
        console.log("⚡ [Redis] Connected successfully to Redis server!");
      });

      redis.on("error", (err) => {
        console.error("❌ [Redis] Connection Error:", err.message);
      });
    } catch (error) {
      console.error("❌ [Redis] Failed to initialize client instance:", error);
      return null;
    }
  }
  if (redis) {
    safeRedisWrapperInstance = new SafeRedisWrapper(redis);
    return safeRedisWrapperInstance;
  }
  return null;
}

/**
 * Ensures a column exists in a specific table for MariaDB/MySQL.
 */
async function ensureColumnExists(db: mysql.Pool, tableName: string, columnName: string, columnDefinition: string) {
  try {
    const [columns] = await db.query(`SHOW COLUMNS FROM ${tableName} LIKE ?`, [columnName]);
    if ((columns as any[]).length === 0) {
      console.log(`🔧 [Migration] Column '${columnName}' is missing in table '${tableName}'. Adding it...`);
      await db.query(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`);
      console.log(`✅ [Migration] Column '${columnName}' successfully added to table '${tableName}'.`);
    }
  } catch (err: any) {
    console.error(`⚠️ [Migration Error] Could not ensure column '${columnName}' in '${tableName}':`, err.message);
  }
}

/**
 * Utility to test database readiness and create tables if they do not exist.
 * This is perfect for initial bootstrapping on Ubuntu.
 */
export async function bootstrapDatabase() {
  try {
    const db = getDbPool();
    
    // Quick test query to verify MariaDB is up and reachable
    await db.query("SELECT 1");

    console.log("🔄 [Bootstrap] Checking MariaDB tables...");

    // 1. Create Products Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(100) NOT NULL,
        pricePerUnit DECIMAL(15, 2) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        description LONGTEXT,
        weight VARCHAR(50),
        dimensions VARCHAR(50),
        coverageInfo VARCHAR(150),
        isEnabled TINYINT(1) DEFAULT 1,
        imageUrl LONGTEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 2. Create Agents Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS agents (
        id VARCHAR(50) PRIMARY KEY,
        fullName VARCHAR(150) NOT NULL,
        alias VARCHAR(150) NOT NULL,
        agentCode VARCHAR(50) NOT NULL UNIQUE,
        phoneNumber VARCHAR(20) NOT NULL,
        address TEXT,
        area VARCHAR(100),
        isEnabled TINYINT(1) DEFAULT 1,
        personType VARCHAR(20) DEFAULT 'REAL',
        companyName VARCHAR(150),
        registrationNumber VARCHAR(50),
        economicCode VARCHAR(50),
        nationalId VARCHAR(50),
        nationalCode VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3. Create Shipping Companies Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS shipping_companies (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        code VARCHAR(50) NOT NULL UNIQUE,
        phoneNumber VARCHAR(20) NOT NULL,
        managerName VARCHAR(150),
        isEnabled TINYINT(1) DEFAULT 1,
        nationalId VARCHAR(50),
        economicCode VARCHAR(50)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 3b. Create Permanent Drivers Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS permanent_drivers (
        id VARCHAR(50) PRIMARY KEY,
        driverName VARCHAR(150) NOT NULL,
        driverPhone VARCHAR(20) NOT NULL,
        licensePlate VARCHAR(50) NOT NULL,
        vehicleType VARCHAR(100) NOT NULL,
        shippingAgency VARCHAR(150) NULL,
        nationalCode VARCHAR(20) NULL,
        smartCardNumber VARCHAR(50) NULL,
        isEnabled TINYINT(1) DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 4. Create Orders Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id VARCHAR(50) PRIMARY KEY,
        orderNumber VARCHAR(50) NOT NULL UNIQUE,
        customerName VARCHAR(150) NOT NULL,
        agentCode VARCHAR(50) NOT NULL,
        productId VARCHAR(50) NOT NULL,
        productName VARCHAR(150) NOT NULL,
        quantity INT NOT NULL,
        unit VARCHAR(50) NOT NULL,
        destinationCity VARCHAR(100) NOT NULL,
        exactAddress TEXT,
        phoneNumber VARCHAR(20) NOT NULL,
        buyerName VARCHAR(255) NULL,
        notes TEXT,
        createdAt VARCHAR(50) NOT NULL,
        sentToFactoryAt VARCHAR(50) NULL,
        status VARCHAR(50) NOT NULL,
        priorityIndex INT DEFAULT 0,
        rejectionReason TEXT,
        vehicleType VARCHAR(100) NULL,
        driverName VARCHAR(100) NULL,
        driverPhone VARCHAR(20) NULL,
        licensePlate VARCHAR(50) NULL,
        shippingAgency VARCHAR(150) NULL,
        estimatedArrival VARCHAR(100) NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 5. Create Order History Table for audit trail
    await db.query(`
      CREATE TABLE IF NOT EXISTS order_history (
        id INT AUTO_INCREMENT PRIMARY KEY,
        orderId VARCHAR(50) NOT NULL,
        status VARCHAR(50) NOT NULL,
        updatedAt VARCHAR(50) NOT NULL,
        comment TEXT,
        FOREIGN KEY (orderId) REFERENCES orders(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 6. Create App Users Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id VARCHAR(50) PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        fullName VARCHAR(150) NOT NULL,
        phoneNumber VARCHAR(20) NOT NULL UNIQUE,
        role VARCHAR(50) NOT NULL,
        agentCode VARCHAR(50) NULL,
        shippingCompanyId VARCHAR(100) NULL,
        isEnabled TINYINT(1) DEFAULT 1
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // 7. Create User Activity Logs Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_activity_logs (
        id VARCHAR(50) PRIMARY KEY,
        userId VARCHAR(50) NULL,
        userName VARCHAR(150) NOT NULL,
        userRole VARCHAR(50) NOT NULL,
        action VARCHAR(100) NOT NULL,
        details TEXT,
        module VARCHAR(50) DEFAULT 'SYSTEM',
        ipAddress VARCHAR(50) DEFAULT '127.0.0.1',
        status VARCHAR(20) DEFAULT 'SUCCESS',
        createdAt VARCHAR(50) NOT NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);

    // --- Automated Schema Migration / Repair Block ---
    console.log("🔄 [Bootstrap] Verifying table schemas and performing automatic migrations...");
    await ensureColumnExists(db, "products", "description", "TEXT");
    await ensureColumnExists(db, "products", "weight", "VARCHAR(50)");
    await ensureColumnExists(db, "products", "dimensions", "VARCHAR(50)");
    await ensureColumnExists(db, "products", "coverageInfo", "VARCHAR(150)");
    await ensureColumnExists(db, "products", "isEnabled", "TINYINT(1) DEFAULT 1");

    await ensureColumnExists(db, "agents", "address", "TEXT");
    await ensureColumnExists(db, "agents", "area", "VARCHAR(255)");
    await ensureColumnExists(db, "agents", "territories", "TEXT");
    await ensureColumnExists(db, "agents", "isExportAgent", "TINYINT(1) DEFAULT 0");
    await ensureColumnExists(db, "agents", "isEnabled", "TINYINT(1) DEFAULT 1");
    await ensureColumnExists(db, "agents", "personType", "VARCHAR(20) DEFAULT 'REAL'");
    await ensureColumnExists(db, "agents", "companyName", "VARCHAR(150)");
    await ensureColumnExists(db, "agents", "registrationNumber", "VARCHAR(50)");
    await ensureColumnExists(db, "agents", "economicCode", "VARCHAR(50)");
    await ensureColumnExists(db, "agents", "nationalId", "VARCHAR(50)");
    await ensureColumnExists(db, "agents", "nationalCode", "VARCHAR(50)");

    await ensureColumnExists(db, "shipping_companies", "managerName", "VARCHAR(150)");
    await ensureColumnExists(db, "shipping_companies", "address", "TEXT");
    await ensureColumnExists(db, "shipping_companies", "isEnabled", "TINYINT(1) DEFAULT 1");
    await ensureColumnExists(db, "shipping_companies", "nationalId", "VARCHAR(50)");
    await ensureColumnExists(db, "shipping_companies", "economicCode", "VARCHAR(50)");

    await ensureColumnExists(db, "app_users", "username", "VARCHAR(100) NOT NULL UNIQUE");
    await ensureColumnExists(db, "app_users", "fullName", "VARCHAR(150) NOT NULL");
    await ensureColumnExists(db, "app_users", "phoneNumber", "VARCHAR(20) NOT NULL UNIQUE");
    await ensureColumnExists(db, "app_users", "role", "VARCHAR(50) NOT NULL");
    await ensureColumnExists(db, "app_users", "agentCode", "VARCHAR(50) NULL");
    await ensureColumnExists(db, "app_users", "shippingCompanyId", "VARCHAR(100) NULL");
    await ensureColumnExists(db, "app_users", "isEnabled", "TINYINT(1) DEFAULT 1");
    await ensureColumnExists(db, "app_users", "password", "VARCHAR(255) DEFAULT '123456'");

    await ensureColumnExists(db, "orders", "sentToFactoryAt", "VARCHAR(50) NULL");
    await ensureColumnExists(db, "orders", "priorityIndex", "INT DEFAULT 0");
    await ensureColumnExists(db, "orders", "rejectionReason", "TEXT");
    await ensureColumnExists(db, "orders", "vehicleType", "VARCHAR(100) NULL");
    await ensureColumnExists(db, "orders", "driverName", "VARCHAR(100) NULL");
    await ensureColumnExists(db, "orders", "driverPhone", "VARCHAR(20) NULL");
    await ensureColumnExists(db, "orders", "licensePlate", "VARCHAR(50) NULL");
    await ensureColumnExists(db, "orders", "shippingAgency", "VARCHAR(150) NULL");
    await ensureColumnExists(db, "orders", "estimatedArrival", "VARCHAR(100) NULL");
    await ensureColumnExists(db, "orders", "itemsJson", "TEXT NULL");
    await ensureColumnExists(db, "orders", "paymentTrackingCode", "VARCHAR(150) NULL");
    await ensureColumnExists(db, "orders", "buyerName", "VARCHAR(255) NULL");
    await ensureColumnExists(db, "orders", "billOfLadingNumber", "VARCHAR(100) NULL");
    await ensureColumnExists(db, "orders", "shippingCompanyId", "VARCHAR(150) NULL");
    await ensureColumnExists(db, "orders", "isExportOrder", "TINYINT(1) DEFAULT 0");
    await ensureColumnExists(db, "orders", "destinationCountry", "VARCHAR(100) NULL");
    await ensureColumnExists(db, "orders", "deliveryLocationUrl", "TEXT NULL");

    // products primaryUnit, secondaryUnit, conversionRatio, defaultQuantity, imageUrl
    await ensureColumnExists(db, "products", "primaryUnit", "VARCHAR(50) NULL");
    await ensureColumnExists(db, "products", "secondaryUnit", "VARCHAR(50) NULL");
    await ensureColumnExists(db, "products", "conversionRatio", "DECIMAL(10, 2) NULL");
    await ensureColumnExists(db, "products", "defaultQuantity", "INT NULL DEFAULT 330");
    await ensureColumnExists(db, "products", "imageUrl", "LONGTEXT NULL");

    // Upgrade existing columns to LONGTEXT if they were created with smaller types
    try {
      await db.query("ALTER TABLE products MODIFY COLUMN imageUrl LONGTEXT NULL");
      await db.query("ALTER TABLE products MODIFY COLUMN description LONGTEXT NULL");
    } catch (alterErr: any) {
      console.log("ℹ️ [Migration Note] Modify products columns:", alterErr.message);
    }

    console.log("✅ [Bootstrap] MariaDB tables checked and synchronized successfully!");

    // Seed tables if empty
    await seedDatabaseIfEmpty(db);

    // Test Redis connectivity if configured
    const redisClient = getRedisClient();
    if (redisClient) {
      try {
        await Promise.race([
          redisClient.ping(),
          new Promise((_, reject) => setTimeout(() => reject(new Error("Timeout")), 1500))
        ]);
        console.log("✅ [Bootstrap] Redis connection verified successfully!");
      } catch (err: any) {
        console.warn("⚠️ [Bootstrap] Redis connection test failed or timed out. Continuing without active Redis:", err.message);
      }
    }
  } catch (error: any) {
    console.error("⚠️ [Bootstrap] Database connectivity is not ready yet because:", error.message);
    console.info("⚡ [Bootstrap] Automatically switching to local JSON-file fallback database mode!");
    isFallbackMode = true;
    mockPoolInstance = new MockPool();
    seedJsonIfEmpty();
  }
}

async function seedDatabaseIfEmpty(db: mysql.Pool) {
  try {
    // 1. Products
    const [prodRows] = await db.query("SELECT COUNT(*) as count FROM products") as any[];
    const prodCount = (prodRows && prodRows[0]?.count !== undefined) ? prodRows[0].count : 0;
    if (prodCount === 0) {
      console.log("🌱 [Seed] Seeding default products...");
      const dummyProducts = [
        ['prod-1', 'سفال سقف طبرستان (طرح کلاسیک)', 'roofing', 145000, 'عدد', 'مقاومت بسیار بالا در برابر تغییرات جوی و یخبندان، عایق حرارتی و رطوبتی فوق‌العاده با لعاب طبیعی.', '۳.۱ کیلوگرم', '۳۰ × ۴۲ سانتی‌متر', '۱۴ عدد در هر مترمربع', 1],
        ['prod-2', 'آجر سفال ۱۰ سانتی طبرستان (تیغه)', 'bricks', 3400, 'قالب', 'جهت دیوارهای داخلی و فضاهای کم‌عرض، پخت با کوره تمام اتوماتیک هافمن و ابعاد کاملاً گونیا.', '۲.۲ کیلوگرم', '۱۰ × ۲۰ × ۲۰ سانتی‌متر', '۲۵ قالب در هر مترمربع تیغه', 1],
        ['prod-3', 'آجر سفال ۱۵ سانتی درجه یک طبرستان', 'bricks', 4800, 'قالب', 'بهترین گزینه برای دیوارهای خارجی باغ، ویلا و آپارتمان جهت عایق‌بندی صوتی و حرارتی پیشرفته.', '۳.۳ کیلوگرم', '۱۵ × ۲۰ × ۲۰ سانتی‌متر', '۲۵ قالب در هر مترمربع دیوار', 1],
        ['prod-4', 'آجر نما نسوز سموتی طبرستان', 'facade', 12500, 'قالب', 'مقاومت حرارتی بیش از ۱۲۰۰ درجه سانتی‌گراد، رنگ ثابت و مقاوم در برابر باران‌های اسیدی و شوره‌زدگی.', '۰.۸ کیلوگرم', '۵.۵ × ۲.۵ × ۲۶ سانتی‌متر', '۴۰ قالب در هر مترمربع با بندکشی', 1],
        ['prod-5', 'تیغه سفال سقفی ۲۵ طبرستان (بلوک سقفی)', 'bricks', 9500, 'قالب', 'تولید شده با رس مرغوب شسته شده، مقاومت فشاری بالا و ایده آل برای سقف‌های تیرچه بلوک صنعتی.', '۷.۵ کیلوگرم', '۲۵ × ۲۰ × ۴۰ سانتی‌متر', '۱۰ قالب در هر مترمربع سقف', 1]
      ];
      for (const p of dummyProducts) {
        await db.query(
          "INSERT INTO products (id, name, category, pricePerUnit, unit, description, weight, dimensions, coverageInfo, isEnabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
          p
        );
      }
    }

    // 2. Agents
    const [agentRows] = await db.query("SELECT COUNT(*) as count FROM agents") as any[];
    const agentCount = (agentRows && agentRows[0]?.count !== undefined) ? agentRows[0].count : 0;
    if (agentCount === 0) {
      console.log("🌱 [Seed] Seeding default agents...");
      const dummyAgents = [
        ['ag-1', 'آقای حمیدرضا احمدی', 'نمایندگی تهران (احمدی)', 'AG-9081', '09121111111', 'تهران، ابتدای جاده قدیم کرج، مجتمع تجاری پایتخت، پلاک ۱۲', 'استان تهران و حومه البرز', 1],
        ['ag-2', 'آقای علیرضا رجایی', 'نمایندگی اصفهان (رجایی)', 'AG-6055', '09132222222', 'اصفهان، بلوار فرودگاه، نرسیده به شهرک صنعتی جی، پلاک ۴۶', 'استان اصفهان و یزد', 1],
        ['ag-3', 'آقای سهراب پوربخش', 'نمایندگی رشت (پوربخش)', 'AG-2019', '09113333333', 'گیلان، رشت، کیلومتر ۵ جاده انزلی، جنب انبار فومن‌شیمی', 'استان گیلان و غربی مازندران', 1],
        ['ag-4', 'آقای کریم نمازی', 'نمایندگی شیراز (نمازی)', 'AG-7023', '09174444444', 'فارس، شیراز، بلوار امیرکبیر، روبروی باغ جنت، مجتمع سفال', 'استان فارس و استان بوشهر', 1]
      ];
      for (const a of dummyAgents) {
        await db.query(
          "INSERT INTO agents (id, fullName, alias, agentCode, phoneNumber, address, area, isEnabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
          a
        );
      }
    }

    // 3. Shipping companies
    const [shipRows] = await db.query("SELECT COUNT(*) as count FROM shipping_companies") as any[];
    const shipCount = (shipRows && shipRows[0]?.count !== undefined) ? shipRows[0].count : 0;
    if (shipCount === 0) {
      console.log("🌱 [Seed] Seeding default shipping companies...");
      const dummyShipping = [
        ['sc-1', 'باربری ترانزیت طبرستان', 'SC-101', '01133334444', 'آقای صالحی', 1],
        ['sc-2', 'باربری زاینده‌رود طبرستان', 'SC-102', '01133335555', 'آقای صادقی', 1],
        ['sc-3', 'اتوبار کاسپین طبرستان', 'SC-103', '01133336666', 'آقای احمدی', 1]
      ];
      for (const s of dummyShipping) {
        await db.query(
          "INSERT INTO shipping_companies (id, name, code, phoneNumber, managerName, isEnabled) VALUES (?, ?, ?, ?, ?, ?)",
          s
        );
      }
    }

    // 4. Orders and history
    const [orderRows] = await db.query("SELECT COUNT(*) as count FROM orders") as any[];
    const orderCount = (orderRows && orderRows[0]?.count !== undefined) ? orderRows[0].count : 0;
    if (orderCount === 0) {
      console.log("🌱 [Seed] Seeding default orders...");
      const dummyOrders = [
        {
          id: 'ord-101',
          orderNumber: 'TCI-1402-01',
          customerName: 'نمایندگی تهران (احمدی)',
          agentCode: 'AG-9081',
          productId: 'prod-1',
          productName: 'سفال سقف طبرستان (طرح کلاسیک)',
          quantity: 12000,
          unit: 'عدد',
          destinationCity: 'تهران - شهریار',
          exactAddress: 'سایت پروژه تفریحی دیپلمات، میدان نماز، انتهای بلوار کلهر، پلاک ۶۴',
          phoneNumber: '09121111111',
          notes: 'تحویل اضطراری تا پایان هفته. هماهنگی قبل از ارسال الزامی است.',
          createdAt: new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'LOADED_AND_DISPATCHED',
          vehicleType: 'تریلی ۱۸ چرخ لبه‌دار',
          driverName: 'کریم قنبری',
          driverPhone: '09117772222',
          licensePlate: '۵۴ ع ۸۹۲ ایران ۷۲',
          shippingAgency: 'باربری ترانزیت شمال',
          estimatedArrival: '۲۴ ساعت آینده',
          priorityIndex: 0,
          history: [
            { status: 'PENDING_APPROVAL', offsetDays: -3, comment: 'ثبت سفارش توسط نمایندگی احمدی' },
            { status: 'APPROVED_BY_SALES', offsetDays: -2.5, comment: 'تایید حجم سفارش توسط واحد مالی و فروش تهران' },
            { status: 'VEHICLE_ASSIGNED', offsetDays: -2, comment: 'اختصاص تریلی ۱۸ چرخ البرز به رانندگی قنبری' },
            { status: 'LOADED_AND_DISPATCHED', offsetDays: -1, comment: 'بارگیری انجام شد و کامیون به مقصد حرکت کرد.' }
          ]
        },
        {
          id: 'ord-102',
          orderNumber: 'TCI-1402-02',
          customerName: 'نمایندگی اصفهان (رجایی)',
          agentCode: 'AG-6055',
          productId: 'prod-3',
          productName: 'آجر سفال ۱۵ سانتی درجه یک طبرستان',
          quantity: 18000,
          unit: 'قالب',
          destinationCity: 'اصفهان - شهرک صنعتی جی',
          exactAddress: 'انبار مرکزی نمایندگی رجایی، خیابان دهم، پلاک ۲',
          phoneNumber: '09132222222',
          notes: 'لطفاً بارگیری از کوره تمام اتوماتیک شماره ۲ باشد.',
          createdAt: new Date(Date.now() - 1.5 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'VEHICLE_ASSIGNED',
          vehicleType: 'کامیون جفت ۱۰ تن',
          driverName: 'غلامرضا صادقی',
          driverPhone: '09139998888',
          licensePlate: '۷۲ ب ۵۵۱ ایران ۵۳',
          shippingAgency: 'باربری زاینده‌رود',
          estimatedArrival: 'فردا صبح ساعت ۸',
          priorityIndex: 0,
          history: [
            { status: 'PENDING_APPROVAL', offsetDays: -1.5, comment: 'سفارش جدید نمایندگی اصفهان' },
            { status: 'APPROVED_BY_SALES', offsetDays: -1, comment: 'تایید سقف اعتباری و حواله مالی' },
            { status: 'VEHICLE_ASSIGNED', offsetDays: -0.2, comment: 'معرفی کامیون جفت جهت بارگیری فردا صبح' }
          ]
        },
        {
          id: 'ord-103',
          orderNumber: 'TCI-1402-03',
          customerName: 'نمایندگی رشت (پوربخش)',
          agentCode: 'AG-2019',
          productId: 'prod-2',
          productName: 'آجر سفال ۱۰ سانتی طبرستان (تیغه)',
          quantity: 25000,
          unit: 'قالب',
          destinationCity: 'گیلان - رشت',
          exactAddress: 'پروژه تعاونی فرهنگیان، جاده انزلی، نرسیده به پلیس راه',
          phoneNumber: '09113333333',
          createdAt: new Date(Date.now() - 4 * 60 * 60 * 1000).toISOString(),
          status: 'APPROVED_BY_SALES',
          priorityIndex: 0,
          history: [
            { status: 'PENDING_APPROVAL', offsetDays: -0.16, comment: 'ثبت سیستم شد' },
            { status: 'APPROVED_BY_SALES', offsetDays: -0.08, comment: 'مدیریت فروش سفارش را به کارخانه ارجاع داد.' }
          ]
        },
        {
          id: 'ord-104',
          orderNumber: 'TCI-1402-04',
          customerName: 'نمایندگی شیراز (نمازی)',
          agentCode: 'AG-7023',
          productId: 'prod-4',
          productName: 'آجر نما نسوز سموتی طبرستان',
          quantity: 8000,
          unit: 'قالب',
          destinationCity: 'فارس - شیراز',
          exactAddress: 'بلوار معالی آباد، کوچه ۱۲، پلاک آخر سمت چپ',
          phoneNumber: '09174444444',
          createdAt: new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString(),
          status: 'PENDING_APPROVAL',
          priorityIndex: 0,
          history: [
            { status: 'PENDING_APPROVAL', offsetDays: -0.04, comment: 'در انتظار بررسی بخش مدیریت مالی و فروش' }
          ]
        }
      ];
 
       for (const o of dummyOrders) {
         await db.query(`
           INSERT INTO orders (
             id, orderNumber, customerName, agentCode, productId, productName, quantity, unit,
             destinationCity, exactAddress, phoneNumber, notes, createdAt, status, priorityIndex,
             vehicleType, driverName, driverPhone, licensePlate, shippingAgency, estimatedArrival
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         `, [
           o.id, o.orderNumber, o.customerName, o.agentCode, o.productId, o.productName, o.quantity, o.unit,
           o.destinationCity, o.exactAddress, o.phoneNumber, o.notes || null, o.createdAt, o.status, o.priorityIndex,
           o.vehicleType || null, o.driverName || null, o.driverPhone || null, o.licensePlate || null, o.shippingAgency || null, o.estimatedArrival || null
         ]);
 
         for (const h of o.history) {
           const timestamp = h.offsetDays 
             ? new Date(Date.now() + h.offsetDays * 24 * 60 * 60 * 1000).toISOString()
             : new Date().toISOString();
           await db.query(`
             INSERT INTO order_history (orderId, status, updatedAt, comment)
             VALUES (?, ?, ?, ?)
           `, [o.id, h.status, timestamp, h.comment]);
         }
       }
     }
     // 5. App Users
      const [userRows] = await db.query("SELECT COUNT(*) as count FROM app_users") as any[];
      const userCount = (userRows && userRows[0]?.count !== undefined) ? userRows[0].count : 0;
      if (userCount === 0) {
        console.log("🌱 [Seed] Seeding default app users...");
        const dummyUsers = [
          ['usr-0', 'admin', 'ادمین ارشد نرم‌افزار', '09120000000', 'SYSTEM_ADMIN', null, null, 1, '123456'],
          ['usr-1', 'manager', 'آقای احمدی (مدیر بازرگانی)', '09121111111', 'SALES_MANAGER', null, null, 1, '123456'],
          ['usr-2', 'rep_tehran', 'آقای حمیدرضا احمدی', '09120000001', 'REPRESENTATIVE', 'AG-9081', null, 1, '123456'],
          ['usr-3', 'rep_esfahan', 'آقای علیرضا رجایی', '09130000002', 'REPRESENTATIVE', 'AG-6055', null, 1, '123456'],
          ['usr-4', 'rep_rasht', 'آقای سهراب پوربخش', '09110000003', 'REPRESENTATIVE', 'AG-2019', null, 1, '123456'],
          ['usr-5', 'rep_shiraz', 'آقای کریم نمازی', '09170000004', 'REPRESENTATIVE', 'AG-7023', null, 1, '123456'],
          ['usr-6', 'factory', 'مسئول اول فروش کارخانه', '09110000005', 'FACTORY_TRANSPORT', null, null, 1, '123456'],
          ['usr-62', 'factory2', 'مسئول دوم فروش کارخانه', '09110000007', 'FACTORY_TRANSPORT', null, null, 1, '123456'],
          ['usr-7', 'shipping_transit', 'باربری ترانزیت طبرستان', '09110000006', 'SHIPPING_COMPANY', null, 'sc-1', 1, '123456']
        ];
        for (const u of dummyUsers) {
          await db.query(
            "INSERT INTO app_users (id, username, fullName, phoneNumber, role, agentCode, shippingCompanyId, isEnabled, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            u
          );
        }
      } else {
        // Ensure SYSTEM_ADMIN (admin) user exists in SQL database if missing
        const [adminRows] = await db.query("SELECT COUNT(*) as count FROM app_users WHERE username = 'admin' OR role = 'SYSTEM_ADMIN' OR phoneNumber = '09120000000'") as any[];
        const adminCount = (adminRows && adminRows[0]?.count !== undefined) ? adminRows[0].count : 0;
        if (adminCount === 0) {
          console.log("🛡️ [Seed] Auto-inserting missing SYSTEM_ADMIN (admin) user in SQL database...");
          await db.query(
            "INSERT INTO app_users (id, username, fullName, phoneNumber, role, agentCode, shippingCompanyId, isEnabled, password) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            ['usr-0', 'admin', 'ادمین ارشد نرم‌افزار', '09120000000', 'SYSTEM_ADMIN', null, null, 1, '123456']
          );
        }
      }

      // Seed initial activity logs
      try {
        const [actRows] = await db.query("SELECT COUNT(*) as count FROM user_activity_logs") as any[];
        const actCount = (actRows && actRows[0]?.count !== undefined) ? actRows[0].count : 0;
        if (actCount === 0) {
          console.log("🌱 [Seed] Seeding default user activity logs...");
          const now = Date.now();
          const dummyActivityLogs = [
            ['act-1', 'usr-0', 'ادمین ارشد نرم‌افزار', 'SYSTEM_ADMIN', 'ورود به سیستم', 'ورود موفقیت‌آمیز به پنل ادمین ارشد با احراز هویت دو مرحله‌ای', 'AUTH', '192.168.1.100', 'SUCCESS', new Date(now - 3 * 60 * 1000).toISOString()],
            ['act-2', 'usr-1', 'آقای احمدی (مدیر بازرگانی)', 'SALES_MANAGER', 'تایید سفارش', 'تایید نهایی سفارش TCI-1402-01 و ارجاع به صف تولید کارخانه', 'ORDERS', '192.168.1.102', 'SUCCESS', new Date(now - 15 * 60 * 1000).toISOString()],
            ['act-3', 'usr-5', 'آقای کریم نمازی', 'REPRESENTATIVE', 'ثبت سفارش جدید', 'ثبت سفارش پیش‌فاکتور TCI-1402-04 شامل ۸,۰۰۰ قالب آجر نسوز سموتی', 'REPRESENTATIVE', '2.180.45.12', 'SUCCESS', new Date(now - 45 * 60 * 1000).toISOString()],
            ['act-4', 'usr-7', 'باربری ترانزیت طبرستان', 'SHIPPING_COMPANY', 'تخصیص ناوگان', 'تخصیص کامیون ۱۰ چرخ به رانندگی علی محمدی (ایران ۶۲ - ۴۵۶ ج ۸۸) برای سفارش TCI-1402-02', 'LOGISTICS', '5.160.120.88', 'SUCCESS', new Date(now - 90 * 60 * 1000).toISOString()],
            ['act-5', 'usr-0', 'ادمین ارشد نرم‌افزار', 'SYSTEM_ADMIN', 'ویرایش کاتالوگ محصول', 'بروزرسانی مشخصات و قیمت محصول سفال ۲۰×۲۰ سانتی‌متر طبرستان', 'PRODUCTS', '192.168.1.100', 'SUCCESS', new Date(now - 120 * 60 * 1000).toISOString()],
            ['act-6', 'usr-6', 'مسئول اول فروش کارخانه', 'FACTORY_TRANSPORT', 'بارگیری و خروج', 'تایید بارگیری و ثبت برگه خروج کامیون برای سفارش TCI-1402-03', 'FACTORY', '192.168.1.150', 'SUCCESS', new Date(now - 180 * 60 * 1000).toISOString()],
            ['act-7', 'usr-0', 'ادمین ارشد نرم‌افزار', 'SYSTEM_ADMIN', 'پاکسازی کش سرور', 'پاکسازی حافظه کش Redis و به روزرسانی نمایه‌ها', 'SYSTEM', '192.168.1.100', 'SUCCESS', new Date(now - 300 * 60 * 1000).toISOString()],
            ['act-8', 'usr-2', 'آقای حمیدرضا احمدی', 'REPRESENTATIVE', 'ویرایش پروفایل', 'به‌روزرسانی شماره تماس پشتیبانی نمایندگی تهران', 'USERS', '91.98.112.4', 'SUCCESS', new Date(now - 420 * 60 * 1000).toISOString()]
          ];
          for (const a of dummyActivityLogs) {
            await db.query(
              "INSERT INTO user_activity_logs (id, userId, userName, userRole, action, details, module, ipAddress, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
              a
            );
          }
        }
      } catch (err: any) {
        console.error("Error seeding activity logs:", err.message);
      }

      console.log("🌱 [Seed] Database tables successfully synchronized and seeded!");
   } catch (err: any) {
     console.error("❌ [Seed] Error during seeding database:", err.message);
   }
 }


// --- Activity Logging & Telemetry Helpers ---
const inMemoryActivityLogs: any[] = [];

export async function logUserActivity(log: {
  userId?: string;
  userName: string;
  userRole: string;
  action: string;
  details?: string;
  module?: string;
  ipAddress?: string;
  status?: 'SUCCESS' | 'WARNING' | 'ERROR';
}) {
  const logEntry = {
    id: `act-${Date.now()}-${Math.floor(Math.random()*1000)}`,
    userId: log.userId || 'SYSTEM',
    userName: log.userName || 'ناشناس',
    userRole: log.userRole || 'USER',
    action: log.action,
    details: log.details || '',
    module: log.module || 'GENERAL',
    ipAddress: log.ipAddress || '127.0.0.1',
    status: log.status || 'SUCCESS',
    createdAt: new Date().toISOString()
  };

  inMemoryActivityLogs.unshift(logEntry);
  if (inMemoryActivityLogs.length > 300) inMemoryActivityLogs.pop();

  try {
    const db = getDbPool();
    await db.query(`
      INSERT INTO user_activity_logs (id, userId, userName, userRole, action, details, module, ipAddress, status, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      logEntry.id, logEntry.userId, logEntry.userName, logEntry.userRole,
      logEntry.action, logEntry.details, logEntry.module, logEntry.ipAddress,
      logEntry.status, logEntry.createdAt
    ]);
  } catch (err: any) {
    console.error("Could not write activity log to MySQL:", err.message);
  }
}

export async function getUserActivityLogs(limit = 100): Promise<any[]> {
  try {
    const db = getDbPool();
    const [rows] = await db.query(`
      SELECT * FROM user_activity_logs ORDER BY createdAt DESC LIMIT ?
    `, [limit]) as any[];
    if (Array.isArray(rows) && rows.length > 0) {
      return rows;
    }
  } catch (err: any) {
    console.error("Error fetching activity logs from MySQL:", err.message);
  }
  return inMemoryActivityLogs.slice(0, limit);
}
