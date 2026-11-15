import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import {
  generateToken,
  normalizeRole,
  buildOrderQueryForUser,
  buildAgentQueryForUser,
  buildShippingCompanyQueryForUser,
  sanitizeOrderForRole,
  sanitizeProductForRole,
  sanitizeShippingCompanyForRole,
  sanitizePermanentDriverForRole,
  checkPermanentDriverOwnership,
  checkOrderStageForMutation
} from "../server/auth";

const BASE_URL = process.env.TEST_API_URL || "http://127.0.0.1:3000";

async function apiRequest(endpoint: string, options: {
  method?: string;
  token?: string;
  body?: any;
  headers?: Record<string, string>;
} = {}): Promise<{ status: number; headers: Headers; data: any }> {
  const { method = "GET", token, body, headers = {} } = options;
  const reqHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers
  };

  if (body !== undefined) {
    reqHeaders["Content-Type"] = "application/json";
  }

  if (token) {
    reqHeaders["Authorization"] = `Bearer ${token}`;
  }

  const res = await fetch(`${BASE_URL}${endpoint}`, {
    method,
    headers: reqHeaders,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });

  let data: any = null;
  const contentType = res.headers.get("content-type");
  if (contentType && contentType.includes("application/json")) {
    try {
      data = await res.json();
    } catch {
      data = null;
    }
  } else {
    data = await res.text();
  }

  return { status: res.status, headers: res.headers, data };
}

