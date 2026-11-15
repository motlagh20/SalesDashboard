import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import mysql from "mysql2/promise";
import {
  bootstrapDatabase,
  seedDatabaseIfEmpty,
  seedDatabaseWithConnection,
  setDbPoolForTesting,
  resetDatabaseStateForTesting,
  isDatabaseHealthy,
  isFallbackModeActive
} from "../server/database";

interface ColumnDef {
  name: string;
  notNull: boolean;
  hasDefault: boolean;
  isPrimaryKey: boolean;
  isUnique: boolean;
  autoIncrement: boolean;
}

interface TableState {
  columns: Map<string, ColumnDef>;
  rows: Record<string, any>[];
}

/**
 * Strict in-memory MariaDB DDL + DML contract simulator.
 * Parses real CREATE TABLE / ALTER TABLE statements emitted by bootstrapDatabase()
 * and validates every INSERT column name, NOT NULL constraint, PRIMARY/UNIQUE constraint,
 * ON DUPLICATE KEY UPDATE id = id behavior, and transaction rollback atomicity.
 */
function createStrictMariaDbSimulatorPool(options?: { failOnSqlRegex?: RegExp; failErrorCode?: string }) {
  const tables = new Map<string, TableState>();
  const indexes = new Map<string, Set<string>>();
  let inTransaction = false;
  let snapshot: Map<string, TableState> | null = null;

  const cloneTables = (src: Map<string, TableState>): Map<string, TableState> => {
    const copy = new Map<string, TableState>();
    for (const [tName, tState] of src.entries()) {
      copy.set(tName, {
        columns: new Map(tState.columns),
        rows: tState.rows.map((r) => ({ ...r }))
      });
    }
    return copy;
  };

  const parseColumnDefLine = (line: string): ColumnDef | null => {
    const clean = line.trim().replace(/,$/, "");
    if (!clean) return null;
    if (/^(?:PRIMARY\s+KEY|UNIQUE|KEY|INDEX|CONSTRAINT|FOREIGN\s+KEY)\b/i.test(clean)) {
      return null;
    }
    const match = clean.match(/^`?([A-Za-z_][A-Za-z0-9_]*)`?\s+(.+)$/);
    if (!match) return null;
    const name = match[1];
    const rest = match[2];
    const isPrimaryKey = /\bPRIMARY\s+KEY\b/i.test(rest);
    const isUnique = /\bUNIQUE\b/i.test(rest);
    const autoIncrement = /\bAUTO_INCREMENT\b/i.test(rest);
    const notNull = isPrimaryKey || /\bNOT\s+NULL\b/i.test(rest);
    const hasDefault = /\bDEFAULT\b/i.test(rest) || autoIncrement || !notNull;
    return { name, notNull, hasDefault, isPrimaryKey, isUnique, autoIncrement };
  };

  const runQuery = async (sql: string, params: any[] = []): Promise<any> => {
    const cleanSql = sql.trim();

    if (options?.failOnSqlRegex && options.failOnSqlRegex.test(cleanSql)) {
      const err: any = new Error(`Simulated SQL failure matching ${options.failOnSqlRegex}: ${cleanSql.slice(0, 80)}`);
      err.code = options.failErrorCode || "ER_BAD_FIELD_ERROR";
      err.errno = 1054;
      throw err;
    }

    if (/^SELECT\s+1$/i.test(cleanSql)) {
      return [[{ 1: 1 }], []];
    }

    const createMatch = cleanSql.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?`?([A-Za-z_][A-Za-z0-9_]*)`?\s*\(([\s\S]+)\)\s*(?:ENGINE=[\s\S]*)?;?$/i);
    if (createMatch) {
      const tableName = createMatch[1];
      const body = createMatch[2];
      if (!tables.has(tableName)) {
        const columns = new Map<string, ColumnDef>();
        const lines = body.split(/\r?\n/);
        for (const line of lines) {
          const col = parseColumnDefLine(line);
          if (col) columns.set(col.name, col);
        }
        tables.set(tableName, { columns, rows: [] });
        indexes.set(tableName, new Set());
      }
      return [{ affectedRows: 0 }, []];
    }

    const showColsMatch = cleanSql.match(/^SHOW\s+COLUMNS\s+FROM\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s+LIKE\s+\?$/i);
    if (showColsMatch) {
      const table = tables.get(showColsMatch[1]);
      if (!table) {
        const err: any = new Error(`Table '${showColsMatch[1]}' doesn't exist`);
        err.code = "ER_NO_SUCH_TABLE";
        throw err;
      }
      const colName = String(params[0] || "");
      return [table.columns.has(colName) ? [{ Field: colName }] : [], []];
    }

    const addColMatch = cleanSql.match(/^ALTER\s+TABLE\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s+ADD\s+COLUMN\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s+([\s\S]+)$/i);
    if (addColMatch) {
      const table = tables.get(addColMatch[1]);
      if (!table) {
        const err: any = new Error(`Table '${addColMatch[1]}' doesn't exist`);
        err.code = "ER_NO_SUCH_TABLE";
        throw err;
      }
      const parsed = parseColumnDefLine(`${addColMatch[2]} ${addColMatch[3]}`);
      if (parsed) {
        table.columns.set(parsed.name, parsed);
      }
      return [{ affectedRows: 0 }, []];
    }

    const modifyColMatch = cleanSql.match(/^ALTER\s+TABLE\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s+MODIFY\s+COLUMN\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s+([\s\S]+)$/i);
    if (modifyColMatch) {
      const table = tables.get(modifyColMatch[1]);
      if (!table || !table.columns.has(modifyColMatch[2])) {
        const err: any = new Error(`Unknown column '${modifyColMatch[2]}' in '${modifyColMatch[1]}'`);
        err.code = "ER_BAD_FIELD_ERROR";
        throw err;
      }
      return [{ affectedRows: 0 }, []];
    }

    const showIdxMatch = cleanSql.match(/^SHOW\s+INDEX\s+FROM\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s+WHERE\s+Key_name\s*=\s*\?$/i);
    if (showIdxMatch) {
      const idxSet = indexes.get(showIdxMatch[1]) || new Set();
      const idxName = String(params[0] || "");
      return [idxSet.has(idxName) ? [{ Key_name: idxName }] : [], []];
    }

    const createIdxMatch = cleanSql.match(/^CREATE\s+INDEX\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s+ON\s+`?([A-Za-z_][A-Za-z0-9_]*)`?/i);
    if (createIdxMatch) {
      const idxSet = indexes.get(createIdxMatch[2]) || new Set();
      idxSet.add(createIdxMatch[1]);
      indexes.set(createIdxMatch[2], idxSet);
      return [{ affectedRows: 0 }, []];
    }

    const countMatch = cleanSql.match(/^SELECT\s+COUNT\(\*\)\s+as\s+count\s+FROM\s+`?([A-Za-z_][A-Za-z0-9_]*)`?(?:\s+WHERE\s+([\s\S]+))?;?$/i);
    if (countMatch) {
      const table = tables.get(countMatch[1]);
      if (!table) {
        const err: any = new Error(`Table '${countMatch[1]}' doesn't exist`);
        err.code = "ER_NO_SUCH_TABLE";
        throw err;
      }
      const whereClause = countMatch[2];
      if (!whereClause) {
        return [[{ count: table.rows.length }], []];
      }
      const orParts = whereClause.split(/\s+OR\s+/i).map((p) => p.trim());
      const matched = table.rows.filter((row) =>
        orParts.some((part) => {
          const m = part.match(/^`?([A-Za-z_][A-Za-z0-9_]*)`?\s*=\s*'([^']*)'$/i);
          if (!m) return false;
          return row[m[1]] === m[2];
        })
      );
      return [[{ count: matched.length }], []];
    }

    if (/^SELECT\s+id,\s*username,\s*password\s+FROM\s+app_users$/i.test(cleanSql)) {
      const table = tables.get("app_users");
      return [table ? table.rows.map((r) => ({ id: r.id, username: r.username, password: r.password })) : [], []];
    }

    const insertMatch = cleanSql.match(
      /^INSERT\s+INTO\s+`?([A-Za-z_][A-Za-z0-9_]*)`?\s*\(([^)]+)\)\s*VALUES\s*\(([^)]+)\)(?:\s+ON\s+DUPLICATE\s+KEY\s+UPDATE\s+([\s\S]+))?;?$/i
    );
    if (insertMatch) {
      const tableName = insertMatch[1];
      const table = tables.get(tableName);
      if (!table) {
        const err: any = new Error(`Table '${tableName}' doesn't exist`);
        err.code = "ER_NO_SUCH_TABLE";
        throw err;
      }

      const colNames = insertMatch[2].split(",").map((c) => c.trim().replace(/[`"']/g, ""));
      const valTokens = insertMatch[3].split(",").map((t) => t.trim());
      const onDupClause = insertMatch[4] ? insertMatch[4].trim() : null;

      if (colNames.length !== valTokens.length) {
        const err: any = new Error(`Column count doesn't match value count at row 1`);
        err.code = "ER_WRONG_VALUE_COUNT_ON_ROW";
        throw err;
      }

      // Strictly reject unknown / legacy columns
      for (const col of colNames) {
        if (!table.columns.has(col)) {
          const err: any = new Error(`Unknown column '${col}' in 'field list' of '${tableName}'`);
          err.code = "ER_BAD_FIELD_ERROR";
          err.errno = 1054;
          throw err;
        }
      }

      let pIdx = 0;
      const newRow: Record<string, any> = {};
      for (const [cName] of table.columns.entries()) {
        newRow[cName] = null;
      }
      for (let i = 0; i < colNames.length; i++) {
        const tok = valTokens[i];
        if (tok === "?") {
          newRow[colNames[i]] = params[pIdx++];
        } else if (/^NULL$/i.test(tok)) {
          newRow[colNames[i]] = null;
        } else if (/^-?\d+(\.\d+)?$/.test(tok)) {
          newRow[colNames[i]] = Number(tok);
        } else {
          newRow[colNames[i]] = tok.replace(/^['"]|['"]$/g, "");
        }
      }

      // Enforce NOT NULL constraints
      for (const [cName, cDef] of table.columns.entries()) {
        if (cDef.notNull && !cDef.hasDefault && (newRow[cName] === undefined || newRow[cName] === null)) {
          const err: any = new Error(`Field '${cName}' in '${tableName}' doesn't have a default value`);
          err.code = "ER_NO_DEFAULT_FOR_FIELD";
          err.errno = 1364;
          throw err;
        }
      }

      // Enforce PRIMARY KEY and UNIQUE constraints
      const duplicateRow = table.rows.find((existing) => {
        for (const [cName, cDef] of table.columns.entries()) {
          if ((cDef.isPrimaryKey || cDef.isUnique) && newRow[cName] !== null && newRow[cName] !== undefined) {
            if (existing[cName] === newRow[cName]) {
              return true;
            }
          }
        }
        return false;
      });

      if (duplicateRow) {
        if (onDupClause && /^id\s*=\s*id$/i.test(onDupClause)) {
          return [{ affectedRows: 0 }, []];
        }
        const err: any = new Error(`Duplicate entry '${newRow.id || newRow.username || ""}' for key in '${tableName}'`);
        err.code = "ER_DUP_ENTRY";
        err.errno = 1062;
        throw err;
      }

      table.rows.push(newRow);
      return [{ affectedRows: 1 }, []];
    }

    throw new Error(`Unsupported SQL in strict simulator: ${cleanSql}`);
  };

  const connection = {
    beginTransaction: async () => {
      inTransaction = true;
      snapshot = cloneTables(tables);
    },
    commit: async () => {
      inTransaction = false;
      snapshot = null;
    },
    rollback: async () => {
      if (inTransaction && snapshot) {
        tables.clear();
        for (const [k, v] of snapshot.entries()) {
          tables.set(k, v);
        }
      }
      inTransaction = false;
      snapshot = null;
    },
    release: () => {},
    query: runQuery
  };

  const simPool: any = {
    query: runQuery,
    execute: runQuery,
    getConnection: async () => connection,
    end: async () => {},
    __tables: tables
  };

  return simPool;
}

describe("SEC-010: Database Seed & MariaDB Schema Compatibility", () => {
  const originalEnv = process.env.NODE_ENV;
  const originalAppEnv = process.env.APP_ENV;

  beforeEach(() => {
    resetDatabaseStateForTesting();
    process.env.NODE_ENV = "development";
    delete process.env.APP_ENV;
  });

  afterEach(() => {
    resetDatabaseStateForTesting();
    process.env.NODE_ENV = originalEnv;
    if (originalAppEnv === undefined) {
      delete process.env.APP_ENV;
    } else {
      process.env.APP_ENV = originalAppEnv;
    }
  });

  it("1. Bootstrap creates current MariaDB schema and seeds products, agents, shipping_companies, permanent_drivers, and all app_users (including usr-8 and usr-9) cleanly", async () => {
    const simPool = createStrictMariaDbSimulatorPool();
    setDbPoolForTesting(simPool);

    await bootstrapDatabase();

    assert.equal(isDatabaseHealthy(), true, "Database must be marked healthy after successful schema + seed");
    assert.equal(isFallbackModeActive(), false, "Fallback MockPool must NOT be active when MariaDB bootstrap succeeds");

    const tables: Map<string, TableState> = simPool.__tables;
    assert.equal(tables.get("products")?.rows.length, 5, "5 products seeded");
    assert.equal(tables.get("agents")?.rows.length, 4, "4 agents seeded");
    assert.equal(tables.get("shipping_companies")?.rows.length, 3, "3 shipping companies seeded");
    assert.equal(tables.get("permanent_drivers")?.rows.length, 4, "4 permanent drivers seeded");
    assert.equal(tables.get("app_users")?.rows.length, 12, "12 app_users seeded (usr-0..usr-72 + usr-8 + usr-9)");

    // Verify agents schema alignment (no legacy name/code/province/landline columns)
    const agentsCols = tables.get("agents")!.columns;
    assert.equal(agentsCols.has("name"), false, "Legacy 'name' column must not exist on agents");
    assert.equal(agentsCols.has("code"), false, "Legacy 'code' column must not exist on agents");
    assert.equal(agentsCols.has("province"), false, "Legacy 'province' column must not exist on agents");
    assert.equal(agentsCols.has("landline"), false, "Legacy 'landline' column must not exist on agents");

    const agents = tables.get("agents")!.rows;
    const tehranAgent = agents.find((a) => a.id === "ag-1");
    assert.ok(tehranAgent, "ag-1 must exist");
    assert.equal(tehranAgent.agentCode, "AG-9081");
    assert.equal(tehranAgent.fullName, "آقای حمیدرضا احمدی");
    assert.equal(tehranAgent.alias, "نمایندگی تهران (احمدی)");
    assert.equal(tehranAgent.phoneNumber, "09121111111");
    assert.equal(tehranAgent.isExportAgent, 1);
    assert.equal(tehranAgent.isEnabled, 1);
    assert.ok(Array.isArray(JSON.parse(tehranAgent.territories)), "territories must be valid serialized JSON");

    // Verify usr-8 and usr-9 exist with expected roles
    const users = tables.get("app_users")!.rows;
    const warehouseUser = users.find((u) => u.id === "usr-8");
    const securityGateUser = users.find((u) => u.id === "usr-9");
    assert.ok(warehouseUser, "usr-8 (PRODUCT_WAREHOUSE) must be seeded");
    assert.equal(warehouseUser.username, "warehouse");
    assert.equal(warehouseUser.role, "PRODUCT_WAREHOUSE");
    assert.equal(warehouseUser.phoneNumber, "09110000008");

    assert.ok(securityGateUser, "usr-9 (SECURITY_GATE) must be seeded");
    assert.equal(securityGateUser.username, "security_gate");
    assert.equal(securityGateUser.role, "SECURITY_GATE");
    assert.equal(securityGateUser.phoneNumber, "09110000009");
  });

  it("2. Idempotent re-seeding creates zero duplicates and preserves existing customized records", async () => {
    const simPool = createStrictMariaDbSimulatorPool();
    setDbPoolForTesting(simPool);

    await bootstrapDatabase();

    // Mutate existing records to verify idempotent re-run preserves customized values
    const tables: Map<string, TableState> = simPool.__tables;
    const prod1 = tables.get("products")!.rows.find((p) => p.id === "prod-1")!;
    prod1.pricePerUnit = 999999;
    const usr8 = tables.get("app_users")!.rows.find((u) => u.id === "usr-8")!;
    usr8.fullName = "انباردار شخصی‌سازی‌شده";

    await seedDatabaseIfEmpty(simPool);
    await seedDatabaseWithConnection(simPool);

    assert.equal(tables.get("products")?.rows.length, 5, "No duplicate products");
    assert.equal(tables.get("agents")?.rows.length, 4, "No duplicate agents");
    assert.equal(tables.get("shipping_companies")?.rows.length, 3, "No duplicate shipping companies");
    assert.equal(tables.get("permanent_drivers")?.rows.length, 4, "No duplicate permanent drivers");
    assert.equal(tables.get("app_users")?.rows.length, 12, "No duplicate app_users");

    assert.equal(prod1.pricePerUnit, 999999, "Customized product row must not be overwritten");
    assert.equal(usr8.fullName, "انباردار شخصی‌سازی‌شده", "Customized user row must not be overwritten");
  });

  it("3. Partial table recovery: missing agents/usr-8/usr-9 are backfilled safely when products already exist", async () => {
    const simPool = createStrictMariaDbSimulatorPool();
    setDbPoolForTesting(simPool);
    await bootstrapDatabase();

    const tables: Map<string, TableState> = simPool.__tables;
    // Simulate a legacy partial database where agents failed or usr-8/usr-9 were missing
    tables.get("agents")!.rows = [];
    await seedDatabaseIfEmpty(simPool);
    assert.equal(tables.get("agents")?.rows.length, 4, "Empty agents table must be seeded even when products already exist");
    assert.equal(tables.get("products")?.rows.length, 5, "Existing products must not be duplicated");

    // Now simulate app_users populated without usr-8 and usr-9
    tables.get("app_users")!.rows = tables.get("app_users")!.rows.filter((u) => u.id !== "usr-8" && u.id !== "usr-9");
    assert.equal(tables.get("app_users")?.rows.length, 10);

    await seedDatabaseIfEmpty(simPool);
    assert.equal(tables.get("app_users")?.rows.length, 12, "Missing usr-8 and usr-9 must be auto-inserted");
    assert.ok(tables.get("app_users")!.rows.some((u) => u.id === "usr-8" && u.role === "PRODUCT_WAREHOUSE"));
    assert.ok(tables.get("app_users")!.rows.some((u) => u.id === "usr-9" && u.role === "SECURITY_GATE"));
  });

  it("4. Controlled failure handling: SQL failure in agents/permanent_drivers/app_users rolls back transaction and fails bootstrap instead of silently continuing", async () => {
    // 4a. Failure on agents rolls back earlier products inserts and fails bootstrapDatabase()
    const failAgentsPool = createStrictMariaDbSimulatorPool({
      failOnSqlRegex: /^INSERT\s+INTO\s+agents/i,
      failErrorCode: "ER_BAD_FIELD_ERROR"
    });
    setDbPoolForTesting(failAgentsPool);

    await assert.rejects(
      async () => {
        await bootstrapDatabase();
      },
      (err: any) => {
        assert.equal(err.code, "ER_BAD_FIELD_ERROR");
        return true;
      },
      "bootstrapDatabase must propagate SQL seed failures when MariaDB is connected"
    );
    assert.equal(isDatabaseHealthy(), false, "Database must remain unhealthy after seed failure");
    assert.equal(isFallbackModeActive(), false, "Must NEVER fall back to MockPool on SQL/schema errors");
    assert.equal(
      failAgentsPool.__tables.get("products")?.rows.length,
      0,
      "Transaction rollback must undo products inserted prior to agents failure"
    );

    // 4b. Failure on permanent_drivers or app_users must NOT be swallowed silently
    resetDatabaseStateForTesting();
    const failDriversPool = createStrictMariaDbSimulatorPool({
      failOnSqlRegex: /^INSERT\s+INTO\s+permanent_drivers/i,
      failErrorCode: "ER_NO_DEFAULT_FOR_FIELD"
    });
    setDbPoolForTesting(failDriversPool);

    await assert.rejects(
      async () => {
        await bootstrapDatabase();
      },
      (err: any) => {
        assert.equal(err.code, "ER_NO_DEFAULT_FOR_FIELD");
        return true;
      },
      "permanent_drivers seed failure must NOT be swallowed silently"
    );
    assert.equal(failDriversPool.__tables.get("products")?.rows.length, 0, "Rollback cleans products");
    assert.equal(failDriversPool.__tables.get("agents")?.rows.length, 0, "Rollback cleans agents");

    resetDatabaseStateForTesting();
    const failUsersPool = createStrictMariaDbSimulatorPool({
      failOnSqlRegex: /^INSERT\s+INTO\s+app_users/i,
      failErrorCode: "ER_BAD_FIELD_ERROR"
    });
    setDbPoolForTesting(failUsersPool);

    await assert.rejects(
      async () => {
        await bootstrapDatabase();
      },
      (err: any) => {
        assert.equal(err.code, "ER_BAD_FIELD_ERROR");
        return true;
      },
      "app_users seed failure must NOT be swallowed silently"
    );
    assert.equal(failUsersPool.__tables.get("products")?.rows.length, 0, "Rollback cleans all tables when app_users fails");
  });

  const realHost = process.env.SEC010_TEST_MARIADB_HOST;
  const realDb = process.env.SEC010_TEST_MARIADB_DB;
  const hasIsolatedRealMariaDb = Boolean(realHost && realDb && realDb !== "salesdashboard");

  it(
    "5. Isolated real MariaDB verification (runs only when SEC010_TEST_MARIADB_HOST & non-prod SEC010_TEST_MARIADB_DB are configured)",
    {
      skip: hasIsolatedRealMariaDb
        ? false
        : "Real MariaDB server is not installed/configured in this environment (SEC010_TEST_MARIADB_HOST / SEC010_TEST_MARIADB_DB unset)"
    },
    async () => {
      assert.notEqual(realDb, "salesdashboard", "Never touch production 'salesdashboard' database");
      const testPool = mysql.createPool({
        host: realHost,
        port: Number(process.env.SEC010_TEST_MARIADB_PORT) || 3306,
        user: process.env.SEC010_TEST_MARIADB_USER || "root",
        password: process.env.SEC010_TEST_MARIADB_PASSWORD || "",
        database: realDb,
        waitForConnections: true,
        connectionLimit: 5
      });

      try {
        setDbPoolForTesting(testPool);
        await bootstrapDatabase();
        await seedDatabaseIfEmpty(testPool); // idempotent re-run

        const [[prodCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM products")) as any[];
        const [[agentCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM agents")) as any[];
        const [[scCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM shipping_companies")) as any[];
        const [[driverCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM permanent_drivers")) as any[];
        const [[userCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM app_users")) as any[];
        const [roleRows] = (await testPool.query("SELECT id, role FROM app_users WHERE id IN ('usr-8', 'usr-9')")) as any[];

        assert.equal(Number(prodCount.count), 5);
        assert.equal(Number(agentCount.count), 4);
        assert.equal(Number(scCount.count), 3);
        assert.equal(Number(driverCount.count), 4);
        assert.equal(Number(userCount.count), 12);
        assert.equal(roleRows.length, 2);
      } finally {
        await testPool.end();
      }
    }
  );
});
