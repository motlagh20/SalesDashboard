import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";
import { bootstrapDatabase, getDbPool, getRedisClient } from "./server/database";

// Load environment variables
dotenv.config();

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Initialize and check database tables
  await bootstrapDatabase();

  // Middleware for parsing JSON & URL-encoded request bodies
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // --- API Routes ---

  // Health check endpoint
  app.get("/api/health", (req, res) => {
    res.json({ 
      status: "ok", 
      message: "سرور پورتال فروش سفال طبرستان با موفقیت در دسترس است.",
      timestamp: new Date().toISOString()
    });
  });

  // 1. PRODUCTS API
  app.get("/api/products", async (req, res) => {
    try {
      const redis = getRedisClient();
      if (redis) {
        const cached = await redis.get("products_list");
        if (cached) {
          console.log("⚡ [Redis] Products cache hit!");
          return res.json(JSON.parse(cached));
        }
      }
      
      console.log("🔄 [DB] Products cache miss. Querying MariaDB...");
      const db = getDbPool();
      const [rows] = await db.query("SELECT * FROM products");
      const products = (rows as any[]).map(p => ({
        ...p,
        isEnabled: !!p.isEnabled
      }));
      
      if (redis) {
        await redis.set("products_list", JSON.stringify(products), "EX", 600); // 10 minutes cache
      }
      res.json(products);
    } catch (err: any) {
      console.error("Error in GET /api/products:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/products", async (req, res) => {
    try {
      const db = getDbPool();
      const { id, name, category, pricePerUnit, unit, description, weight, dimensions, coverageInfo } = req.body;
      await db.query(
        "INSERT INTO products (id, name, category, pricePerUnit, unit, description, weight, dimensions, coverageInfo, isEnabled) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1)",
        [id, name, category, pricePerUnit, unit, description || null, weight || null, dimensions || null, coverageInfo || null]
      );
      
      // Invalidate cache
      const redis = getRedisClient();
      if (redis) await redis.del("products_list");
      
      res.status(201).json({ success: true, id });
    } catch (err: any) {
      console.error("Error in POST /api/products:", err);
      let errMsg = "خطای غیرمنتظره در سرور رخ داده است.";
      if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
        errMsg = "محصولی با این شناسه یا نام قبلاً در پایگاه داده ثبت شده است.";
      } else {
        errMsg = err.message || "خطا در برقراری ارتباط با پایگاه داده.";
      }
      res.status(500).json({ error: errMsg });
    }
  });

  app.patch("/api/products/:id/toggle", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      await db.query("UPDATE products SET isEnabled = NOT isEnabled WHERE id = ?", [id]);
      
      // Invalidate cache
      const redis = getRedisClient();
      if (redis) await redis.del("products_list");
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in PATCH /api/products/:id/toggle:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/products/:id", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      await db.query("DELETE FROM products WHERE id = ?", [id]);
      
      // Invalidate cache
      const redis = getRedisClient();
      if (redis) await redis.del("products_list");
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in DELETE /api/products/:id:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 2. AGENTS API
  app.get("/api/agents", async (req, res) => {
    try {
      const redis = getRedisClient();
      if (redis) {
        const cached = await redis.get("agents_list");
        if (cached) {
          console.log("⚡ [Redis] Agents cache hit!");
          return res.json(JSON.parse(cached));
        }
      }
      
      console.log("🔄 [DB] Agents cache miss. Querying MariaDB...");
      const db = getDbPool();
      const [rows] = await db.query("SELECT * FROM agents");
      const agents = (rows as any[]).map(a => ({
        ...a,
        isEnabled: !!a.isEnabled
      }));
      
      if (redis) {
        await redis.set("agents_list", JSON.stringify(agents), "EX", 600);
      }
      res.json(agents);
    } catch (err: any) {
      console.error("Error in GET /api/agents:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/agents", async (req, res) => {
    try {
      const db = getDbPool();
      const { id, fullName, alias, agentCode, phoneNumber, address, area } = req.body;
      await db.query(
        "INSERT INTO agents (id, fullName, alias, agentCode, phoneNumber, address, area, isEnabled) VALUES (?, ?, ?, ?, ?, ?, ?, 1)",
        [id, fullName, alias, agentCode, phoneNumber, address || null, area || null]
      );
      
      const redis = getRedisClient();
      if (redis) await redis.del("agents_list");
      
      res.status(201).json({ success: true, id });
    } catch (err: any) {
      console.error("Error in POST /api/agents:", err);
      let errMsg = "خطای غیرمنتظره در سرور رخ داده است.";
      if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
        const agCode = req.body?.agentCode || "";
        errMsg = `کد نمایندگی "${agCode}" قبلاً در سیستم ثبت شده است. لطفاً از یک کد نمایندگی متمایز و یکتا استفاده نمایید.`;
      } else {
        errMsg = err.message || "خطا در عملیات ثبت در پایگاه داده.";
      }
      res.status(500).json({ error: errMsg });
    }
  });

  app.patch("/api/agents/:id/toggle", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      await db.query("UPDATE agents SET isEnabled = NOT isEnabled WHERE id = ?", [id]);
      
      const redis = getRedisClient();
      if (redis) await redis.del("agents_list");
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in PATCH /api/agents/:id/toggle:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/agents/:id", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      await db.query("DELETE FROM agents WHERE id = ?", [id]);
      
      const redis = getRedisClient();
      if (redis) await redis.del("agents_list");
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in DELETE /api/agents/:id:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 3. SHIPPING COMPANIES API
  app.get("/api/shipping-companies", async (req, res) => {
    try {
      const redis = getRedisClient();
      if (redis) {
        const cached = await redis.get("shipping_companies_list");
        if (cached) {
          console.log("⚡ [Redis] Shipping Companies cache hit!");
          return res.json(JSON.parse(cached));
        }
      }
      
      console.log("🔄 [DB] Shipping Companies cache miss. Querying MariaDB...");
      const db = getDbPool();
      const [rows] = await db.query("SELECT * FROM shipping_companies");
      const companies = (rows as any[]).map(sc => ({
        ...sc,
        isEnabled: !!sc.isEnabled
      }));
      
      if (redis) {
        await redis.set("shipping_companies_list", JSON.stringify(companies), "EX", 600);
      }
      res.json(companies);
    } catch (err: any) {
      console.error("Error in GET /api/shipping-companies:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/shipping-companies", async (req, res) => {
    try {
      const db = getDbPool();
      const { id, name, code, phoneNumber, managerName } = req.body;
      await db.query(
        "INSERT INTO shipping_companies (id, name, code, phoneNumber, managerName, isEnabled) VALUES (?, ?, ?, ?, ?, 1)",
        [id, name, code, phoneNumber, managerName || null]
      );
      
      const redis = getRedisClient();
      if (redis) await redis.del("shipping_companies_list");
      
      res.status(201).json({ success: true, id });
    } catch (err: any) {
      console.error("Error in POST /api/shipping-companies:", err);
      let errMsg = "خطای غیرمنتظره در سرور رخ داده است.";
      if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
        const trCode = req.body?.code || "";
        errMsg = `کد ترابری یا نام آژانس حمل و نقل "${trCode}" قبلاً ثبت گردیده است.`;
      } else {
        errMsg = err.message || "خطا در برقراری ارتباط با پایگاه داده.";
      }
      res.status(500).json({ error: errMsg });
    }
  });

  app.patch("/api/shipping-companies/:id/toggle", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      await db.query("UPDATE shipping_companies SET isEnabled = NOT isEnabled WHERE id = ?", [id]);
      
      const redis = getRedisClient();
      if (redis) await redis.del("shipping_companies_list");
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in PATCH /api/shipping-companies/:id/toggle:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.delete("/api/shipping-companies/:id", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      await db.query("DELETE FROM shipping_companies WHERE id = ?", [id]);
      
      const redis = getRedisClient();
      if (redis) await redis.del("shipping_companies_list");
      
      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in DELETE /api/shipping-companies/:id:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 4. ORDERS API
  app.get("/api/orders", async (req, res) => {
    try {
      const db = getDbPool();
      const [orderRows] = await db.query("SELECT * FROM orders ORDER BY priorityIndex ASC, createdAt DESC") as any[];
      const [historyRows] = await db.query("SELECT * FROM order_history ORDER BY updatedAt ASC") as any[];
      
      const historyMap: Record<string, any[]> = {};
      for (const h of historyRows) {
        if (!historyMap[h.orderId]) {
          historyMap[h.orderId] = [];
        }
        historyMap[h.orderId].push({
          status: h.status,
          updatedAt: h.updatedAt,
          comment: h.comment
        });
      }

      const orders = orderRows.map((o: any) => {
        const formatted: any = {
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customerName,
          agentCode: o.agentCode,
          productId: o.productId,
          productName: o.productName,
          quantity: o.quantity,
          unit: o.unit,
          destinationCity: o.destinationCity,
          exactAddress: o.exactAddress,
          phoneNumber: o.phoneNumber,
          notes: o.notes,
          createdAt: o.createdAt,
          sentToFactoryAt: o.sentToFactoryAt,
          status: o.status,
          priorityIndex: o.priorityIndex,
          rejectionReason: o.rejectionReason,
          statusHistory: historyMap[o.id] || []
        };

        if (o.driverName || o.driverPhone || o.licensePlate || o.shippingAgency) {
          formatted.vehicleDetails = {
            vehicleType: o.vehicleType,
            driverName: o.driverName,
            driverPhone: o.driverPhone,
            licensePlate: o.licensePlate,
            shippingAgency: o.shippingAgency,
            estimatedArrival: o.estimatedArrival
          };
        }
        return formatted;
      });

      res.json(orders);
    } catch (err: any) {
      console.error("Error in GET /api/orders:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/orders", async (req, res) => {
    try {
      const db = getDbPool();
      const { customerName, agentCode, productId, productName, quantity, unit, destinationCity, exactAddress, phoneNumber, notes } = req.body;
      
      const id = `ord-${Date.now()}`;
      
      // Count orders to generate unique TCL sequence number
      const [countRows] = await db.query("SELECT COUNT(*) as count FROM orders") as any[];
      let nextNum = (countRows as any[])[0].count + 1;

      // Ensure full compatibility with physical MariaDB/MySQL in production to prevent key duplication
      try {
        const [rows] = await db.query("SELECT orderNumber FROM orders") as any[];
        if (Array.isArray(rows) && rows.length > 0) {
          const numbers = rows
            .map((r: any) => {
              const parts = r.orderNumber ? r.orderNumber.split('-') : [];
              const numStr = parts[parts.length - 1];
              return parseInt(numStr, 10);
            })
            .filter((n: number) => !isNaN(n));
          if (numbers.length > 0) {
            const maxVal = Math.max(...numbers);
            if (maxVal >= nextNum) {
              nextNum = maxVal + 1;
            }
          }
        }
      } catch (err) {
        // Fallback for mock environment or missing table columns
        console.warn("⚠️ Unique sequence check failed, using default count index:", err);
      }

      const orderNumber = `TCL-1402-0${nextNum}`;
      const createdAt = new Date().toISOString();
      const status = "PENDING_APPROVAL";

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
         
        await connection.query(`
          INSERT INTO orders (
            id, orderNumber, customerName, agentCode, productId, productName, quantity, unit,
            destinationCity, exactAddress, phoneNumber, notes, createdAt, status, priorityIndex
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        `, [id, orderNumber, customerName, agentCode, productId, productName, quantity, unit, destinationCity, exactAddress, phoneNumber, notes || null, createdAt, status]);

        await connection.query(`
          INSERT INTO order_history (orderId, status, updatedAt, comment)
          VALUES (?, ?, ?, ?)
        `, [id, status, createdAt, "ثبت سفارش از طریق اپلیکیشن نمایندگی"]);

        await connection.commit();
        res.status(201).json({ success: true, id, orderNumber });
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }
    } catch (err: any) {
      console.error("Error in POST /api/orders:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/orders/:id/approve", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      const updatedAt = new Date().toISOString();
      const status = "APPROVED_BY_SALES";

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        await connection.query("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
        await connection.query(`
          INSERT INTO order_history (orderId, status, updatedAt, comment)
          VALUES (?, ?, ?, ?)
        `, [id, status, updatedAt, "تایید نهایی سفارش توسط دفتر مدیریت فروش فروشگاه طبرستان و ارجاع به کارخانه"]);

        await connection.commit();
        res.json({ success: true });
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }
    } catch (err: any) {
      console.error("Error in PATCH /api/orders/:id/approve:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/orders/:id/reject", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      const { reason } = req.body;
      const updatedAt = new Date().toISOString();
      const status = "REJECTED";

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        await connection.query("UPDATE orders SET status = ?, rejectionReason = ? WHERE id = ?", [status, reason, id]);
        await connection.query(`
          INSERT INTO order_history (orderId, status, updatedAt, comment)
          VALUES (?, ?, ?, ?)
        `, [id, status, updatedAt, `درخواست لغو شد به دلیل: ${reason}`]);

        await connection.commit();
        res.json({ success: true });
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }
    } catch (err: any) {
      console.error("Error in PATCH /api/orders/:id/reject:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/orders/:id/dispatch-factory", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      const { comment } = req.body;
      const updatedAt = new Date().toISOString();
      const status = "SENT_TO_FACTORY";

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        await connection.query("UPDATE orders SET status = ?, sentToFactoryAt = ? WHERE id = ?", [status, updatedAt, id]);
        await connection.query(`
          INSERT INTO order_history (orderId, status, updatedAt, comment)
          VALUES (?, ?, ?, ?)
        `, [id, status, updatedAt, comment || "سفارش تأیید شد، اولویت‌بندی نهایی گردید و جهت تأمین وسیله نقلیه به کارخانه ارسال شد."]);

        await connection.commit();
        res.json({ success: true });
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }
    } catch (err: any) {
      console.error("Error in PATCH /api/orders/:id/dispatch-factory:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/orders/bulk-approve", async (req, res) => {
    try {
      const db = getDbPool();
      const [pendingRows] = await db.query("SELECT id FROM orders WHERE status = 'PENDING_APPROVAL'") as any[];
      if (pendingRows.length === 0) {
        return res.status(400).json({ error: 'هیچ سفارشی در انتظار تایید وجود ندارد.' });
      }

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const updatedAt = new Date().toISOString();
        const status = "APPROVED_BY_SALES";

        for (const order of pendingRows) {
          await connection.query("UPDATE orders SET status = ? WHERE id = ?", [status, order.id]);
          await connection.query(`
            INSERT INTO order_history (orderId, status, updatedAt, comment)
            VALUES (?, ?, ?, ?)
          `, [order.id, status, updatedAt, 'تایید دسته‌جمعی کل کارتابل سفارشات توسط مدیر فروش و بازرگانی طبرستان']);
        }

        await connection.commit();
        res.json({ success: true, count: pendingRows.length });
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }
    } catch (err: any) {
      console.error("Error in POST /api/orders/bulk-approve:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/orders/bulk-dispatch", async (req, res) => {
    try {
      const db = getDbPool();
      const [approvedRows] = await db.query("SELECT id FROM orders WHERE status = 'APPROVED_BY_SALES'") as any[];
      if (approvedRows.length === 0) {
        return res.status(400).json({ error: 'هیچ سفارش تایید شده‌ای جهت ارسال به کارخانه یافت نشد.' });
      }

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        const now = Date.now();
        const status = "SENT_TO_FACTORY";

        for (let idx = 0; idx < approvedRows.length; idx++) {
          const order = approvedRows[idx];
          const sentTime = new Date(now + idx * 1000).toISOString();
          const updatedAt = new Date().toISOString();
          
          await connection.query("UPDATE orders SET status = ?, sentToFactoryAt = ? WHERE id = ?", [status, sentTime, order.id]);
          await connection.query(`
            INSERT INTO order_history (orderId, status, updatedAt, comment)
            VALUES (?, ?, ?, ?)
          `, [order.id, status, updatedAt, 'ارسال دسته‌جمعی به خط کارخانه / اولویت‌بندی پیش‌فرض تأمین وسیله نقلیه در ترابری طبرستان']);
        }

        await connection.commit();
        res.json({ success: true, count: approvedRows.length });
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
         connection.release();
      }
    } catch (err: any) {
      console.error("Error in POST /api/orders/bulk-dispatch:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/orders/reorder-priorities", async (req, res) => {
    try {
      const db = getDbPool();
      const { sortedOrders } = req.body; // array of { id, priorityIndex }
      
      if (!Array.isArray(sortedOrders)) {
        return res.status(400).json({ error: 'ساختار ورودی نامعتبر است.' });
      }

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        for (const item of sortedOrders) {
          await connection.query("UPDATE orders SET priorityIndex = ? WHERE id = ?", [item.priorityIndex, item.id]);
        }
        await connection.commit();
        res.json({ success: true });
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }
    } catch (err: any) {
      console.error("Error in PUT /api/orders/reorder-priorities:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/orders/:id/assign-vehicle", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      const { vehicleType, driverName, driverPhone, licensePlate, shippingAgency, estimatedArrival } = req.body;
      const updatedAt = new Date().toISOString();
      const status = "VEHICLE_ASSIGNED";

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        await connection.query(`
          UPDATE orders SET 
            status = ?,
            vehicleType = ?,
            driverName = ?,
            driverPhone = ?,
            licensePlate = ?,
            shippingAgency = ?,
            estimatedArrival = ?
          WHERE id = ?
        `, [status, vehicleType, driverName, driverPhone, licensePlate, shippingAgency, estimatedArrival, id]);

        await connection.query(`
          INSERT INTO order_history (orderId, status, updatedAt, comment)
          VALUES (?, ?, ?, ?)
        `, [id, status, updatedAt, `تخصیص وسیله نقلیه ${vehicleType} متعلق به باربری ${shippingAgency} به رانندگی ${driverName}`]);

        await connection.commit();
        res.json({ success: true });
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }
    } catch (err: any) {
      console.error("Error in PATCH /api/orders/:id/assign-vehicle:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.patch("/api/orders/:id/dispatch", async (req, res) => {
    try {
      const db = getDbPool();
      const { id } = req.params;
      const updatedAt = new Date().toISOString();
      const status = "LOADED_AND_DISPATCHED";

      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();

        await connection.query("UPDATE orders SET status = ? WHERE id = ?", [status, id]);
        await connection.query(`
          INSERT INTO order_history (orderId, status, updatedAt, comment)
          VALUES (?, ?, ?, ?)
        `, [id, status, updatedAt, 'محصول با موفقیت بارگیری شد و خودرو از درب حراست کارخانه ترخیص و به سمت مقصد حرکت کرد.']);

        await connection.commit();
        res.json({ success: true });
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }
    } catch (err: any) {
      console.error("Error in PATCH /api/orders/:id/dispatch:", err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/system/reset-demo", async (req, res) => {
    try {
      const db = getDbPool();
      
      const connection = await db.getConnection();
      try {
        await connection.beginTransaction();
        await connection.query("DELETE FROM order_history");
        await connection.query("DELETE FROM orders");
        await connection.query("DELETE FROM products");
        await connection.query("DELETE FROM agents");
        await connection.query("DELETE FROM shipping_companies");
        await connection.commit();
      } catch (txErr) {
        await connection.rollback();
        throw txErr;
      } finally {
        connection.release();
      }

      // Re-seed tables
      await bootstrapDatabase();

      // Clear all Redis caches
      const redis = getRedisClient();
      if (redis) {
        await redis.del("products_list");
        await redis.del("agents_list");
        await redis.del("shipping_companies_list");
      }

      res.json({ success: true });
    } catch (err: any) {
      console.error("Error in POST /api/system/reset-demo:", err);
      res.status(500).json({ error: err.message });
    }
  });

  // --- Vite / Frontend Serving ---

  if (process.env.NODE_ENV !== "production") {
    console.log("Starting in DEVELOPMENT mode with Vite dev middleware...");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Starting in PRODUCTION mode...");
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[OK] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
