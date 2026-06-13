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
