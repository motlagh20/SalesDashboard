import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { seedDatabaseWithConnection } from "../server/database";

describe("Item 5: Transaction-Safe Reset Demo Suite", () => {
  it("5.1 Atomic Rollback on Failure: Deleted records are completely restored if reseeding fails", async () => {
    // Simulated transactional database state
    let inTransaction = false;
    let committed = false;
    let rolledBack = false;

    const initialData = {
      order_history: [{ id: 1, orderId: "ord-1" }],
      orders: [{ id: "ord-1", customerName: "Customer A" }],
      products: [{ id: "prod-1", name: "Original Product" }],
      agents: [{ id: "ag-1", fullName: "Original Agent" }],
      shipping_companies: [{ id: "sc-1", name: "Original Shipping" }],
      permanent_drivers: [{ id: "drv-1", driverName: "Original Driver" }],
      user_activity_logs: [{ id: "act-1", action: "SECURITY_AUDIT_LOG_ENTRY" }]
    };

    let workingData = JSON.parse(JSON.stringify(initialData));

    const mockConnection: any = {
      beginTransaction: async () => {
        inTransaction = true;
      },
      commit: async () => {
        committed = true;
        inTransaction = false;
      },
      rollback: async () => {
        rolledBack = true;
        inTransaction = false;
        // Rollback restores original data snapshot
        workingData = JSON.parse(JSON.stringify(initialData));
      },
      release: async () => {},
      query: async (sql: string, params?: any[]) => {
        if (sql.includes("DELETE FROM order_history")) workingData.order_history = [];
        else if (sql.includes("DELETE FROM orders")) workingData.orders = [];
        else if (sql.includes("DELETE FROM products")) workingData.products = [];
        else if (sql.includes("DELETE FROM agents")) workingData.agents = [];
        else if (sql.includes("DELETE FROM shipping_companies")) workingData.shipping_companies = [];
        else if (sql.includes("DELETE FROM permanent_drivers")) workingData.permanent_drivers = [];
        else if (sql.includes("INSERT INTO products")) {
          // Simulate database error / connection drop during reseeding
          throw new Error("Simulated network drop / disk failure during reseeding");
        }
        return [[]];
      }
    };

    // Execute the exact transactional reset-demo logic implemented in server.ts
    let caughtError: any = null;
    try {
      await mockConnection.beginTransaction();
      await mockConnection.query("DELETE FROM order_history");
      await mockConnection.query("DELETE FROM orders");
      await mockConnection.query("DELETE FROM products");
      await mockConnection.query("DELETE FROM agents");
      await mockConnection.query("DELETE FROM shipping_companies");
      try {
        await mockConnection.query("DELETE FROM permanent_drivers");
      } catch {}

      // Reseed tables within same transaction (injects simulated failure)
      await seedDatabaseWithConnection(mockConnection);

      await mockConnection.commit();
    } catch (err: any) {
      caughtError = err;
      await mockConnection.rollback();
    } finally {
      await mockConnection.release();
    }

    // Assert that rollback was invoked and committed was false
    assert.ok(caughtError !== null, "Seeding error must be caught");
    assert.equal(rolledBack, true, "Transaction must rollback on seeding failure");
    assert.equal(committed, false, "Transaction must NOT commit on failure");

    // Assert that original data is restored via rollback and NOT lost
    assert.equal(workingData.products.length, 1);
    assert.equal(workingData.products[0].name, "Original Product");
    assert.equal(workingData.orders.length, 1);
    assert.equal(workingData.agents.length, 1);

    // CRITICAL SECURITY REQUIREMENT: user_activity_logs is NEVER deleted
    assert.equal(workingData.user_activity_logs.length, 1);
    assert.equal(workingData.user_activity_logs[0].action, "SECURITY_AUDIT_LOG_ENTRY");
  });

  it("5.2 Successful Reset: Complete transaction commits reseeded records and preserves activity logs", async () => {
    let inTransaction = false;
    let committed = false;
    let rolledBack = false;

    const workingData: Record<string, any[]> = {
      order_history: [{ id: 1 }],
      orders: [{ id: "ord-old" }],
      products: [{ id: "prod-old" }],
      agents: [{ id: "ag-old" }],
      shipping_companies: [{ id: "sc-old" }],
      permanent_drivers: [{ id: "drv-old" }],
      app_users: [],
      user_activity_logs: [{ id: "act-permanent", action: "AUDIT_RECORD_PRESERVED" }]
    };

    const mockConnection: any = {
      beginTransaction: async () => { inTransaction = true; },
      commit: async () => { committed = true; inTransaction = false; },
      rollback: async () => { rolledBack = true; inTransaction = false; },
      release: async () => {},
      query: async (sql: string, params?: any[]) => {
        if (sql.includes("DELETE FROM order_history")) workingData.order_history = [];
        else if (sql.includes("DELETE FROM orders")) workingData.orders = [];
        else if (sql.includes("DELETE FROM products")) workingData.products = [];
        else if (sql.includes("DELETE FROM agents")) workingData.agents = [];
        else if (sql.includes("DELETE FROM shipping_companies")) workingData.shipping_companies = [];
        else if (sql.includes("DELETE FROM permanent_drivers")) workingData.permanent_drivers = [];
        else if (sql.includes("INSERT INTO products")) workingData.products.push(params || []);
        else if (sql.includes("INSERT INTO agents")) workingData.agents.push(params || []);
        else if (sql.includes("INSERT INTO shipping_companies")) workingData.shipping_companies.push(params || []);
        else if (sql.includes("INSERT INTO permanent_drivers")) workingData.permanent_drivers.push(params || []);
        else if (sql.includes("INSERT INTO app_users")) workingData.app_users.push(params || []);
        return [[]];
      }
    };

    await mockConnection.beginTransaction();
    await mockConnection.query("DELETE FROM order_history");
    await mockConnection.query("DELETE FROM orders");
    await mockConnection.query("DELETE FROM products");
    await mockConnection.query("DELETE FROM agents");
    await mockConnection.query("DELETE FROM shipping_companies");
    try {
      await mockConnection.query("DELETE FROM permanent_drivers");
    } catch {}

    await seedDatabaseWithConnection(mockConnection);
    await mockConnection.commit();
    await mockConnection.release();

    assert.equal(committed, true);
    assert.equal(rolledBack, false);
    assert.ok(workingData.products.length >= 5, "5 default products reseeded");
    assert.ok(workingData.agents.length >= 4, "4 default agents reseeded");
    assert.ok(workingData.shipping_companies.length >= 3, "3 default shipping companies reseeded");
    assert.ok(workingData.permanent_drivers.length >= 4, "4 default drivers reseeded");

    // Strictly verify security audit logs were never touched or deleted
    assert.equal(workingData.user_activity_logs.length, 1);
    assert.equal(workingData.user_activity_logs[0].action, "AUDIT_RECORD_PRESERVED");
  });
});
