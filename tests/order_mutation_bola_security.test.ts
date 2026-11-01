import { describe, it, before } from "node:test";
import assert from "node:assert/strict";
import { generateToken, checkOrderOwnership } from "../server/auth";

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

describe("Order Mutation Broken Object-Level Authorization (BOLA/IDOR) Security Tests", () => {
  // ==========================================
  // SECTION 1: UNIT TESTS FOR checkOrderOwnership
  // ==========================================
  describe("1. checkOrderOwnership Unit Authorization Logic", () => {
    it("rejects unauthenticated caller with 401", () => {
      const check = checkOrderOwnership({ agentCode: "AG-100", shippingCompanyId: "sc-1" }, undefined);
      assert.equal(check.allowed, false);
      assert.equal(check.status, 401);
    });

    it("returns 404 for non-existent order without disclosing details", () => {
      const user = { id: "usr-1", username: "rep1", role: "REPRESENTATIVE", agentCode: "AG-100" };
      const check = checkOrderOwnership(null, user);
      assert.equal(check.allowed, false);
      assert.equal(check.status, 404);
      assert.ok(check.message.includes("یافت نشد"));
    });

    it("allows SYSTEM_ADMIN and SALES_MANAGER full access to any existing order", () => {
      const admin = { id: "usr-admin", username: "admin", role: "SYSTEM_ADMIN" };
      const manager = { id: "usr-mgr", username: "manager", role: "SALES_MANAGER" };
      const order = { agentCode: "AG-999", shippingCompanyId: "sc-999" };

      assert.equal(checkOrderOwnership(order, admin).allowed, true);
      assert.equal(checkOrderOwnership(order, admin).status, 200);

      assert.equal(checkOrderOwnership(order, manager).allowed, true);
      assert.equal(checkOrderOwnership(order, manager).status, 200);
    });

    it("strictly isolates REPRESENTATIVE by agentCode (case-insensitive and trimmed)", () => {
      const rep = { id: "usr-rep", username: "rep_tehran", role: "REPRESENTATIVE", agentCode: "AG-9081" };
      const ownOrder = { agentCode: "ag-9081 ", shippingCompanyId: null };
      const foreignOrder = { agentCode: "AG-6055", shippingCompanyId: null };
      const unassignedOrder = { agentCode: null, shippingCompanyId: null };

      // Own order -> allowed
      assert.equal(checkOrderOwnership(ownOrder, rep).allowed, true);

      // Foreign order -> forbidden 403
      const foreignCheck = checkOrderOwnership(foreignOrder, rep);
      assert.equal(foreignCheck.allowed, false);
      assert.equal(foreignCheck.status, 403);
      assert.ok(!foreignCheck.message.includes("AG-6055")); // No sensitive data disclosure

      // Unassigned order -> forbidden 403
      assert.equal(checkOrderOwnership(unassignedOrder, rep).allowed, false);
      assert.equal(checkOrderOwnership(unassignedOrder, rep).status, 403);
    });

    it("strictly isolates SHIPPING_COMPANY by shippingCompanyId (case-insensitive and trimmed)", () => {
      const scUser = { id: "usr-sc", username: "sc1", role: "SHIPPING_COMPANY", shippingCompanyId: "sc-1" };
      const ownOrder = { agentCode: "AG-100", shippingCompanyId: "SC-1 " };
      const foreignOrder = { agentCode: "AG-100", shippingCompanyId: "sc-2" };
      const unassignedOrder = { agentCode: "AG-100", shippingCompanyId: null };

      // Own order -> allowed
      assert.equal(checkOrderOwnership(ownOrder, scUser).allowed, true);

      // Foreign order -> forbidden 403
      const foreignCheck = checkOrderOwnership(foreignOrder, scUser);
      assert.equal(foreignCheck.allowed, false);
      assert.equal(foreignCheck.status, 403);
      assert.ok(!foreignCheck.message.includes("sc-2")); // No sensitive data disclosure

      // Unassigned order -> forbidden 403
      assert.equal(checkOrderOwnership(unassignedOrder, scUser).allowed, false);
      assert.equal(checkOrderOwnership(unassignedOrder, scUser).status, 403);
    });

    it("allows plant operational roles (FACTORY_TRANSPORT, PRODUCT_WAREHOUSE, SECURITY_GATE) for operational tasks", () => {
      const order = { agentCode: "AG-100", shippingCompanyId: "sc-1" };
      for (const role of ["FACTORY_TRANSPORT", "PRODUCT_WAREHOUSE", "SECURITY_GATE"]) {
        const opUser = { id: `usr-${role}`, username: `op_${role}`, role };
        const check = checkOrderOwnership(order, opUser);
        assert.equal(check.allowed, true);
        assert.equal(check.status, 200);
      }
    });
  });

  // ==========================================
  // SECTION 2: END-TO-END MUTATION ENDPOINT AUDIT
  // ==========================================
  describe("2. End-to-End API Mutation Authorization & BOLA Defenses", () => {
    // Representative 1: Tehran (AG-9081)
    const rep1Token = generateToken({ id: "usr-2", username: "rep_tehran", role: "REPRESENTATIVE" });
    // Representative 2: Esfahan (AG-6055)
    const rep2Token = generateToken({ id: "usr-3", username: "rep_esfahan", role: "REPRESENTATIVE" });

    // Shipping Company 1: Transit Tabarestan (sc-1)
    const sc1Token = generateToken({ id: "usr-7", username: "shipping_transit", role: "SHIPPING_COMPANY" });
    // Shipping Company 2: Zayandeh Rood (sc-2)
    const sc2Token = generateToken({ id: "usr-72", username: "shipping_zayandeh", role: "SHIPPING_COMPANY" });

    // Operational roles:
    const transportToken = generateToken({ id: "usr-6", username: "factory", role: "FACTORY_TRANSPORT" });
    const warehouseToken = generateToken({ id: "usr-8", username: "warehouse", role: "PRODUCT_WAREHOUSE" });
    const securityToken = generateToken({ id: "usr-9", username: "security_gate", role: "SECURITY_GATE" });

    // Management roles:
    const managerToken = generateToken({ id: "usr-1", username: "manager", role: "SALES_MANAGER" });
    const adminToken = generateToken({ id: "usr-0", username: "admin", role: "SYSTEM_ADMIN" });

    let rep1OrderId: string;
    let rep2OrderId: string;
    let sc1OrderId: string;

    before(async () => {
      // 1. Create Rep 1 Order (AG-9081)
      const res1 = await apiRequest("/api/orders", {
        method: "POST",
        token: rep1Token,
        body: {
          customerName: "فروشگاه کاشی و سرامیک شمال",
          phoneNumber: "09121112233",
          destinationCity: "تهران",
          exactAddress: "بزرگراه صدر، خیابان اختیاریه شمالی، پلاک ۱۲",
          quantity: 200,
          unit: "متر مربع",
          paymentTrackingCode: "TRK-TEH-101",
          notes: "سفارش ثبت شده توسط نماینده تهران"
        }
      });
      assert.equal(res1.status, 201);
      rep1OrderId = res1.data.id;

      // 2. Create Rep 2 Order (AG-6055)
      const res2 = await apiRequest("/api/orders", {
        method: "POST",
        token: rep2Token,
        body: {
          customerName: "پروژه ساختمانی نقش جهان",
          phoneNumber: "09139998877",
          destinationCity: "اصفهان",
          exactAddress: "میدان نقش جهان، ابتدای خیابان حافظ",
          quantity: 350,
          unit: "متر مربع",
          paymentTrackingCode: "TRK-ESF-202",
          notes: "سفارش ثبت شده توسط نماینده اصفهان"
        }
      });
      assert.equal(res2.status, 201);
      rep2OrderId = res2.data.id;

      // 3. Create Order assigned to Shipping Company 1 (sc-1)
      const res3 = await apiRequest("/api/orders", {
        method: "POST",
        token: managerToken,
        body: {
          customerName: "انبار مرکزی توزیع ترانزیت",
          phoneNumber: "09115554433",
          destinationCity: "ساری",
          exactAddress: "کیلومتر ۵ جاده فیروزکوه",
          quantity: 600,
          unit: "متر مربع",
          agentCode: "AG-0000"
        }
      });
      assert.equal(res3.status, 201);
      sc1OrderId = res3.data.id;

      // Assign to SC 1
      const assignRes = await apiRequest(`/api/orders/${sc1OrderId}/assign-vehicle`, {
        method: "PATCH",
        token: managerToken,
        body: {
          vehicleType: "تریلی ۱۸ چرخ لبه‌دار",
          driverName: "علیرضا عباسی",
          driverPhone: "09112223344",
          licensePlate: "12ب345-ایران72",
          shippingAgency: "باربری ترانزیت طبرستان",
          shippingCompanyId: "sc-1"
        }
      });
      assert.equal(assignRes.status, 200);
    });

    // ------------------------------------------
    // Endpoint 1: PATCH /api/orders/:id/location
    // ------------------------------------------
    describe("PATCH /api/orders/:id/location", () => {
      it("allows authorized representative to update location of own order", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/location`, {
          method: "PATCH",
          token: rep1Token,
          body: { deliveryLocationUrl: "https://maps.google.com/?q=35.7890,51.4560" }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
      });

      it("rejects cross-representative attempt to update location with 403 Forbidden", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/location`, {
          method: "PATCH",
          token: rep2Token, // Rep 2 attacking Rep 1's order
          body: { deliveryLocationUrl: "https://maps.google.com/?q=hacked_location" }
        });
        assert.equal(res.status, 403);
        assert.ok(!JSON.stringify(res.data).includes("فروشگاه کاشی")); // No order leakage
      });

      it("resists parameter tampering: spoofed agentCode in body is ignored", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/location`, {
          method: "PATCH",
          token: rep2Token,
          body: {
            deliveryLocationUrl: "https://maps.google.com/?q=spoofed",
            agentCode: "AG-9081" // Tampered body
          }
        });
        assert.equal(res.status, 403);
      });

      it("returns 404 Not Found for non-existent order ID", async () => {
        const res = await apiRequest("/api/orders/ord-non-existent-99999/location", {
          method: "PATCH",
          token: rep1Token,
          body: { deliveryLocationUrl: "https://maps.google.com/?q=valid" }
        });
        assert.equal(res.status, 404);
      });

      it("allows SALES_MANAGER to update location", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/location`, {
          method: "PATCH",
          token: managerToken,
          body: { deliveryLocationUrl: "https://maps.google.com/?q=manager_updated" }
        });
        assert.equal(res.status, 200);
      });
    });

    // ------------------------------------------
    // Endpoint 2: PATCH /api/orders/:id/cancel
    // ------------------------------------------
    describe("PATCH /api/orders/:id/cancel", () => {
      it("rejects cross-representative attempt to cancel another rep's order with 403", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/cancel`, {
          method: "PATCH",
          token: rep2Token // Rep 2 attacking Rep 1
        });
        assert.equal(res.status, 403);
      });

      it("returns 404 for non-existent order ID", async () => {
        const res = await apiRequest("/api/orders/ord-fake-cancel-id/cancel", {
          method: "PATCH",
          token: rep1Token
        });
        assert.equal(res.status, 404);
      });

      it("allows authorized representative to cancel their own order", async () => {
        const res = await apiRequest(`/api/orders/${rep2OrderId}/cancel`, {
          method: "PATCH",
          token: rep2Token
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
      });
    });

    // ------------------------------------------
    // Endpoint 3: PATCH /api/orders/:id/payment-tracking
    // ------------------------------------------
    describe("PATCH /api/orders/:id/payment-tracking", () => {
      it("allows authorized representative to update payment tracking code on own order", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/payment-tracking`, {
          method: "PATCH",
          token: rep1Token,
          body: { paymentTrackingCode: "TRK-TEH-UPDATED-999" }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
      });

      it("rejects cross-representative attempt to update payment tracking with 403", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/payment-tracking`, {
          method: "PATCH",
          token: rep2Token,
          body: { paymentTrackingCode: "TRK-ATTACKER-CODE" }
        });
        assert.equal(res.status, 403);
      });

      it("returns 404 for non-existent order ID", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-tracking/payment-tracking", {
          method: "PATCH",
          token: rep1Token,
          body: { paymentTrackingCode: "TRK-TEST" }
        });
        assert.equal(res.status, 404);
      });
    });

    // ------------------------------------------
    // Endpoint 4: PATCH /api/orders/:id/payment-receipt
    // ------------------------------------------
    describe("PATCH /api/orders/:id/payment-receipt", () => {
      it("allows authorized representative to attach payment receipt on own order", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/payment-receipt`, {
          method: "PATCH",
          token: rep1Token,
          body: {
            paymentReceiptUrl: "/uploads/receipt-rep1.jpg",
            paymentReceiptName: "receipt-rep1.jpg",
            paymentTrackingCode: "TRK-TEH-RECEIPT"
          }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
      });

      it("rejects cross-representative attempt to attach payment receipt with 403", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/payment-receipt`, {
          method: "PATCH",
          token: rep2Token,
          body: {
            paymentReceiptUrl: "/uploads/malicious-receipt.jpg",
            paymentReceiptName: "malicious.jpg"
          }
        });
        assert.equal(res.status, 403);
      });

      it("returns 404 for non-existent order ID", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-receipt/payment-receipt", {
          method: "PATCH",
          token: rep1Token,
          body: {
            paymentReceiptUrl: "/uploads/test.jpg"
          }
        });
        assert.equal(res.status, 404);
      });
    });

    // ------------------------------------------
    // Endpoint 5: PATCH /api/orders/:id/edit
    // ------------------------------------------
    describe("PATCH /api/orders/:id/edit", () => {
      it("allows authorized representative to request edit on own order", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/edit`, {
          method: "PATCH",
          token: rep1Token,
          body: {
            customerName: "فروشگاه کاشی و سرامیک شمال (اصلاح نام)",
            destinationCity: "تهران",
            notes: "یادداشت اصلاحیه توسط نماینده تهران"
          }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
      });

      it("rejects cross-representative attempt to submit edit with 403", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/edit`, {
          method: "PATCH",
          token: rep2Token,
          body: {
            customerName: "تغییر مالکیت به نماینده اصفهان",
            notes: "تلاش غیرمجاز برای تغییر سفارش"
          }
        });
        assert.equal(res.status, 403);
      });

      it("returns 404 for non-existent order ID", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-edit/edit", {
          method: "PATCH",
          token: rep1Token,
          body: { notes: "اصلاحیه" }
        });
        assert.equal(res.status, 404);
      });
    });

    // ------------------------------------------
    // Endpoint 6: PATCH /api/orders/:id/dismiss-edit-notice
    // ------------------------------------------
    describe("PATCH /api/orders/:id/dismiss-edit-notice", () => {
      it("allows authorized representative to dismiss edit notice on own order", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/dismiss-edit-notice`, {
          method: "PATCH",
          token: rep1Token
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
      });

      it("rejects cross-representative attempt to dismiss edit notice with 403", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/dismiss-edit-notice`, {
          method: "PATCH",
          token: rep2Token
        });
        assert.equal(res.status, 403);
      });

      it("returns 404 for non-existent order ID", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-dismiss/dismiss-edit-notice", {
          method: "PATCH",
          token: rep1Token
        });
        assert.equal(res.status, 404);
      });
    });

    // ------------------------------------------
    // Endpoint 7: PATCH /api/orders/:id/update-vehicle & assign-vehicle
    // ------------------------------------------
    describe("PATCH /api/orders/:id/update-vehicle & assign-vehicle (Fleet Isolation)", () => {
      it("allows assigned shipping company (SC 1) to update vehicle details on own order", async () => {
        const res = await apiRequest(`/api/orders/${sc1OrderId}/update-vehicle`, {
          method: "PATCH",
          token: sc1Token,
          body: {
            vehicleType: "تریلی کفی ۱۸ چرخ",
            driverName: "محمد کریمی",
            driverPhone: "09117778899",
            licensePlate: "56ج789-ایران72",
            shippingAgency: "باربری ترانزیت طبرستان",
            billOfLadingNumber: "BL-TRANSIT-888"
          }
        });
        assert.equal(res.status, 200);
        assert.equal(res.data.success, true);
      });

      it("rejects cross-shipping-company attempt (SC 2 attacking SC 1 order) with 403 Forbidden", async () => {
        const res = await apiRequest(`/api/orders/${sc1OrderId}/update-vehicle`, {
          method: "PATCH",
          token: sc2Token, // SC 2 attacking SC 1 order
          body: {
            vehicleType: "خاور مسقف",
            driverName: "راننده نفوذی",
            driverPhone: "09130001122",
            licensePlate: "99الف111-ایران13"
          }
        });
        assert.equal(res.status, 403);
      });

      it("resists parameter tampering: SC 2 sending shippingCompanyId: 'sc-1' is still rejected with 403", async () => {
        const res = await apiRequest(`/api/orders/${sc1OrderId}/update-vehicle`, {
          method: "PATCH",
          token: sc2Token,
          body: {
            vehicleType: "کامیون تک ۱۰ تن",
            driverName: "تست جعل هویت",
            driverPhone: "09139990000",
            licensePlate: "33ب444-ایران13",
            shippingCompanyId: "sc-1" // Tampered identifier
          }
        });
        assert.equal(res.status, 403);
      });

      it("rejects representative role from updating vehicle (unauthorized role) with 403", async () => {
        const res = await apiRequest(`/api/orders/${sc1OrderId}/update-vehicle`, {
          method: "PATCH",
          token: rep1Token,
          body: {
            vehicleType: "نیسان وانت",
            driverName: "تست",
            driverPhone: "09121110000",
            licensePlate: "11د222-ایران11"
          }
        });
        assert.equal(res.status, 403);
      });

      it("returns 404 for non-existent order ID in update-vehicle", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-vehicle/update-vehicle", {
          method: "PATCH",
          token: sc1Token,
          body: {
            vehicleType: "تریلی",
            driverName: "راننده تست",
            driverPhone: "09110000000",
            licensePlate: "11ب111-ایران72"
          }
        });
        assert.equal(res.status, 404);
      });

      it("allows FACTORY_TRANSPORT and SALES_MANAGER to update vehicle on any order", async () => {
        const transportRes = await apiRequest(`/api/orders/${sc1OrderId}/update-vehicle`, {
          method: "PATCH",
          token: transportToken,
          body: {
            vehicleType: "تریلی ۱۸ چرخ چادری",
            driverName: "امیرحسین رضایی",
            driverPhone: "09113334455",
            licensePlate: "88ط999-ایران72"
          }
        });
        assert.equal(transportRes.status, 200);

        const managerRes = await apiRequest(`/api/orders/${sc1OrderId}/update-vehicle`, {
          method: "PATCH",
          token: managerToken,
          body: {
            vehicleType: "تریلی ۱۸ چرخ لبه‌دار",
            driverName: "حسین حسینی",
            driverPhone: "09114445566",
            licensePlate: "77ص888-ایران72"
          }
        });
        assert.equal(managerRes.status, 200);
      });

      it("rejects cross-shipping-company attempt on assign-vehicle with 403", async () => {
        const res = await apiRequest(`/api/orders/${sc1OrderId}/assign-vehicle`, {
          method: "PATCH",
          token: sc2Token,
          body: {
            vehicleType: "کامیون جفت",
            driverName: "راننده متفرقه",
            driverPhone: "09137778899",
            licensePlate: "12ج345-ایران13"
          }
        });
        assert.equal(res.status, 403);
      });

      it("returns 404 for non-existent order ID in assign-vehicle", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-assign/assign-vehicle", {
          method: "PATCH",
          token: sc1Token,
          body: {
            vehicleType: "تریلی",
            driverName: "راننده",
            driverPhone: "09112223344",
            licensePlate: "11ب222-ایران72"
          }
        });
        assert.equal(res.status, 404);
      });
    });

    // ------------------------------------------
    // Endpoint 8: Operational Plant Mutation Endpoints (404 and Authorization Checks)
    // ------------------------------------------
    describe("Warehouse & Security Gate Mutation Endpoints Audit", () => {
      it("returns 404 for non-existent order ID on warehouse-discrepancy", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-discrepancy/warehouse-discrepancy", {
          method: "PATCH",
          token: warehouseToken,
          body: { reason: "تست مغایرت" }
        });
        assert.equal(res.status, 404);
      });

      it("returns 404 for non-existent order ID on warehouse-load", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-whload/warehouse-load", {
          method: "PATCH",
          token: warehouseToken,
          body: { loadedPalletsCount: 10 }
        });
        assert.equal(res.status, 404);
      });

      it("returns 404 for non-existent order ID on security-detain", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-detain/security-detain", {
          method: "PATCH",
          token: securityToken,
          body: { reason: "تست توقیف" }
        });
        assert.equal(res.status, 404);
      });

      it("returns 404 for non-existent order ID on security-clearance", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-clearance/security-clearance", {
          method: "PATCH",
          token: securityToken,
          body: { gatePassNumber: "GP-999" }
        });
        assert.equal(res.status, 404);
      });

      it("returns 404 for non-existent order ID on dispatch", async () => {
        const res = await apiRequest("/api/orders/ord-ghost-dispatch/dispatch", {
          method: "PATCH",
          token: transportToken
        });
        assert.equal(res.status, 404);
      });

      it("rejects unauthorized role (REPRESENTATIVE) from calling warehouse-load with 403", async () => {
        const res = await apiRequest(`/api/orders/${rep1OrderId}/warehouse-load`, {
          method: "PATCH",
          token: rep1Token,
          body: { loadedPalletsCount: 5 }
        });
        assert.equal(res.status, 403);
      });

      it("rejects unauthorized role (SHIPPING_COMPANY) from calling security-clearance with 403", async () => {
        const res = await apiRequest(`/api/orders/${sc1OrderId}/security-clearance`, {
          method: "PATCH",
          token: sc1Token,
          body: { gatePassNumber: "GP-123" }
        });
        assert.equal(res.status, 403);
      });
    });
  });
});
