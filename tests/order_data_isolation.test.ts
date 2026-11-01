import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { generateToken, buildOrderQueryForUser, checkOrderOwnership } from "../server/auth";

const BASE_URL = process.env.TEST_API_URL || "http://127.0.0.1:3000";

async function apiRequest(endpoint: string, options: {
  method?: string;
  token?: string;
  body?: any;
  headers?: Record<string, string>;
} = {}): Promise<{ status: number; headers: Headers; data: any }> {
  const { method = "GET", token, body, headers = {} } = options;
  const reqHeaders: Record<string, string> = {
    "Accept": "application/json",
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

describe("Cross-Representative & Cross-Shipping-Company Order Data Isolation Tests", () => {
  // Unit tests for SQL query builder & ownership checking
  describe("1. Database Query Authorization Builder Unit Tests", () => {
    it("builds SQL with WHERE agentCode = ? for REPRESENTATIVE with authorized agentCode", () => {
      const auth = buildOrderQueryForUser({
        id: "usr-2",
        username: "rep_tehran",
        role: "REPRESENTATIVE",
        agentCode: "AG-9081"
      });

      assert.equal(auth.isRestricted, true);
      assert.equal(auth.filterType, "AGENT");
      assert.equal(auth.filterValue, "AG-9081");
      assert.ok(auth.sql.includes("WHERE agentCode = ?"));
      assert.deepEqual(auth.params, ["AG-9081"]);
    });

    it("builds SQL with WHERE 1 = 0 for REPRESENTATIVE without assigned agentCode", () => {
      const auth = buildOrderQueryForUser({
        id: "usr-unassigned",
        username: "rep_unassigned",
        role: "REPRESENTATIVE",
        agentCode: null
      });

      assert.equal(auth.isRestricted, true);
      assert.ok(auth.sql.includes("WHERE 1 = 0"));
      assert.deepEqual(auth.params, []);
    });

    it("builds SQL with WHERE shippingCompanyId = ? for SHIPPING_COMPANY with authorized shippingCompanyId", () => {
      const auth = buildOrderQueryForUser({
        id: "usr-7",
        username: "shipping_transit",
        role: "SHIPPING_COMPANY",
        shippingCompanyId: "sc-1"
      });

      assert.equal(auth.isRestricted, true);
      assert.equal(auth.filterType, "SHIPPING_COMPANY");
      assert.equal(auth.filterValue, "sc-1");
      assert.ok(auth.sql.includes("WHERE shippingCompanyId = ?"));
      assert.deepEqual(auth.params, ["sc-1"]);
    });

    it("builds SQL with WHERE 1 = 0 for SHIPPING_COMPANY without assigned shippingCompanyId", () => {
      const auth = buildOrderQueryForUser({
        id: "usr-unassigned-sc",
        username: "sc_unassigned",
        role: "SHIPPING_COMPANY",
        shippingCompanyId: null
      });

      assert.equal(auth.isRestricted, true);
      assert.ok(auth.sql.includes("WHERE 1 = 0"));
      assert.deepEqual(auth.params, []);
    });

    it("preserves unconstrained access for SYSTEM_ADMIN and SALES_MANAGER", () => {
      const adminAuth = buildOrderQueryForUser({
        id: "usr-0",
        username: "admin",
        role: "SYSTEM_ADMIN"
      });
      assert.equal(adminAuth.isRestricted, false);
      assert.equal(adminAuth.filterType, "ALL");
      assert.ok(!adminAuth.sql.includes("WHERE"));
      assert.deepEqual(adminAuth.params, []);

      const managerAuth = buildOrderQueryForUser({
        id: "usr-1",
        username: "manager",
        role: "SALES_MANAGER"
      });
      assert.equal(managerAuth.isRestricted, false);
      assert.ok(!managerAuth.sql.includes("WHERE"));
      assert.deepEqual(managerAuth.params, []);
    });

    it("preserves unconstrained operational access for FACTORY_TRANSPORT, PRODUCT_WAREHOUSE, and SECURITY_GATE", () => {
      for (const role of ["FACTORY_TRANSPORT", "PRODUCT_WAREHOUSE", "SECURITY_GATE"]) {
        const auth = buildOrderQueryForUser({
          id: `usr-${role}`,
          username: `user_${role}`,
          role
        });
        assert.equal(auth.isRestricted, false);
        assert.ok(!auth.sql.includes("WHERE"));
      }
    });

    it("strictly isolates order ownership in checkOrderOwnership", () => {
      const rep1User = { id: "usr-2", username: "rep_tehran", role: "REPRESENTATIVE", agentCode: "AG-9081" };
      const rep2Order = { agentCode: "AG-6055", shippingCompanyId: "sc-1" };
      const ownOrder = { agentCode: "AG-9081", shippingCompanyId: "sc-1" };

      // Rep 1 cannot access Rep 2's order
      const crossCheck = checkOrderOwnership(rep2Order, rep1User);
      assert.equal(crossCheck.allowed, false);
      assert.equal(crossCheck.status, 403);

      // Rep 1 can access own order
      const ownCheck = checkOrderOwnership(ownOrder, rep1User);
      assert.equal(ownCheck.allowed, true);

      // Shipping Company 1 cannot access Shipping Company 2's order
      const sc1User = { id: "usr-7", username: "sc1", role: "SHIPPING_COMPANY", shippingCompanyId: "sc-1" };
      const sc2Order = { agentCode: "AG-9081", shippingCompanyId: "sc-2" };
      const scCheck = checkOrderOwnership(sc2Order, sc1User);
      assert.equal(scCheck.allowed, false);
      assert.equal(scCheck.status, 403);

      // Admin can access all orders
      const adminUser = { id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" };
      assert.equal(checkOrderOwnership(rep2Order, adminUser).allowed, true);
      assert.equal(checkOrderOwnership(sc2Order, adminUser).allowed, true);
    });
  });

  // End-to-end API tests with 2 Representatives, 2 Shipping Companies, and Admin/Manager
  describe("2. End-to-End API Order Isolation with Two Representatives & Two Shipping Companies", () => {
    // 2 Representatives:
    // Rep 1: Tehran (AG-9081)
    const rep1Token = generateToken({ id: "usr-2", username: "rep_tehran", role: "REPRESENTATIVE" });
    // Rep 2: Esfahan (AG-6055)
    const rep2Token = generateToken({ id: "usr-3", username: "rep_esfahan", role: "REPRESENTATIVE" });

    // 2 Shipping Companies:
    // SC 1: Transit Tabarestan (sc-1)
    const sc1Token = generateToken({ id: "usr-7", username: "shipping_transit", role: "SHIPPING_COMPANY" });
    // SC 2: Zayandeh Rood (sc-2)
    const sc2Token = generateToken({ id: "usr-72", username: "shipping_zayandeh", role: "SHIPPING_COMPANY" });

    // Management roles:
    const adminToken = generateToken({ id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" });
    const managerToken = generateToken({ id: "usr-1", username: "manager", role: "SALES_MANAGER" });

    let rep1OrderId: string;
    let rep2OrderId: string;
    let sc1OrderId: string;
    let sc2OrderId: string;

    before(async () => {
      // 1. Create Order 1 as Representative 1 (Tehran AG-9081)
      const res1 = await apiRequest("/api/orders", {
        method: "POST",
        token: rep1Token,
        body: {
          customerName: "پروژه برج میلاد تهران",
          phoneNumber: "09121112233",
          destinationCity: "تهران",
          exactAddress: "بزرگراه همت، برج میلاد، طبقه سوم",
          quantity: 150,
          unit: "متر مربع",
          paymentTrackingCode: "TRK-TEHRAN-9081",
          notes: "سفارش محرمانه نمایندگی تهران"
        }
      });
      assert.equal(res1.status, 201, `Failed to create Rep 1 order: ${JSON.stringify(res1.data)}`);
      rep1OrderId = res1.data.id;

      // 2. Create Order 2 as Representative 2 (Esfahan AG-6055)
      const res2 = await apiRequest("/api/orders", {
        method: "POST",
        token: rep2Token,
        body: {
          customerName: "مجتمع تجاری سی‌وسه‌پل اصفهان",
          phoneNumber: "09139998877",
          destinationCity: "اصفهان",
          exactAddress: "میدان انقلاب، خیابان چهارباغ عباسی",
          quantity: 280,
          unit: "متر مربع",
          paymentTrackingCode: "TRK-ESFAHAN-6055",
          notes: "سفارش محرمانه نمایندگی اصفهان"
        }
      });
      assert.equal(res2.status, 201, `Failed to create Rep 2 order: ${JSON.stringify(res2.data)}`);
      rep2OrderId = res2.data.id;

      // 3. Create Order 3 and assign to Shipping Company 1 (sc-1) via Manager
      const res3 = await apiRequest("/api/orders", {
        method: "POST",
        token: managerToken,
        body: {
          customerName: "انبار مرکزی ترانزیت طبرستان",
          phoneNumber: "09115554433",
          destinationCity: "ساری",
          exactAddress: "کیلومتر ۳ جاده فیروزکوه",
          quantity: 500,
          unit: "متر مربع",
          agentCode: "AG-0000"
        }
      });
      assert.equal(res3.status, 201);
      sc1OrderId = res3.data.id;

      // Assign vehicle / shipping company 1 (sc-1) to Order 3
      const assign1 = await apiRequest(`/api/orders/${sc1OrderId}/assign-vehicle`, {
        method: "PATCH",
        token: managerToken,
        body: {
          vehicleType: "تریلی ۱۸ چرخ لبه‌دار",
          driverName: "راننده ترانزیت یک",
          driverPhone: "09110001122",
          licensePlate: "۷۲ع۲۱۵ایران۲۴",
          shippingAgency: "باربری ترانزیت طبرستان",
          shippingCompanyId: "sc-1",
          billOfLadingNumber: "BL-SC1-001"
        }
      });
      assert.equal(assign1.status, 200, `Failed to assign SC1: ${JSON.stringify(assign1.data)}`);

      // 4. Create Order 4 and assign to Shipping Company 2 (sc-2) via Manager
      const res4 = await apiRequest("/api/orders", {
        method: "POST",
        token: managerToken,
        body: {
          customerName: "انبار زاینده‌رود اصفهان",
          phoneNumber: "09135554433",
          destinationCity: "اصفهان",
          exactAddress: "شهرک صنعتی جی",
          quantity: 400,
          unit: "متر مربع",
          agentCode: "AG-0000"
        }
      });
      assert.equal(res4.status, 201);
      sc2OrderId = res4.data.id;

      // Assign vehicle / shipping company 2 (sc-2) to Order 4
      const assign2 = await apiRequest(`/api/orders/${sc2OrderId}/assign-vehicle`, {
        method: "PATCH",
        token: managerToken,
        body: {
          vehicleType: "کامیون تک ۱۰ تن",
          driverName: "راننده زاینده‌رود دو",
          driverPhone: "09130002233",
          licensePlate: "۴۳ع۹۸۱ایران۱۳",
          shippingAgency: "باربری زاینده‌رود طبرستان",
          shippingCompanyId: "sc-2",
          billOfLadingNumber: "BL-SC2-002"
        }
      });
      assert.equal(assign2.status, 200, `Failed to assign SC2: ${JSON.stringify(assign2.data)}`);
    });

    it("Representatives ONLY receive orders belonging to their authorized agentCode in GET /api/orders", async () => {
      // Rep 1 (Tehran AG-9081)
      const resRep1 = await apiRequest("/api/orders", { token: rep1Token });
      assert.equal(resRep1.status, 200);
      assert.ok(Array.isArray(resRep1.data));

      const rep1Orders = resRep1.data;
      const rep1Ids = rep1Orders.map((o: any) => o.id);

      assert.ok(rep1Ids.includes(rep1OrderId), "Rep 1 must receive their own order");
      assert.ok(!rep1Ids.includes(rep2OrderId), "Rep 1 MUST NOT receive Rep 2's order");
      assert.ok(!rep1Ids.includes(sc1OrderId), "Rep 1 MUST NOT receive Shipping Company 1's order");
      assert.ok(!rep1Ids.includes(sc2OrderId), "Rep 1 MUST NOT receive Shipping Company 2's order");

      // Verify all orders returned to Rep 1 strictly belong to AG-9081
      for (const order of rep1Orders) {
        assert.equal(order.agentCode, "AG-9081", "Every order returned to Rep 1 must belong to AG-9081");
      }

      // Rep 2 (Esfahan AG-6055)
      const resRep2 = await apiRequest("/api/orders", { token: rep2Token });
      assert.equal(resRep2.status, 200);
      assert.ok(Array.isArray(resRep2.data));

      const rep2Orders = resRep2.data;
      const rep2Ids = rep2Orders.map((o: any) => o.id);

      assert.ok(rep2Ids.includes(rep2OrderId), "Rep 2 must receive their own order");
      assert.ok(!rep2Ids.includes(rep1OrderId), "Rep 2 MUST NOT receive Rep 1's order");
      assert.ok(!rep2Ids.includes(sc1OrderId), "Rep 2 MUST NOT receive Shipping Company 1's order");
      assert.ok(!rep2Ids.includes(sc2OrderId), "Rep 2 MUST NOT receive Shipping Company 2's order");

      // Verify all orders returned to Rep 2 strictly belong to AG-6055
      for (const order of rep2Orders) {
        assert.equal(order.agentCode, "AG-6055", "Every order returned to Rep 2 must belong to AG-6055");
      }
    });

    it("Representatives ONLY receive their authorized orders in GET /api/sync/bootstrap", async () => {
      // Rep 1 bootstrap
      const res1 = await apiRequest("/api/sync/bootstrap", { token: rep1Token });
      assert.equal(res1.status, 200);
      assert.ok(Array.isArray(res1.data.orders));

      const rep1BootstrapIds = res1.data.orders.map((o: any) => o.id);
      assert.ok(rep1BootstrapIds.includes(rep1OrderId), "Rep 1 bootstrap must include Rep 1 order");
      assert.ok(!rep1BootstrapIds.includes(rep2OrderId), "Rep 1 bootstrap MUST NOT leak Rep 2 order");
      assert.ok(!rep1BootstrapIds.includes(sc1OrderId), "Rep 1 bootstrap MUST NOT leak SC 1 order");
      assert.ok(!rep1BootstrapIds.includes(sc2OrderId), "Rep 1 bootstrap MUST NOT leak SC 2 order");

      // Rep 2 bootstrap
      const res2 = await apiRequest("/api/sync/bootstrap", { token: rep2Token });
      assert.equal(res2.status, 200);
      assert.ok(Array.isArray(res2.data.orders));

      const rep2BootstrapIds = res2.data.orders.map((o: any) => o.id);
      assert.ok(rep2BootstrapIds.includes(rep2OrderId), "Rep 2 bootstrap must include Rep 2 order");
      assert.ok(!rep2BootstrapIds.includes(rep1OrderId), "Rep 2 bootstrap MUST NOT leak Rep 1 order");
      assert.ok(!rep2BootstrapIds.includes(sc1OrderId), "Rep 2 bootstrap MUST NOT leak SC 1 order");
      assert.ok(!rep2BootstrapIds.includes(sc2OrderId), "Rep 2 bootstrap MUST NOT leak SC 2 order");
    });

    it("Shipping companies ONLY receive orders assigned to their shippingCompanyId in GET /api/orders", async () => {
      // SC 1 (Transit Tabarestan: sc-1)
      const resSC1 = await apiRequest("/api/orders", { token: sc1Token });
      assert.equal(resSC1.status, 200);
      assert.ok(Array.isArray(resSC1.data));

      const sc1Orders = resSC1.data;
      const sc1Ids = sc1Orders.map((o: any) => o.id);

      assert.ok(sc1Ids.includes(sc1OrderId), "SC 1 must receive Order 3 assigned to sc-1");
      assert.ok(!sc1Ids.includes(sc2OrderId), "SC 1 MUST NOT receive Order 4 assigned to sc-2");
      assert.ok(!sc1Ids.includes(rep1OrderId), "SC 1 MUST NOT receive Rep 1 order");
      assert.ok(!sc1Ids.includes(rep2OrderId), "SC 1 MUST NOT receive Rep 2 order");

      for (const order of sc1Orders) {
        assert.equal(order.shippingCompanyId, "sc-1", "Every order for SC 1 must match shippingCompanyId: sc-1");
      }

      // SC 2 (Zayandeh Rood: sc-2)
      const resSC2 = await apiRequest("/api/orders", { token: sc2Token });
      assert.equal(resSC2.status, 200);
      assert.ok(Array.isArray(resSC2.data));

      const sc2Orders = resSC2.data;
      const sc2Ids = sc2Orders.map((o: any) => o.id);

      assert.ok(sc2Ids.includes(sc2OrderId), "SC 2 must receive Order 4 assigned to sc-2");
      assert.ok(!sc2Ids.includes(sc1OrderId), "SC 2 MUST NOT receive Order 3 assigned to sc-1");
      assert.ok(!sc2Ids.includes(rep1OrderId), "SC 2 MUST NOT receive Rep 1 order");
      assert.ok(!sc2Ids.includes(rep2OrderId), "SC 2 MUST NOT receive Rep 2 order");

      for (const order of sc2Orders) {
        assert.equal(order.shippingCompanyId, "sc-2", "Every order for SC 2 must match shippingCompanyId: sc-2");
      }
    });

    it("Shipping companies ONLY receive their assigned orders in GET /api/sync/bootstrap", async () => {
      // SC 1 bootstrap
      const res1 = await apiRequest("/api/sync/bootstrap", { token: sc1Token });
      assert.equal(res1.status, 200);
      assert.ok(Array.isArray(res1.data.orders));

      const sc1BootstrapIds = res1.data.orders.map((o: any) => o.id);
      assert.ok(sc1BootstrapIds.includes(sc1OrderId), "SC 1 bootstrap must include sc-1 order");
      assert.ok(!sc1BootstrapIds.includes(sc2OrderId), "SC 1 bootstrap MUST NOT leak sc-2 order");
      assert.ok(!sc1BootstrapIds.includes(rep1OrderId), "SC 1 bootstrap MUST NOT leak rep 1 order");
      assert.ok(!sc1BootstrapIds.includes(rep2OrderId), "SC 1 bootstrap MUST NOT leak rep 2 order");

      // SC 2 bootstrap
      const res2 = await apiRequest("/api/sync/bootstrap", { token: sc2Token });
      assert.equal(res2.status, 200);
      assert.ok(Array.isArray(res2.data.orders));

      const sc2BootstrapIds = res2.data.orders.map((o: any) => o.id);
      assert.ok(sc2BootstrapIds.includes(sc2OrderId), "SC 2 bootstrap must include sc-2 order");
      assert.ok(!sc2BootstrapIds.includes(sc1OrderId), "SC 2 bootstrap MUST NOT leak sc-1 order");
      assert.ok(!sc2BootstrapIds.includes(rep1OrderId), "SC 2 bootstrap MUST NOT leak rep 1 order");
      assert.ok(!sc2BootstrapIds.includes(rep2OrderId), "SC 2 bootstrap MUST NOT leak rep 2 order");
    });

    it("does NOT trust caller-supplied agentCode in request body or query (Anti-Spoofing)", async () => {
      // 1. Rep 1 attempts to pass agentCode = AG-6055 (Rep 2's code) in GET /api/orders query parameter
      const spoofQueryRes = await apiRequest("/api/orders?agentCode=AG-6055", { token: rep1Token });
      assert.equal(spoofQueryRes.status, 200);
      const orders = spoofQueryRes.data;
      const ids = orders.map((o: any) => o.id);
      assert.ok(ids.includes(rep1OrderId), "Rep 1 receives own order");
      assert.ok(!ids.includes(rep2OrderId), "Rep 1 cannot receive Rep 2's order via spoofed query parameter");

      // 2. Rep 1 attempts to create order spoofing Rep 2's code in POST /api/orders body
      const spoofBodyRes = await apiRequest("/api/orders", {
        method: "POST",
        token: rep1Token,
        body: {
          customerName: "تست تلاش برای جعل کد نمایندگی",
          phoneNumber: "09121234567",
          destinationCity: "تهران",
          exactAddress: "تهران تست",
          quantity: 10,
          agentCode: "AG-6055" // Maliciously trying to create under Rep 2
        }
      });
      assert.equal(spoofBodyRes.status, 201);
      const createdOrderId = spoofBodyRes.data.id;

      // Verify that created order was forced to Rep 1's real code AG-9081 in the database
      const adminCheck = await apiRequest("/api/orders", { token: adminToken });
      const createdOrder = adminCheck.data.find((o: any) => o.id === createdOrderId);
      assert.ok(createdOrder);
      assert.equal(createdOrder.agentCode, "AG-9081", "Created order MUST use caller's verified agentCode, ignoring spoofed body");
    });

    it("does NOT trust caller-supplied shippingCompanyId in assign-vehicle (Anti-Spoofing)", async () => {
      // SC 1 attempts to assign a vehicle claiming to be SC 2 (shippingCompanyId: sc-2)
      // First, create an unassigned order
      const newOrderRes = await apiRequest("/api/orders", {
        method: "POST",
        token: managerToken,
        body: {
          customerName: "سفارش تست جعل باربری",
          phoneNumber: "09125556677",
          destinationCity: "ساری",
          exactAddress: "ساری آدرس",
          quantity: 20
        }
      });
      const testOrderId = newOrderRes.data.id;

      // Assign to SC 1
      await apiRequest(`/api/orders/${testOrderId}/assign-vehicle`, {
        method: "PATCH",
        token: managerToken,
        body: {
          vehicleType: "کامیون",
          driverName: "علی",
          driverPhone: "09112223344",
          licensePlate: "۱۲الف۳۴۵ایران۱۱",
          shippingCompanyId: "sc-1"
        }
      });

      // SC 1 tries to change shippingCompanyId to sc-2 in assign-vehicle
      const spoofRes = await apiRequest(`/api/orders/${testOrderId}/assign-vehicle`, {
        method: "PATCH",
        token: sc1Token,
        body: {
          vehicleType: "تریلی",
          driverName: "حسن",
          driverPhone: "09115556677",
          licensePlate: "۳۴ب۵۶۷ایران۲۲",
          shippingCompanyId: "sc-2" // Spoofed ID
        }
      });
      assert.equal(spoofRes.status, 200);

      // Verify that the order remains strictly assigned to sc-1
      const verifyRes = await apiRequest("/api/orders", { token: adminToken });
      const checkedOrder = verifyRes.data.find((o: any) => o.id === testOrderId);
      assert.ok(checkedOrder);
      assert.equal(checkedOrder.shippingCompanyId, "sc-1", "Shipping company cannot alter assigned shippingCompanyId");
    });

    it("rejects unauthorized cross-account mutations with 403 Forbidden", async () => {
      // Rep 1 attempts to cancel Rep 2's order
      const cancelCrossRes = await apiRequest(`/api/orders/${rep2OrderId}/cancel`, {
        method: "PATCH",
        token: rep1Token,
        body: {}
      });
      assert.equal(cancelCrossRes.status, 403, "Rep 1 must not be allowed to cancel Rep 2's order");

      // Rep 1 attempts to edit Rep 2's order
      const editCrossRes = await apiRequest(`/api/orders/${rep2OrderId}/edit`, {
        method: "PATCH",
        token: rep1Token,
        body: { customerName: "هک شده توسط نماینده دیگر" }
      });
      assert.equal(editCrossRes.status, 403, "Rep 1 must not be allowed to edit Rep 2's order");

      // SC 1 attempts to update vehicle on SC 2's order
      const updateVehicleCrossRes = await apiRequest(`/api/orders/${sc2OrderId}/update-vehicle`, {
        method: "PATCH",
        token: sc1Token,
        body: {
          vehicleType: "تریلی",
          driverName: "هکر",
          driverPhone: "09110009988",
          licensePlate: "۹۹ع۹۹۹ایران۹۹"
        }
      });
      assert.equal(updateVehicleCrossRes.status, 403, "SC 1 must not be allowed to update SC 2's order");

      // SC 2 attempts to update vehicle on SC 1's order
      const updateVehicleCrossRes2 = await apiRequest(`/api/orders/${sc1OrderId}/update-vehicle`, {
        method: "PATCH",
        token: sc2Token,
        body: {
          vehicleType: "تریلی",
          driverName: "هکر ۲",
          driverPhone: "09130009988",
          licensePlate: "۸۸ع۸۸۸ایران۸۸"
        }
      });
      assert.equal(updateVehicleCrossRes2.status, 403, "SC 2 must not be allowed to update SC 1's order");
    });

    it("SYSTEM_ADMIN and SALES_MANAGER preserve access to all orders across representatives and shipping companies", async () => {
      // Admin sees Order 1, Order 2, Order 3, Order 4
      const adminOrdersRes = await apiRequest("/api/orders", { token: adminToken });
      assert.equal(adminOrdersRes.status, 200);
      const adminOrderIds = adminOrdersRes.data.map((o: any) => o.id);
      assert.ok(adminOrderIds.includes(rep1OrderId), "Admin sees Rep 1 order");
      assert.ok(adminOrderIds.includes(rep2OrderId), "Admin sees Rep 2 order");
      assert.ok(adminOrderIds.includes(sc1OrderId), "Admin sees SC 1 order");
      assert.ok(adminOrderIds.includes(sc2OrderId), "Admin sees SC 2 order");

      // Admin bootstrap sees all orders
      const adminBootstrapRes = await apiRequest("/api/sync/bootstrap", { token: adminToken });
      assert.equal(adminBootstrapRes.status, 200);
      const adminBootIds = adminBootstrapRes.data.orders.map((o: any) => o.id);
      assert.ok(adminBootIds.includes(rep1OrderId));
      assert.ok(adminBootIds.includes(rep2OrderId));
      assert.ok(adminBootIds.includes(sc1OrderId));
      assert.ok(adminBootIds.includes(sc2OrderId));

      // Sales Manager sees all orders
      const managerOrdersRes = await apiRequest("/api/orders", { token: managerToken });
      assert.equal(managerOrdersRes.status, 200);
      const managerOrderIds = managerOrdersRes.data.map((o: any) => o.id);
      assert.ok(managerOrderIds.includes(rep1OrderId), "Manager sees Rep 1 order");
      assert.ok(managerOrderIds.includes(rep2OrderId), "Manager sees Rep 2 order");
      assert.ok(managerOrderIds.includes(sc1OrderId), "Manager sees SC 1 order");
      assert.ok(managerOrderIds.includes(sc2OrderId), "Manager sees SC 2 order");
    });

    it("guarantees sensitive nested fields are never leaked across accounts", async () => {
      const rep1Res = await apiRequest("/api/orders", { token: rep1Token });
      assert.equal(rep1Res.status, 200);

      // Convert full JSON payload to string to verify complete absence of Rep 2's sensitive fields
      const rep1PayloadString = JSON.stringify(rep1Res.data);
      assert.ok(!rep1PayloadString.includes("TRK-ESFAHAN-6055"), "Rep 1 response must not contain Rep 2 payment tracking code");
      assert.ok(!rep1PayloadString.includes("مجتمع تجاری سی‌وسه‌پل اصفهان"), "Rep 1 response must not contain Rep 2 customer name");
      assert.ok(!rep1PayloadString.includes("09139998877"), "Rep 1 response must not contain Rep 2 customer phone");
      assert.ok(!rep1PayloadString.includes("چهارباغ عباسی"), "Rep 1 response must not contain Rep 2 exact address");

      // Verify SC 1 cannot see SC 2's bill of lading number or driver phone
      const sc1Res = await apiRequest("/api/orders", { token: sc1Token });
      const sc1PayloadString = JSON.stringify(sc1Res.data);
      assert.ok(!sc1PayloadString.includes("BL-SC2-002"), "SC 1 response must not contain SC 2 bill of lading number");
      assert.ok(!sc1PayloadString.includes("09130002233"), "SC 1 response must not contain SC 2 driver phone number");
    });
  });
});
