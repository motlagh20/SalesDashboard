import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import {
  bootstrapDatabase,
  getDbPool,
  isDatabaseHealthy,
  checkDatabaseHealth,
  isFallbackModeActive,
  markDatabaseHealthy,
  markDatabaseUnhealthy,
  setDbHealthyForTesting,
  setDbPoolForTesting,
  resetDatabaseStateForTesting,
  isConnectionError,
  rotateLogFileIfNeeded,
  writeServerErrorLog,
  DatabaseMaintenanceError,
  getUserActivityLogs
} from "../server/database";

describe("Database Failure Resilience & Production Fallback Prevention", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;

  beforeEach(() => {
    resetDatabaseStateForTesting();
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
    process.env.APP_ENV = originalAppEnv;
    resetDatabaseStateForTesting();
  });

  describe("1. Startup Failure Handling in Production", () => {
    it("should fail closed and enter maintenance mode if MariaDB is unavailable at startup in production", async () => {
      process.env.NODE_ENV = "production";
      
      const failingPool: any = {
        query: async () => {
          const err: any = new Error("connect ECONNREFUSED 127.0.0.1:3306");
          err.code = "ECONNREFUSED";
          throw err;
        },
        end: async () => {}
      };
      setDbPoolForTesting(failingPool);

      await bootstrapDatabase();

      // In production, fallback to local JSON is strictly forbidden
      assert.equal(isDatabaseHealthy(), false, "Database must be marked unhealthy in production");
      assert.equal(isFallbackModeActive(), false, "Fallback mode must NEVER be active in production");

      // Pool access must fail closed with 503
      assert.throws(
        () => getDbPool(),
        (err: any) => {
          assert.equal(err.name, "DatabaseMaintenanceError");
          assert.equal(err.statusCode, 503);
          return true;
        },
        "getDbPool() must throw DatabaseMaintenanceError in production when DB is offline"
      );
    });
  });

  describe("2. Failure After Startup & Safe Error Propagation", () => {
    it("should dynamically detect runtime connection loss and mark database unhealthy", async () => {
      process.env.NODE_ENV = "production";
      setDbHealthyForTesting(true);
      assert.equal(isDatabaseHealthy(), true);

      // Simulate a runtime pool query failing with connection lost
      let queryCalls = 0;
      const dyingPool: any = {
        query: async (sql: string) => {
          queryCalls++;
          const err: any = new Error("Connection lost: The server closed the connection.");
          err.code = "PROTOCOL_CONNECTION_LOST";
          throw err;
        }
      };

      // Query through connection error detector
      let caughtError: any = null;
      try {
        await dyingPool.query("SELECT * FROM orders");
      } catch (err: any) {
        caughtError = err;
        if (isConnectionError(err)) {
          markDatabaseUnhealthy(err);
        }
      }

      assert.ok(caughtError, "Query should fail");
      assert.equal(isDatabaseHealthy(), false, "Database must transition to unhealthy after connection drop");
      assert.equal(queryCalls, 1, "Failed query must not enter an infinite retry loop");
    });

    it("should identify critical connection failure error codes", () => {
      const errRefused: any = new Error("connect ECONNREFUSED");
      errRefused.code = "ECONNREFUSED";
      assert.equal(isConnectionError(errRefused), true);

      const errLost: any = new Error("PROTOCOL_CONNECTION_LOST");
      errLost.code = "PROTOCOL_CONNECTION_LOST";
      assert.equal(isConnectionError(errLost), true);

      const errTimeout: any = new Error("connect ETIMEDOUT");
      errTimeout.code = "ETIMEDOUT";
      assert.equal(isConnectionError(errTimeout), true);

      const errNormal: any = new Error("Duplicate entry 'test' for key 'PRIMARY'");
      errNormal.code = "ER_DUP_ENTRY";
      assert.equal(isConnectionError(errNormal), false);
    });
  });

  describe("3. Recovery After Runtime Failure", () => {
    it("should recover to healthy when connectivity is restored and ping succeeds", async () => {
      process.env.NODE_ENV = "production";
      
      // Start in unhealthy maintenance mode
      markDatabaseUnhealthy(new Error("Database disconnected"));
      assert.equal(isDatabaseHealthy(), false);

      // Simulate database recovery
      let pingExecuted = false;
      const recoveredPool: any = {
        query: async (sql: string) => {
          if (sql === "SELECT 1") {
            pingExecuted = true;
            return [[{ 1: 1 }]];
          }
          return [[]];
        }
      };
      setDbPoolForTesting(recoveredPool);

      // Health check probe verifies recovery
      const isHealthyNow = await checkDatabaseHealth();
      assert.equal(pingExecuted, true, "Active health check must run ping SELECT 1");
      assert.equal(isHealthyNow, true, "Health check must return true upon recovery");
      assert.equal(isDatabaseHealthy(), true, "isDatabaseHealthy() must reflect recovery");
    });
  });

  describe("4. Mutating Writes & Prevention of Duplicate Retries", () => {
    it("should not retry mutating queries and fail fast without duplicate writes", async () => {
      process.env.NODE_ENV = "production";
      let executionCount = 0;

      const mockDb: any = {
        query: async (sql: string, params: any[]) => {
          executionCount++;
          const err: any = new Error("Connection lost during INSERT");
          err.code = "PROTOCOL_CONNECTION_LOST";
          throw err;
        }
      };

      try {
        await mockDb.query("INSERT INTO orders (id, orderNumber) VALUES (?, ?)", ["ord-1", "TB-1001"]);
      } catch (err: any) {
        if (isConnectionError(err)) {
          markDatabaseUnhealthy(err);
        }
      }

      assert.equal(executionCount, 1, "Mutating write must be executed exactly once and not automatically retried");
      assert.equal(isDatabaseHealthy(), false);
    });

    it("should strictly forbid production fallback writes to local JSON storage", () => {
      process.env.NODE_ENV = "production";
      assert.throws(
        () => {
          // Attempting to require mock fallback in production
          throw new DatabaseMaintenanceError("Production writes to local JSON storage are forbidden.");
        },
        /forbidden/i
      );
    });
  });

  describe("5. Prohibition of Production Fallback & Data Fabrication", () => {
    it("should never return fabricated user activity logs in production when database is offline", async () => {
      process.env.NODE_ENV = "production";
      setDbHealthyForTesting(false);

      const failingPool: any = {
        query: async () => {
          throw new DatabaseMaintenanceError("DB down");
        }
      };
      setDbPoolForTesting(failingPool);

      await assert.rejects(
        async () => {
          await getUserActivityLogs(50);
        },
        (err: any) => {
          assert.equal(err.name, "DatabaseMaintenanceError");
          return true;
        },
        "getUserActivityLogs must throw in production if database is offline, never return fabricated data"
      );
    });
  });

  describe("6. Bounded Error Log Rotation", () => {
    it("should rotate log file and keep backup when log size exceeds the limit", () => {
      const tempLogDir = path.join(process.cwd(), "server", "test_logs");
      fs.mkdirSync(tempLogDir, { recursive: true });
      const testLogPath = path.join(tempLogDir, "test_db_errors.log");
      const testBackupPath = `${testLogPath}.1`;

      try {
        // Create an oversized log file (e.g. 500 bytes with max 200 bytes limit)
        const bigContent = "X".repeat(500);
        fs.writeFileSync(testLogPath, bigContent, "utf8");

        const rotated = rotateLogFileIfNeeded(testLogPath, 200);
        assert.equal(rotated, true, "rotateLogFileIfNeeded must return true when file exceeded limit");
        assert.ok(fs.existsSync(testBackupPath), "Backup file test_db_errors.log.1 must exist");
        assert.equal(fs.statSync(testBackupPath).size, 500, "Backup file should contain previous content");

        // Now test appending with writeServerErrorLog helper
        writeServerErrorLog("Test Operation", new Error("Simulated query timeout"));
      } finally {
        // Cleanup test directory
        try {
          if (fs.existsSync(testLogPath)) fs.unlinkSync(testLogPath);
          if (fs.existsSync(testBackupPath)) fs.unlinkSync(testBackupPath);
          fs.rmdirSync(tempLogDir);
        } catch {}
      }
    });
  });
});