describe("SEC-009: Comprehensive RBAC, Least Privilege, Scoping & Anti-Leakage Security Tests", () => {
  describe("1. Unit Tests — Role Aliases, SQL Builders & Field Projection Helpers", () => {
    it("preserves backward-compatible legacy role aliases via normalizeRole", () => {
      assert.equal(normalizeRole("ADMIN"), "SYSTEM_ADMIN");
      assert.equal(normalizeRole("AGENT"), "REPRESENTATIVE");
      assert.equal(normalizeRole("FACTORY"), "FACTORY_TRANSPORT");
      assert.equal(normalizeRole("WAREHOUSE"), "PRODUCT_WAREHOUSE");
      assert.equal(normalizeRole("SECURITY"), "SECURITY_GATE");
      assert.equal(normalizeRole("SALES_MANAGER"), "SALES_MANAGER");
      assert.equal(normalizeRole("SHIPPING_COMPANY"), "SHIPPING_COMPANY");
    });

    it("enforces fail-closed SQL queries for agents and shipping companies by role", () => {
      assert.equal(buildAgentQueryForUser({ id: "1", username: "wh", role: "PRODUCT_WAREHOUSE" }).allowed, false);
      assert.equal(buildAgentQueryForUser({ id: "2", username: "sec", role: "SECURITY_GATE" }).allowed, false);
      assert.equal(buildAgentQueryForUser({ id: "3", username: "fac", role: "FACTORY_TRANSPORT" }).allowed, false);
      assert.equal(buildAgentQueryForUser({ id: "4", username: "sc", role: "SHIPPING_COMPANY" }).allowed, false);

      const repQ = buildAgentQueryForUser({ id: "5", username: "rep", role: "AGENT", agentCode: "AG-9081" });
      assert.equal(repQ.allowed, true);
      assert.ok(repQ.sql.includes("WHERE agentCode = ?"));
      assert.deepEqual(repQ.params, ["AG-9081"]);

      assert.equal(buildShippingCompanyQueryForUser({ id: "5", username: "rep", role: "REPRESENTATIVE", agentCode: "AG-9081" }).allowed, false);
      assert.equal(buildShippingCompanyQueryForUser({ id: "1", username: "wh", role: "WAREHOUSE" }).allowed, false);
      assert.equal(buildShippingCompanyQueryForUser({ id: "2", username: "sec", role: "SECURITY" }).allowed, false);

      const scQ = buildShippingCompanyQueryForUser({ id: "6", username: "sc", role: "SHIPPING_COMPANY", shippingCompanyId: "sc-1" });
      assert.equal(scQ.allowed, true);
      assert.ok(scQ.sql.includes("WHERE id = ?"));
      assert.deepEqual(scQ.params, ["sc-1"]);

      const facQ = buildShippingCompanyQueryForUser({ id: "7", username: "fac", role: "FACTORY" });
      assert.equal(facQ.allowed, true);
      assert.ok(facQ.sql.includes("WHERE isEnabled = 1"));
    });

    it("strips commercial pricing from products & order itemsJson for operational roles", () => {
      const sampleProduct = {
        id: "prod-1",
        name: "بلوک طبرستان",
        category: "blocks",
        pricePerUnit: 850000,
        unit: "عدد",
        weight: 12,
        dimensions: "20x20x40",
        coverageInfo: "12.5/m2",
        primaryUnit: "عدد",
        secondaryUnit: "پالت",
        conversionRatio: 60,
        isEnabled: 1
      };

      const adminProd = sanitizeProductForRole(sampleProduct, { id: "0", username: "admin", role: "ADMIN" });
      assert.equal(adminProd.pricePerUnit, 850000);

      const repProd = sanitizeProductForRole(sampleProduct, { id: "2", username: "rep", role: "REPRESENTATIVE" });
      assert.equal(repProd.pricePerUnit, 850000);

      for (const role of ["FACTORY_TRANSPORT", "SHIPPING_COMPANY", "PRODUCT_WAREHOUSE", "SECURITY_GATE"]) {
        const opProd = sanitizeProductForRole(sampleProduct, { id: "x", username: "u", role });
        assert.equal(opProd.id, "prod-1");
        assert.equal(opProd.name, "بلوک طبرستان");
        assert.equal(opProd.pricePerUnit, undefined, `Role ${role} MUST NOT receive product pricePerUnit`);
      }

      const sampleOrder = {
        id: "ord-test",
        customerName: "پروژه آزمایشی",
        buyerName: "مهندس علوی",
        phoneNumber: "09121234567",
        notes: "توضیحات محرمانه مالی",
        paymentTrackingCode: "TRK-SECRET-123",
        paymentReceiptUrl: "/uploads/secret.jpg",
        paymentReceiptName: "secret.jpg",
        pendingEditData: "{\"price\":999}",
        rejectionReason: "دلیل داخلی",
        deliveryLocationUrl: "https://maps.google.com/?q=35.7,51.4",
        warehouseDetails: { exitPermitNumber: "WH-101" },
        securityGateDetails: { gatePassNumber: "GP-101" },
        itemsJson: JSON.stringify([{ id: "prod-1", q: 100, p: 850000 }])
      };

      const whOrder = sanitizeOrderForRole(sampleOrder, { id: "8", username: "wh", role: "PRODUCT_WAREHOUSE" });
      assert.equal(whOrder.paymentTrackingCode, undefined);
      assert.equal(whOrder.paymentReceiptUrl, undefined);
      assert.equal(whOrder.pendingEditData, undefined);
      assert.equal(whOrder.warehouseDetails.exitPermitNumber, "WH-101");
      assert.ok(!String(whOrder.itemsJson).includes("850000"));

      const secOrder = sanitizeOrderForRole(sampleOrder, { id: "9", username: "sec", role: "SECURITY_GATE" });
      assert.equal(secOrder.paymentTrackingCode, undefined);
      assert.equal(secOrder.buyerName, undefined);
      assert.equal(secOrder.phoneNumber, undefined);
      assert.equal(secOrder.notes, undefined);
      assert.equal(secOrder.securityGateDetails.gatePassNumber, "GP-101");
      assert.ok(!String(secOrder.itemsJson).includes("850000"));

      const scOrder = sanitizeOrderForRole(sampleOrder, { id: "7", username: "sc", role: "SHIPPING_COMPANY" });
      assert.equal(scOrder.paymentTrackingCode, undefined);
      assert.equal(scOrder.warehouseDetails, undefined);
      assert.equal(scOrder.securityGateDetails, undefined);
      assert.ok(!String(scOrder.itemsJson).includes("850000"));
    });

    it("redacts driver PII for FACTORY_TRANSPORT and enforces SHIPPING_COMPANY driver ownership", () => {
      const driver = {
        id: "drv-test",
        driverName: "راننده تست",
        driverPhone: "09120001122",
        licensePlate: "11الف111ایران11",
        vehicleType: "تریلی",
        shippingAgency: "باربری ترانزیت",
        shippingCompanyId: "sc-1",
        nationalCode: "0011223344",
        smartCardNumber: "99887766",
        isEnabled: 1
      };

      const facDriver = sanitizePermanentDriverForRole(driver, { id: "6", username: "fac", role: "FACTORY" });
      assert.equal(facDriver.driverName, "راننده تست");
      assert.equal(facDriver.nationalCode, undefined);
      assert.equal(facDriver.smartCardNumber, undefined);

      assert.equal(
        sanitizePermanentDriverForRole(driver, { id: "72", username: "sc2", role: "SHIPPING_COMPANY", shippingCompanyId: "sc-2" }, "باربری زاینده‌رود"),
        null
      );
      assert.ok(
        sanitizePermanentDriverForRole(driver, { id: "7", username: "sc1", role: "SHIPPING_COMPANY", shippingCompanyId: "sc-1" }, "باربری ترانزیت")
      );

      const sc2Ownership = checkPermanentDriverOwnership(driver, { id: "72", username: "sc2", role: "SHIPPING_COMPANY", shippingCompanyId: "sc-2" }, "باربری زاینده‌رود");
      assert.equal(sc2Ownership.allowed, false);
      assert.equal(sc2Ownership.status, 403);
    });

    it("enforces fail-closed default for unknown order query roles and workflow stage guards", () => {
      const unknownOrderQ = buildOrderQueryForUser({ id: "x", username: "u", role: "UNKNOWN_ROLE" });
      assert.equal(unknownOrderQ.filterType, "NONE");
      assert.ok(unknownOrderQ.sql.includes("WHERE 1 = 0"));

      const stageDeny = checkOrderStageForMutation(
        "PENDING_APPROVAL",
        { id: "8", username: "wh", role: "PRODUCT_WAREHOUSE" },
        { default: ["VEHICLE_ASSIGNED", "WAREHOUSE_LOADED"] }
      );
      assert.equal(stageDeny.allowed, false);
      assert.equal(stageDeny.status, 403);
    });
  });

  describe("2. End-to-End API RBAC, Stage Scoping, Field Redaction & Cache Isolation", () => {
    const adminToken = generateToken({ id: "usr-0", username: "admin", role: "ADMIN" });
    const managerToken = generateToken({ id: "usr-1", username: "manager", role: "SALES_MANAGER" });
    const rep1Token = generateToken({ id: "usr-2", username: "rep_tehran", role: "AGENT" });
    const factoryToken = generateToken({ id: "usr-6", username: "factory", role: "FACTORY" });
    const sc1Token = generateToken({ id: "usr-7", username: "shipping_transit", role: "SHIPPING_COMPANY" });
    const sc2Token = generateToken({ id: "usr-72", username: "shipping_zayandeh", role: "SHIPPING_COMPANY" });
    const warehouseToken = generateToken({ id: "usr-8", username: "warehouse", role: "WAREHOUSE" });
    const securityToken = generateToken({ id: "usr-9", username: "security_gate", role: "SECURITY" });

    let pendingOrderId: string;
    let factoryOrderId: string;
    let vehicleOrderId: string;
    let sc2DriverId: string;

    before(async () => {
      // Order 1: remains PENDING_APPROVAL
      const r1 = await apiRequest("/api/orders", {
        method: "POST",
        token: rep1Token,
        body: {
          customerName: "سفارش در انتظار تایید SEC009",
          buyerName: "خریدار محرمانه اول",
          phoneNumber: "09121110001",
          destinationCity: "تهران",
          exactAddress: "تهران خیابان ولیعصر",
          quantity: 120,
          paymentTrackingCode: "PAY-PENDING-9001",
          paymentReceiptUrl: "/uploads/pay-pending.jpg",
          notes: "یادداشت محرمانه نمایندگی",
          itemsJson: [{ id: "prod-1", q: 120, p: 920000 }]
        }
      });
      assert.equal(r1.status, 201);
      pendingOrderId = r1.data.id;

      // Order 2: SENT_TO_FACTORY
      const r2 = await apiRequest("/api/orders", {
        method: "POST",
        token: rep1Token,
        body: {
          customerName: "سفارش مرحله کارخانه SEC009",
          buyerName: "خریدار مرحله کارخانه",
          phoneNumber: "09121110002",
          destinationCity: "ساری",
          exactAddress: "ساری بلوار خزر",
          quantity: 200,
          paymentTrackingCode: "PAY-FACTORY-9002",
          itemsJson: [{ id: "prod-1", q: 200, p: 920000 }]
        }
      });
      assert.equal(r2.status, 201);
      factoryOrderId = r2.data.id;
      assert.equal((await apiRequest(`/api/orders/${factoryOrderId}/approve`, { method: "PATCH", token: managerToken, body: {} })).status, 200);
      assert.equal((await apiRequest(`/api/orders/${factoryOrderId}/dispatch-factory`, { method: "PATCH", token: managerToken, body: {} })).status, 200);

      // Order 3: VEHICLE_ASSIGNED (sc-1)
      const r3 = await apiRequest("/api/orders", {
        method: "POST",
        token: rep1Token,
        body: {
          customerName: "سفارش مرحله انبار SEC009",
          buyerName: "خریدار محرمانه حراست",
          phoneNumber: "09121110003",
          destinationCity: "رشت",
          exactAddress: "رشت میدان گلسار",
          quantity: 300,
          paymentTrackingCode: "PAY-VEHICLE-9003",
          paymentReceiptUrl: "/uploads/pay-vehicle.jpg",
          notes: "توضیحات محرمانه تجاری",
          itemsJson: [{ id: "prod-1", q: 300, p: 920000 }]
        }
      });
      assert.equal(r3.status, 201);
      vehicleOrderId = r3.data.id;
      assert.equal((await apiRequest(`/api/orders/${vehicleOrderId}/approve`, { method: "PATCH", token: managerToken, body: {} })).status, 200);
      assert.equal((await apiRequest(`/api/orders/${vehicleOrderId}/dispatch-factory`, { method: "PATCH", token: managerToken, body: {} })).status, 200);
      const assignRes = await apiRequest(`/api/orders/${vehicleOrderId}/assign-vehicle`, {
        method: "PATCH",
        token: factoryToken,
        body: {
          vehicleType: "تریلی ۱۸ چرخ",
          driverName: "راننده تست انبار",
          driverPhone: "09114445566",
          licensePlate: "22ب333ایران72",
          shippingAgency: "باربری ترانزیت شمال طبرستان",
          shippingCompanyId: "sc-1"
        }
      });
      assert.equal(assignRes.status, 200);

      // Driver created by SC2 (sc-2) for BOLA & spoofing checks
      const drvRes = await apiRequest("/api/permanent-drivers", {
        method: "POST",
        token: sc2Token,
        body: {
          driverName: "راننده اختصاصی زاینده رود",
          driverPhone: "09138889900",
          licensePlate: "44ج555ایران13",
          vehicleType: "کامیون",
          shippingCompanyId: "sc-1", // Spoof attempt must be overridden to sc-2
          shippingAgency: "باربری جعلی",
          nationalCode: "1234567890",
          smartCardNumber: "7778889"
        }
      });
      assert.equal(drvRes.status, 201);
      sc2DriverId = drvRes.data.id;
    });

    it("prevents cache poisoning across roles when ADMIN requests master endpoints first", async () => {
      // Warm Redis cache as ADMIN
      assert.equal((await apiRequest("/api/products", { token: adminToken })).status, 200);
      assert.equal((await apiRequest("/api/agents", { token: adminToken })).status, 200);
      assert.equal((await apiRequest("/api/shipping-companies", { token: adminToken })).status, 200);
      assert.equal((await apiRequest("/api/permanent-drivers", { token: adminToken })).status, 200);

      // Products: operational role must NOT get pricePerUnit even when admin cached first
      const whProdRes = await apiRequest("/api/products", { token: warehouseToken });
      assert.equal(whProdRes.status, 200);
      assert.ok(Array.isArray(whProdRes.data) && whProdRes.data.length > 0);
      assert.equal(whProdRes.data[0].pricePerUnit, undefined, "Warehouse must never get cached pricePerUnit");

      // Agents: Rep sees ONLY AG-9081; operational roles get 403
      const repAgRes = await apiRequest("/api/agents", { token: rep1Token });
      assert.equal(repAgRes.status, 200);
      assert.ok(repAgRes.data.every((a: any) => a.agentCode === "AG-9081"));
      for (const opTok of [factoryToken, sc1Token, warehouseToken, securityToken]) {
        assert.equal((await apiRequest("/api/agents", { token: opTok })).status, 403);
      }

      // Shipping companies: Rep, Warehouse, Security -> 403; SC1 -> only sc-1; Factory -> no nationalId/economicCode/managerName/address
      for (const deniedTok of [rep1Token, warehouseToken, securityToken]) {
        assert.equal((await apiRequest("/api/shipping-companies", { token: deniedTok })).status, 403);
      }
      const sc1Res = await apiRequest("/api/shipping-companies", { token: sc1Token });
      assert.equal(sc1Res.status, 200);
      assert.ok(sc1Res.data.length >= 1 && sc1Res.data.every((c: any) => c.id === "sc-1"));

      const facScRes = await apiRequest("/api/shipping-companies", { token: factoryToken });
      assert.equal(facScRes.status, 200);
      assert.ok(Array.isArray(facScRes.data) && facScRes.data.length > 0);
      assert.equal(facScRes.data[0].nationalId, undefined);
      assert.equal(facScRes.data[0].economicCode, undefined);
      assert.equal(facScRes.data[0].managerName, undefined);

      // Permanent drivers: Rep, Warehouse, Security -> 403; Factory -> no PII; SC1 -> cannot see SC2 driver
      for (const deniedTok of [rep1Token, warehouseToken, securityToken]) {
        assert.equal((await apiRequest("/api/permanent-drivers", { token: deniedTok })).status, 403);
      }
      const facDrvRes = await apiRequest("/api/permanent-drivers", { token: factoryToken });
      assert.equal(facDrvRes.status, 200);
      assert.ok(facDrvRes.data.every((d: any) => d.nationalCode === undefined && d.smartCardNumber === undefined));

      const sc1DrvRes = await apiRequest("/api/permanent-drivers", { token: sc1Token });
      assert.equal(sc1DrvRes.status, 200);
      assert.ok(!sc1DrvRes.data.some((d: any) => d.id === sc2DriverId), "SC1 MUST NOT see SC2 driver");
    });

    it("enforces BOLA ownership & anti-spoofing on permanent-drivers mutations", async () => {
      // Verify SC2 driver was forced to shippingCompanyId: sc-2 despite spoofed body
      const sc2DrvRes = await apiRequest("/api/permanent-drivers", { token: sc2Token });
      assert.equal(sc2DrvRes.status, 200);
      const createdDrv = sc2DrvRes.data.find((d: any) => d.id === sc2DriverId);
      assert.ok(createdDrv);
      assert.equal(createdDrv.shippingCompanyId, "sc-2");

      // SC1 tries to PUT, PATCH toggle, and DELETE SC2's driver -> all MUST fail with 403
      const putRes = await apiRequest(`/api/permanent-drivers/${sc2DriverId}`, {
        method: "PUT",
        token: sc1Token,
        body: {
          driverName: "راننده هک شده",
          driverPhone: "09110001122",
          licensePlate: "99الف999ایران99",
          shippingCompanyId: "sc-2"
        }
      });
      assert.equal(putRes.status, 403);

      const toggleRes = await apiRequest(`/api/permanent-drivers/${sc2DriverId}/toggle`, {
        method: "PATCH",
        token: sc1Token
      });
      assert.equal(toggleRes.status, 403);

      const delRes = await apiRequest(`/api/permanent-drivers/${sc2DriverId}`, {
        method: "DELETE",
        token: sc1Token
      });
      assert.equal(delRes.status, 403);

      // Clean up own driver as SC2 -> 200
      const ownDelRes = await apiRequest(`/api/permanent-drivers/${sc2DriverId}`, {
        method: "DELETE",
        token: sc2Token
      });
      assert.equal(ownDelRes.status, 200);
    });

    it("enforces stage scoping and field redaction on /api/orders and /api/sync/bootstrap", async () => {
      // 1. Factory Transport: sees SENT_TO_FACTORY & VEHICLE_ASSIGNED, NOT PENDING_APPROVAL; no paymentTrackingCode or item prices
      const facBoot = await apiRequest("/api/sync/bootstrap?role=SYSTEM_ADMIN&agentCode=AG-9081", { token: factoryToken });
      assert.equal(facBoot.status, 200);
      assert.equal(facBoot.data.systemSettings, undefined, "Non-manager bootstrap must omit systemSettings");
      assert.deepEqual(facBoot.data.agents, []);
      const facOrderIds = facBoot.data.orders.map((o: any) => o.id);
      assert.ok(!facOrderIds.includes(pendingOrderId), "FACTORY_TRANSPORT must not receive PENDING_APPROVAL orders");
      assert.ok(facOrderIds.includes(factoryOrderId));
      const facOrder = facBoot.data.orders.find((o: any) => o.id === factoryOrderId);
      assert.equal(facOrder.paymentTrackingCode, undefined);
      assert.ok(!JSON.stringify(facOrder).includes("920000"), "Item prices must be stripped for FACTORY_TRANSPORT");

      // 2. Product Warehouse: sees VEHICLE_ASSIGNED, NOT PENDING_APPROVAL or SENT_TO_FACTORY; no agents/sc/drivers/payment codes
      const whBoot = await apiRequest("/api/sync/bootstrap", { token: warehouseToken });
      assert.equal(whBoot.status, 200);
      assert.deepEqual(whBoot.data.agents, []);
      assert.deepEqual(whBoot.data.shippingCompanies, []);
      assert.deepEqual(whBoot.data.permanentDrivers, []);
      const whOrderIds = whBoot.data.orders.map((o: any) => o.id);
      assert.ok(!whOrderIds.includes(pendingOrderId));
      assert.ok(!whOrderIds.includes(factoryOrderId));
      assert.ok(whOrderIds.includes(vehicleOrderId));
      const whOrder = whBoot.data.orders.find((o: any) => o.id === vehicleOrderId);
      assert.equal(whOrder.paymentTrackingCode, undefined);
      assert.equal(whOrder.paymentReceiptUrl, undefined);

      // 3. Security Gate: sees ONLY WAREHOUSE_LOADED / LOADED_AND_DISPATCHED (not VEHICLE_ASSIGNED yet)
      const secPreRes = await apiRequest("/api/orders", { token: securityToken });
      assert.equal(secPreRes.status, 200);
      assert.ok(!secPreRes.data.some((o: any) => o.id === vehicleOrderId), "SECURITY_GATE must not see VEHICLE_ASSIGNED before warehouse load");

      // Warehouse loads the order -> transitions to WAREHOUSE_LOADED (or LOADED_AND_DISPATCHED depending on setting)
      const whLoad = await apiRequest(`/api/orders/${vehicleOrderId}/warehouse-load`, {
        method: "PATCH",
        token: warehouseToken,
        body: {
          loadedPalletsCount: 10,
          actualQuantity: 300,
          packagingType: "PALLET",
          exitPermitNumber: "WH-SEC009"
        }
      });
      assert.equal(whLoad.status, 200);

      // Security Gate now sees the loaded order, WITH buyerName / phoneNumber / notes / payment redacted
      const secPostRes = await apiRequest("/api/orders", { token: securityToken });
      assert.equal(secPostRes.status, 200);
      const secOrder = secPostRes.data.find((o: any) => o.id === vehicleOrderId);
      assert.ok(secOrder, "SECURITY_GATE must see loaded order");
      assert.equal(secOrder.buyerName, undefined);
      assert.equal(secOrder.phoneNumber, undefined);
      assert.equal(secOrder.notes, undefined);
      assert.equal(secOrder.paymentTrackingCode, undefined);
      assert.equal(secOrder.paymentReceiptUrl, undefined);
    });

    it("enforces workflow stage preconditions on order mutation endpoints", async () => {
      // Warehouse cannot load a PENDING_APPROVAL order
      const badWhLoad = await apiRequest(`/api/orders/${pendingOrderId}/warehouse-load`, {
        method: "PATCH",
        token: warehouseToken,
        body: { loadedPalletsCount: 5 }
      });
      assert.equal(badWhLoad.status, 403);

      // Security gate cannot clear a SENT_TO_FACTORY order
      const badSecClear = await apiRequest(`/api/orders/${factoryOrderId}/security-clearance`, {
        method: "PATCH",
        token: securityToken,
        body: { gatePassNumber: "GP-BAD" }
      });
      assert.equal(badSecClear.status, 403);

      // Shipping company cannot assign vehicle on an order not assigned to it or not in stage
      const badScAssign = await apiRequest(`/api/orders/${pendingOrderId}/assign-vehicle`, {
        method: "PATCH",
        token: sc1Token,
        body: {
          vehicleType: "تریلی",
          driverName: "تست",
          driverPhone: "09110001122",
          licensePlate: "11الف222ایران72"
        }
      });
      assert.equal(badScAssign.status, 403);
    });

    it("restricts heartbeat onlineUsers, system-settings, activity-logs POST, and monitor-data internals", async () => {
      // Non-admin/non-manager heartbeat omits onlineUsers & onlineCount
      const repHb = await apiRequest("/api/users/heartbeat", {
        method: "POST",
        token: rep1Token,
        body: { role: "SYSTEM_ADMIN" }
      });
      assert.equal(repHb.status, 200);
      assert.equal(repHb.data.onlineUsers, undefined);
      assert.equal(repHb.data.onlineCount, undefined);

      // Admin heartbeat still returns onlineUsers & onlineCount
      const adminHb = await apiRequest("/api/users/heartbeat", { method: "POST", token: adminToken, body: {} });
      assert.equal(adminHb.status, 200);
      assert.ok(Array.isArray(adminHb.data.onlineUsers));

      // Non-manager/non-admin denied on GET /api/system-settings & POST /api/system/activity-logs
      for (const tok of [rep1Token, factoryToken, sc1Token, warehouseToken, securityToken]) {
        assert.equal((await apiRequest("/api/system-settings", { token: tok })).status, 403);
        assert.equal(
          (await apiRequest("/api/system/activity-logs", {
            method: "POST",
            token: tok,
            body: { action: "spoof" }
          })).status,
          403
        );
      }

      // SALES_MANAGER monitor-data omits errorLogs & low-level hardware/node internals, while SYSTEM_ADMIN sees them
      const mgrMonitor = await apiRequest("/api/system/monitor-data", { token: managerToken });
      assert.equal(mgrMonitor.status, 200);
      assert.equal(mgrMonitor.data.errorLogs, undefined, "SALES_MANAGER must not receive raw db_errors.log");
      assert.equal(mgrMonitor.data.metrics?.hardware, undefined, "SALES_MANAGER must not receive hardware internals");

      const admMonitor = await apiRequest("/api/system/monitor-data", { token: adminToken });
      assert.equal(admMonitor.status, 200);
      assert.ok(admMonitor.data.errorLogs !== undefined);
      assert.ok(admMonitor.data.metrics?.hardware !== undefined);
    });
  });
});
