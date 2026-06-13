import mysql from "mysql2/promise";
import Redis from "ioredis";

// Lazy connection instances
let pool: mysql.Pool | null = null;
let redis: Redis | null = null;

/**
 * Returns the MariaDB (MySQL-compatible) connection pool.
 * Initializes the pool lazily on the first request.
 */
export function getDbPool(): mysql.Pool {
  if (!pool) {
    const host = process.env.DB_HOST || "localhost";
    const port = Number(process.env.DB_PORT) || 3306;
    const user = process.env.DB_USER || "root";
    const password = process.env.DB_PASSWORD || "";
    const database = process.env.DB_NAME || "sales_dashboard";

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
    });
  }
  return pool;
}

/**
 * Returns the Redis client instance.
 * Initializes the connection lazily.
 */
export function getRedisClient(): Redis | null {
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
        lazyConnect: true, // Avoids blocking server startup if Redis is temporarily unreachable
        maxRetriesPerRequest: 3,
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
  return redis;
}

/**
 * Utility to test database readiness and create tables if they do not exist.
 * This is perfect for initial bootstrapping on Ubuntu.
 */
export async function bootstrapDatabase() {
  try {
    const db = getDbPool();
    console.log("🔄 [Bootstrap] Checking MariaDB tables...");

    // 1. Create Products Table
    await db.query(`
      CREATE TABLE IF NOT EXISTS products (
        id VARCHAR(50) PRIMARY KEY,
        name VARCHAR(150) NOT NULL,
        category VARCHAR(100) NOT NULL,
        pricePerUnit DECIMAL(15, 2) NOT NULL,
        unit VARCHAR(50) NOT NULL,
        description TEXT,
        weight VARCHAR(50),
        dimensions VARCHAR(50),
        coverageInfo VARCHAR(150),
        isEnabled TINYINT(1) DEFAULT 1
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
        isEnabled TINYINT(1) DEFAULT 1
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

    console.log("✅ [Bootstrap] MariaDB tables checked and synchronized successfully!");

    // Seed tables if empty
    await seedDatabaseIfEmpty(db);

    // Test Redis connectivity if configured
    const redisClient = getRedisClient();
    if (redisClient) {
      await redisClient.ping();
      console.log("✅ [Bootstrap] Redis connection verified successfully!");
    }
  } catch (error: any) {
    console.error("⚠️ [Bootstrap] Database connectivity is not ready yet because:", error.message);
    console.info("💡 App is still running. You can adjust your credentials first without issues.");
  }
}

async function seedDatabaseIfEmpty(db: mysql.Pool) {
  try {
    // 1. Products
    const [prodRows] = await db.query("SELECT COUNT(*) as count FROM products") as any[];
    if (prodRows[0].count === 0) {
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
    if (agentRows[0].count === 0) {
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
    if (shipRows[0].count === 0) {
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
    if (orderRows[0].count === 0) {
      console.log("🌱 [Seed] Seeding default orders...");
      const dummyOrders = [
        {
          id: 'ord-101',
          orderNumber: 'TCL-1402-01',
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
          orderNumber: 'TCL-1402-02',
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
          orderNumber: 'TCL-1402-03',
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
          orderNumber: 'TCL-1402-04',
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
     console.log("🌱 [Seed] Database tables successfully synchronized and seeded!");
   } catch (err: any) {
     console.error("❌ [Seed] Error during seeding database:", err.message);
   }
 }
