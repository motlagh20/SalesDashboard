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

const ALLOWED_ISOLATED_TEST_DB = "salesdashboard_sec010_test";
const FORBIDDEN_PRIVILEGED_USERS = new Set(["root", "mysql.sys", "mysql.session", "mariadb.sys", ""]);
const WRITE_SQL_PATTERN = /^\s*(?:CREATE|ALTER|INSERT|UPDATE|DELETE|REPLACE|DROP|TRUNCATE|RENAME|GRANT|REVOKE)\b/i;

export interface RealMariaDbConfig {
  host?: string;
  port: number;
  user?: string;
  password?: string;
  database?: string;
}

/**
 * Validates MariaDB test connection configuration strictly and independently of NODE_ENV / APP_ENV.
 * Must run BEFORE creating any pool or sending any SQL query.
 */
export function assertSafeRealMariaDbConfig(cfg: RealMariaDbConfig): {
  host: string;
  port: number;
  user: string;
  password: string;
  database: typeof ALLOWED_ISOLATED_TEST_DB;
} {
  const host = (cfg.host || "").trim();
  const database = (cfg.database || "").trim();
  const user = (cfg.user || "").trim();

  if (!host) {
    throw new Error("Unsafe MariaDB test config: SEC010_TEST_MARIADB_HOST is required.");
  }
  if (database !== ALLOWED_ISOLATED_TEST_DB) {
    throw new Error(
      `Unsafe MariaDB test database '${database || "<empty>"}': only '${ALLOWED_ISOLATED_TEST_DB}' is permitted (regardless of NODE_ENV/APP_ENV).`
    );
  }
  if (FORBIDDEN_PRIVILEGED_USERS.has(user.toLowerCase())) {
    throw new Error(
      `Unsafe MariaDB test user '${user || "<empty>"}': root and privileged system accounts are strictly forbidden.`
    );
  }

  return {
    host,
    port: Number(cfg.port) || 3306,
    user,
    password: cfg.password || "",
    database: ALLOWED_ISOLATED_TEST_DB
  };
}

function extractGrantUserPrefix(accountStr: string): string {
  const clean = String(accountStr || "").trim().replace(/^['"`]|['"`]$/g, "");
  const atIdx = clean.indexOf("@");
  const userPart = atIdx >= 0 ? clean.slice(0, atIdx) : clean;
  return userPart.replace(/^['"`]|['"`]$/g, "").trim().toLowerCase();
}

function validateGrantStatements(grantLines: string[]): void {
  if (grantLines.length === 0) {
    throw new Error("Unsafe MariaDB test user: SHOW GRANTS FOR CURRENT_USER() returned no grants.");
  }

  let hasIsolatedDbGrant = false;
  for (const rawGrant of grantLines) {
    const grant = rawGrant.trim();
    if (!grant) continue;

    if (/\bWITH\s+GRANT\s+OPTION\b/i.test(grant)) {
      throw new Error(`Unsafe MariaDB test user grant (WITH GRANT OPTION forbidden): ${grant}`);
    }

    // Disallow any non-USAGE global privilege (*.*)
    if (/\bON\s+\*\.\*/i.test(grant)) {
      if (!/^GRANT\s+USAGE\s+ON\s+\*\.\*/i.test(grant)) {
        throw new Error(`Unsafe MariaDB test user has global privileges (*.*): ${grant}`);
      }
      continue;
    }

    // Extract target database scope: ON `db`.* or ON db.* or ON `db`.`table`
    const onMatch = grant.match(/\bON\s+(`?)([A-Za-z0-9_.*%-]+)\1\s*\./i);
    if (!onMatch) {
      throw new Error(`Unrecognized or overly broad MariaDB grant scope: ${grant}`);
    }

    const grantedDb = onMatch[2];
    if (grantedDb !== ALLOWED_ISOLATED_TEST_DB) {
      throw new Error(
        `Unsafe MariaDB test user has access to non-test database '${grantedDb}' (only '${ALLOWED_ISOLATED_TEST_DB}' allowed): ${grant}`
      );
    }
    hasIsolatedDbGrant = true;
  }

  if (!hasIsolatedDbGrant) {
    throw new Error(
      `Unsafe MariaDB test user: no explicit privilege scoped strictly to '${ALLOWED_ISOLATED_TEST_DB}.*' found.`
    );
  }
}

/**
 * Verifies live connection identity, selected database (`SELECT DATABASE()`), limited privileges,
 * and completely empty schema (`information_schema.tables`) BEFORE any write query runs.
 * Completely independent of NODE_ENV and APP_ENV.
 */
export async function assertSafeRealMariaDbConnection(connection: {
  query: (sql: string, params?: any[]) => Promise<any>;
}): Promise<void> {
  const [identityRows] = (await connection.query(
    "SELECT DATABASE() AS dbName, CURRENT_USER() AS currentUser, USER() AS sessionUser"
  )) as any[];
  const identity = Array.isArray(identityRows) && identityRows[0] ? identityRows[0] : {};
  const activeDb = String(identity.dbName || "").trim();
  const currentUserPrefix = extractGrantUserPrefix(identity.currentUser);
  const sessionUserPrefix = extractGrantUserPrefix(identity.sessionUser);

  if (activeDb !== ALLOWED_ISOLATED_TEST_DB) {
    throw new Error(
      `Unsafe MariaDB connection database: SELECT DATABASE() returned '${activeDb || "<null>"}', expected '${ALLOWED_ISOLATED_TEST_DB}'.`
    );
  }

  if (FORBIDDEN_PRIVILEGED_USERS.has(currentUserPrefix) || FORBIDDEN_PRIVILEGED_USERS.has(sessionUserPrefix)) {
    throw new Error(
      `Unsafe MariaDB connection user: CURRENT_USER()='${identity.currentUser}', USER()='${identity.sessionUser}'. 'root' and system accounts are forbidden.`
    );
  }

  const [grantRows] = (await connection.query("SHOW GRANTS FOR CURRENT_USER()")) as any[];
  const grantLines = Array.isArray(grantRows)
    ? grantRows.map((row: Record<string, any>) => String(Object.values(row)[0] || ""))
    : [];
  validateGrantStatements(grantLines);

  const [existingTables] = (await connection.query(
    "SELECT TABLE_NAME AS tableName FROM information_schema.tables WHERE table_schema = DATABASE()"
  )) as any[];
  if (Array.isArray(existingTables) && existingTables.length > 0) {
    const names = existingTables.map((r: any) => r.tableName || Object.values(r)[0]).join(", ");
    throw new Error(
      `Unsafe MariaDB test database '${ALLOWED_ISOLATED_TEST_DB}': database is not empty (pre-existing tables found: ${names}). Refusing any write operation.`
    );
  }
}

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
 * ON DUPLICATE KEY UPDATE id = id behavior, single-connection transaction tracking, and rollback atomicity.
 */
function createStrictMariaDbSimulatorPool(options?: {
  failOnSqlRegex?: RegExp;
  failErrorCode?: string;
  failOnCallNumber?: number;
}) {
  const tables = new Map<string, TableState>();
  const indexes = new Map<string, Set<string>>();
  let inTransaction = false;
  let snapshot: Map<string, TableState> | null = null;
  let nextConnectionId = 1;
  const queryTrace: Array<{ connectionId: number | null; sql: string; inTransaction: boolean }> = [];

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

  let failMatchCount = 0;

  const executeSql = async (connectionId: number | null, sql: string, params: any[] = []): Promise<any> => {
    const cleanSql = sql.trim();
    queryTrace.push({ connectionId, sql: cleanSql, inTransaction });

    if (options?.failOnSqlRegex && options.failOnSqlRegex.test(cleanSql)) {
      failMatchCount++;
      if (!options.failOnCallNumber || failMatchCount === options.failOnCallNumber) {
        const err: any = new Error(`Simulated SQL failure matching ${options.failOnSqlRegex}: ${cleanSql.slice(0, 80)}`);
        err.code = options.failErrorCode || "ER_BAD_FIELD_ERROR";
        err.errno = 1054;
        throw err;
      }
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

    if (/^SELECT\s+id,\s*username,\s*role(?:,\s*phoneNumber)?\s+FROM\s+app_users\s+WHERE\s+id\s*=\s*\?\s+OR\s+username\s*=\s*\?$/i.test(cleanSql)) {
      const table = tables.get("app_users");
      if (!table) {
        const err: any = new Error("Table 'app_users' doesn't exist");
        err.code = "ER_NO_SUCH_TABLE";
        throw err;
      }
      const [idParam, usernameParam] = params;
      const matched = table.rows
        .filter((r) => r.id === idParam || r.username === usernameParam)
        .map((r) => ({ id: r.id, username: r.username, role: r.role, phoneNumber: r.phoneNumber }));
      return [matched, []];
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

      for (const [cName, cDef] of table.columns.entries()) {
        if (cDef.notNull && !cDef.hasDefault && (newRow[cName] === undefined || newRow[cName] === null)) {
          const err: any = new Error(`Field '${cName}' in '${tableName}' doesn't have a default value`);
          err.code = "ER_NO_DEFAULT_FOR_FIELD";
          err.errno = 1364;
          throw err;
        }
      }

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

  let txStats = { begins: 0, commits: 0, rollbacks: 0, releases: 0 };

  const simPool: any = {
    query: (sql: string, params?: any[]) => executeSql(null, sql, params),
    execute: (sql: string, params?: any[]) => executeSql(null, sql, params),
    getConnection: async () => {
      const connId = nextConnectionId++;
      return {
        beginTransaction: async () => {
          txStats.begins++;
          inTransaction = true;
          snapshot = cloneTables(tables);
        },
        commit: async () => {
          txStats.commits++;
          inTransaction = false;
          snapshot = null;
        },
        rollback: async () => {
          txStats.rollbacks++;
          if (inTransaction && snapshot) {
            tables.clear();
            for (const [k, v] of snapshot.entries()) {
              tables.set(k, v);
            }
          }
          inTransaction = false;
          snapshot = null;
        },
        release: () => {
          txStats.releases++;
        },
        query: (sql: string, params?: any[]) => executeSql(connId, sql, params)
      };
    },
    end: async () => {},
    __tables: tables,
    __queryTrace: queryTrace,
    __txStats: txStats,
    __clearTrace: () => {
      queryTrace.length = 0;
      txStats.begins = 0;
      txStats.commits = 0;
      txStats.rollbacks = 0;
      txStats.releases = 0;
    }
  };

  return simPool;
}

function createSpySafeConnection(options: {
  dbName: string | null;
  currentUser: string;
  sessionUser?: string;
  grants: string[];
  existingTables?: string[];
}) {
  const executedQueries: string[] = [];
  const writeQueries: string[] = [];

  const connection = {
    query: async (sql: string) => {
      executedQueries.push(sql);
      if (WRITE_SQL_PATTERN.test(sql)) {
        writeQueries.push(sql);
      }
      if (/SELECT\s+DATABASE\(\)/i.test(sql)) {
        return [[{
          dbName: options.dbName,
          currentUser: options.currentUser,
          sessionUser: options.sessionUser || options.currentUser
        }], []];
      }
      if (/SHOW\s+GRANTS\s+FOR\s+CURRENT_USER\(\)/i.test(sql)) {
        return [options.grants.map((g) => ({ [`Grants for ${options.currentUser}`]: g })), []];
      }
      if (/information_schema\.tables/i.test(sql)) {
        return [(options.existingTables || []).map((t) => ({ tableName: t })), []];
      }
      return [[], []];
    },
    release: () => {}
  };

  return { connection, executedQueries, writeQueries };
}

describe("SEC-010 & SEC-010-R1: Database Seed, Recovery & MariaDB Safety Guards", () => {
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

    const agentsCols = tables.get("agents")!.columns;
    assert.equal(agentsCols.has("name"), false);
    assert.equal(agentsCols.has("code"), false);
    assert.equal(agentsCols.has("province"), false);
    assert.equal(agentsCols.has("landline"), false);

    const tehranAgent = tables.get("agents")!.rows.find((a) => a.id === "ag-1");
    assert.ok(tehranAgent);
    assert.equal(tehranAgent.agentCode, "AG-9081");
    assert.equal(tehranAgent.fullName, "آقای حمیدرضا احمدی");
    assert.equal(tehranAgent.isExportAgent, 1);
    assert.ok(Array.isArray(JSON.parse(tehranAgent.territories)));

    const users = tables.get("app_users")!.rows;
    const warehouseUser = users.find((u) => u.id === "usr-8");
    const securityGateUser = users.find((u) => u.id === "usr-9");
    assert.equal(warehouseUser?.role, "PRODUCT_WAREHOUSE");
    assert.equal(securityGateUser?.role, "SECURITY_GATE");
  });

  it("2. Idempotent re-seeding preserves existing customized records and creates zero duplicates", async () => {
    const simPool = createStrictMariaDbSimulatorPool();
    setDbPoolForTesting(simPool);
    await bootstrapDatabase();

    const tables: Map<string, TableState> = simPool.__tables;
    const prod1 = tables.get("products")!.rows.find((p) => p.id === "prod-1")!;
    prod1.pricePerUnit = 999999;
    const usr0 = tables.get("app_users")!.rows.find((u) => u.id === "usr-0")!;
    usr0.fullName = "ادمین شخصی‌سازی‌شده";
    usr0.password = "$2b$10$CustomHashPreserved123456789012345678901234567890123456";
    const usr8 = tables.get("app_users")!.rows.find((u) => u.id === "usr-8")!;
    usr8.fullName = "انباردار شخصی‌سازی‌شده";
    const usr9 = tables.get("app_users")!.rows.find((u) => u.id === "usr-9")!;
    usr9.fullName = "نگهبان شخصی‌سازی‌شده";

    await seedDatabaseIfEmpty(simPool);
    await seedDatabaseWithConnection(simPool);

    assert.equal(tables.get("products")?.rows.length, 5);
    assert.equal(tables.get("agents")?.rows.length, 4);
    assert.equal(tables.get("shipping_companies")?.rows.length, 3);
    assert.equal(tables.get("permanent_drivers")?.rows.length, 4);
    assert.equal(tables.get("app_users")?.rows.length, 12);

    assert.equal(prod1.pricePerUnit, 999999);
    assert.equal(usr0.fullName, "ادمین شخصی‌سازی‌شده");
    assert.equal(usr0.password, "$2b$10$CustomHashPreserved123456789012345678901234567890123456");
    assert.equal(usr8.fullName, "انباردار شخصی‌سازی‌شده");
    assert.equal(usr9.fullName, "نگهبان شخصی‌سازی‌شده");
  });

  it("3. Incomplete Seed Detection (SEC-010-R1 #1): seeds when ONLY permanent_drivers is empty while all other tables have rows, without overwriting manual edits or duplicating on re-run", async () => {
    const simPool = createStrictMariaDbSimulatorPool();
    setDbPoolForTesting(simPool);
    await bootstrapDatabase();

    const tables: Map<string, TableState> = simPool.__tables;
    // Empty ONLY permanent_drivers while keeping all other tables populated & manually modified
    tables.get("permanent_drivers")!.rows = [];
    const prod1 = tables.get("products")!.rows.find((p) => p.id === "prod-1")!;
    prod1.pricePerUnit = 888888;
    const ag1 = tables.get("agents")!.rows.find((a) => a.id === "ag-1")!;
    ag1.alias = "نمایندگی سفارشی تهران";
    const usr1 = tables.get("app_users")!.rows.find((u) => u.id === "usr-1")!;
    usr1.fullName = "مدیر بازرگانی ویرایش‌شده";

    await seedDatabaseIfEmpty(simPool);

    assert.equal(tables.get("permanent_drivers")?.rows.length, 4, "Empty permanent_drivers must trigger seeding");
    assert.equal(tables.get("products")?.rows.length, 5, "No duplicate products");
    assert.equal(tables.get("agents")?.rows.length, 4, "No duplicate agents");
    assert.equal(tables.get("shipping_companies")?.rows.length, 3, "No duplicate shipping companies");
    assert.equal(tables.get("app_users")?.rows.length, 12, "No duplicate app_users");

    assert.equal(prod1.pricePerUnit, 888888, "Manual product edit must be preserved");
    assert.equal(ag1.alias, "نمایندگی سفارشی تهران", "Manual agent edit must be preserved");
    assert.equal(usr1.fullName, "مدیر بازرگانی ویرایش‌شده", "Manual user edit must be preserved");

    // Re-run seedDatabaseIfEmpty: idempotent, zero duplicates
    await seedDatabaseIfEmpty(simPool);
    assert.equal(tables.get("permanent_drivers")?.rows.length, 4);
    assert.equal(tables.get("app_users")?.rows.length, 12);
  });

  it("4. User Recovery Transaction (SEC-010-R1 #3): recovers missing usr-8/usr-9 on a single connection inside one transaction while preserving existing users", async () => {
    const simPool = createStrictMariaDbSimulatorPool();
    setDbPoolForTesting(simPool);
    await bootstrapDatabase();

    const tables: Map<string, TableState> = simPool.__tables;
    tables.get("app_users")!.rows = tables.get("app_users")!.rows.filter((u) => u.id !== "usr-8" && u.id !== "usr-9");
    const usr0 = tables.get("app_users")!.rows.find((u) => u.id === "usr-0")!;
    usr0.fullName = "ادمین حفظ‌شده";

    simPool.__clearTrace();
    await seedDatabaseIfEmpty(simPool);

    assert.equal(tables.get("app_users")?.rows.length, 12);
    assert.equal(usr0.fullName, "ادمین حفظ‌شده", "Existing admin details must remain untouched");
    assert.ok(tables.get("app_users")!.rows.some((u) => u.id === "usr-8" && u.username === "warehouse" && u.role === "PRODUCT_WAREHOUSE"));
    assert.ok(tables.get("app_users")!.rows.some((u) => u.id === "usr-9" && u.username === "security_gate" && u.role === "SECURITY_GATE"));

    assert.equal(simPool.__txStats.begins, 1, "Must execute inside one transaction");
    assert.equal(simPool.__txStats.commits, 1, "Must commit once upon success");
    assert.equal(simPool.__txStats.rollbacks, 0);

    const txQueries = simPool.__queryTrace.filter((q: any) => q.inTransaction);
    assert.ok(txQueries.length >= 6, "Checks, inserts, and verifications must run inside transaction");
    const connectionIds = new Set(txQueries.map((q: any) => q.connectionId));
    assert.equal(connectionIds.size, 1, "All check/insert/verify statements must execute on a single connection");
    assert.ok(!connectionIds.has(null), "Must use connection from getConnection(), not pool directly");
  });

  it("5. User Recovery Failure Rollback (SEC-010-R1 #4.5): failure inserting usr-9 rolls back earlier usr-8 insert completely", async () => {
    const cleanPool = createStrictMariaDbSimulatorPool();
    setDbPoolForTesting(cleanPool);
    await bootstrapDatabase();

    // Remove usr-8 and usr-9
    cleanPool.__tables.get("app_users")!.rows = cleanPool.__tables.get("app_users")!.rows.filter(
      (u: any) => u.id !== "usr-8" && u.id !== "usr-9"
    );

    // Wrap cleanPool.getConnection to fail on the 2nd INSERT INTO app_users (usr-9)
    const origGetConn = cleanPool.getConnection;
    let insertAttempts = 0;
    cleanPool.getConnection = async () => {
      const conn = await origGetConn();
      const origQuery = conn.query;
      conn.query = async (sql: string, params?: any[]) => {
        if (/^INSERT\s+INTO\s+app_users/i.test(sql.trim())) {
          insertAttempts++;
          if (insertAttempts === 2) {
            const err: any = new Error("Simulated SQL error inserting usr-9");
            err.code = "ER_LOCK_WAIT_TIMEOUT";
            throw err;
          }
        }
        return origQuery(sql, params);
      };
      return conn;
    };

    cleanPool.__clearTrace();
    await assert.rejects(
      async () => {
        await seedDatabaseIfEmpty(cleanPool);
      },
      (err: any) => {
        assert.equal(err.code, "ER_LOCK_WAIT_TIMEOUT");
        return true;
      }
    );

    assert.equal(cleanPool.__txStats.begins, 1);
    assert.equal(cleanPool.__txStats.rollbacks, 1, "Transaction must rollback completely when usr-9 fails");
    assert.equal(cleanPool.__txStats.commits, 0, "Must never commit after failure");

    const remainingUsers = cleanPool.__tables.get("app_users")!.rows;
    assert.equal(remainingUsers.length, 10, "Earlier usr-8 insert must be completely rolled back");
    assert.equal(remainingUsers.some((u: any) => u.id === "usr-8"), false, "usr-8 must not persist after rollback");
    assert.equal(remainingUsers.some((u: any) => u.id === "usr-9"), false, "usr-9 must not persist");
  });

  it("6. Incompatible Conflict Detection (SEC-010-R1 #4.6): throws clear error and rolls back when id, username, or phoneNumber conflicts with mismatched role/identity", async () => {
    const setupPoolWithoutUsers = async (corruptFn: (rows: any[]) => any[]) => {
      const simPool = createStrictMariaDbSimulatorPool();
      setDbPoolForTesting(simPool);
      await bootstrapDatabase();
      simPool.__tables.get("app_users")!.rows = corruptFn(simPool.__tables.get("app_users")!.rows);
      simPool.__clearTrace();
      return simPool;
    };

    // Case 6a: id 'usr-8' exists with wrong username/role
    const poolWrongRole = await setupPoolWithoutUsers((rows) =>
      rows.map((u) => (u.id === "usr-8" ? { ...u, role: "REPRESENTATIVE", username: "wrong_wh" } : u))
    );
    await assert.rejects(() => seedDatabaseIfEmpty(poolWrongRole), /Incompatible user recovery conflict/i);
    assert.equal(poolWrongRole.__txStats.rollbacks, 1);

    // Case 6b: username 'warehouse' exists with wrong id ('usr-999') while usr-8 is missing
    const poolWrongIdForUsername = await setupPoolWithoutUsers((rows) =>
      rows.map((u) => (u.id === "usr-8" ? { ...u, id: "usr-999" } : u))
    );
    await assert.rejects(() => seedDatabaseIfEmpty(poolWrongIdForUsername), /Incompatible user recovery conflict/i);
    assert.equal(poolWrongIdForUsername.__txStats.rollbacks, 1);

    // Case 6c: phoneNumber '09110000009' already held by another user ('usr-custom'), causing ON DUPLICATE KEY UPDATE id = id no-op while usr-9 stays absent
    // Also remove usr-8 so we verify usr-8 gets rolled back too when usr-9 hits phoneNumber collision!
    const poolPhoneCollision = await setupPoolWithoutUsers((rows) => {
      const filtered = rows.filter((u) => u.id !== "usr-8" && u.id !== "usr-9");
      filtered.push({
        id: "usr-custom",
        username: "custom_other",
        fullName: "کاربر مزاحم",
        phoneNumber: "09110000009",
        role: "REPRESENTATIVE",
        agentCode: "AG-9081",
        shippingCompanyId: null,
        isEnabled: 1,
        password: "hash"
      });
      return filtered;
    });
    await assert.rejects(() => seedDatabaseIfEmpty(poolPhoneCollision), /Required user verification failed.*usr-9/i);
    assert.equal(poolPhoneCollision.__txStats.rollbacks, 1, "Must rollback transaction on unique key collision conflict");
    assert.equal(poolPhoneCollision.__txStats.commits, 0);
    assert.equal(
      poolPhoneCollision.__tables.get("app_users")!.rows.some((u: any) => u.id === "usr-8"),
      false,
      "usr-8 inserted earlier in transaction must roll back when usr-9 fails post-insert verification"
    );
  });

  it("7. Controlled Bootstrap Failure Handling: SQL error in agents/permanent_drivers/app_users rolls back transaction and fails bootstrap", async () => {
    const failAgentsPool = createStrictMariaDbSimulatorPool({
      failOnSqlRegex: /^INSERT\s+INTO\s+agents/i,
      failErrorCode: "ER_BAD_FIELD_ERROR"
    });
    setDbPoolForTesting(failAgentsPool);

    await assert.rejects(() => bootstrapDatabase(), (err: any) => err.code === "ER_BAD_FIELD_ERROR");
    assert.equal(isDatabaseHealthy(), false);
    assert.equal(isFallbackModeActive(), false);
    assert.equal(failAgentsPool.__tables.get("products")?.rows.length, 0);

    resetDatabaseStateForTesting();
    const failDriversPool = createStrictMariaDbSimulatorPool({
      failOnSqlRegex: /^INSERT\s+INTO\s+permanent_drivers/i,
      failErrorCode: "ER_NO_DEFAULT_FOR_FIELD"
    });
    setDbPoolForTesting(failDriversPool);

    await assert.rejects(() => bootstrapDatabase(), (err: any) => err.code === "ER_NO_DEFAULT_FOR_FIELD");
    assert.equal(failDriversPool.__tables.get("products")?.rows.length, 0);

    resetDatabaseStateForTesting();
    const failUsersPool = createStrictMariaDbSimulatorPool({
      failOnSqlRegex: /^INSERT\s+INTO\s+app_users/i,
      failErrorCode: "ER_BAD_FIELD_ERROR"
    });
    setDbPoolForTesting(failUsersPool);

    await assert.rejects(() => bootstrapDatabase(), (err: any) => err.code === "ER_BAD_FIELD_ERROR");
    assert.equal(failUsersPool.__tables.get("products")?.rows.length, 0);
  });

  it("8. MariaDB Safety Guards (SEC-010-R1 #2, #4.2, #4.3, #4.4, #4.8): rejects unauthorized DB names, non-empty DBs, root/privileged users, and overly broad grants BEFORE any write regardless of NODE_ENV/APP_ENV", async () => {
    const envCombinations = [
      { NODE_ENV: "development", APP_ENV: undefined },
      { NODE_ENV: "test", APP_ENV: "test" },
      { NODE_ENV: "production", APP_ENV: "production" },
      { NODE_ENV: "staging", APP_ENV: "development" }
    ];

    for (const envCombo of envCombinations) {
      process.env.NODE_ENV = envCombo.NODE_ENV;
      if (envCombo.APP_ENV === undefined) delete process.env.APP_ENV;
      else process.env.APP_ENV = envCombo.APP_ENV;

      // 8a. Reject unauthorized DB names at config stage
      assert.throws(
        () =>
          assertSafeRealMariaDbConfig({
            host: "127.0.0.1",
            port: 3306,
            user: "sec010_tester",
            password: "pw",
            database: "salesdashboard"
          }),
        /only 'salesdashboard_sec010_test' is permitted/i
      );
      assert.throws(
        () =>
          assertSafeRealMariaDbConfig({
            host: "127.0.0.1",
            port: 3306,
            user: "sec010_tester",
            password: "pw",
            database: "other_db"
          }),
        /only 'salesdashboard_sec010_test' is permitted/i
      );

      // 8b. Reject root / empty user at config stage
      assert.throws(
        () =>
          assertSafeRealMariaDbConfig({
            host: "127.0.0.1",
            port: 3306,
            user: "root",
            password: "pw",
            database: "salesdashboard_sec010_test"
          }),
        /root and privileged system accounts are strictly forbidden/i
      );

      // 8c. Reject SELECT DATABASE() mismatch with zero write queries
      const spyWrongDb = createSpySafeConnection({
        dbName: "salesdashboard",
        currentUser: "'sec010_tester'@'localhost'",
        grants: ["GRANT USAGE ON *.* TO `sec010_tester`@`localhost`", "GRANT ALL PRIVILEGES ON `salesdashboard_sec010_test`.* TO `sec010_tester`@`localhost`"],
        existingTables: []
      });
      await assert.rejects(() => assertSafeRealMariaDbConnection(spyWrongDb.connection), /SELECT DATABASE\(\) returned 'salesdashboard'/i);
      assert.equal(spyWrongDb.writeQueries.length, 0, "Zero write queries may run when DB name guard fails");

      // 8d. Reject pre-existing tables in salesdashboard_sec010_test with zero write queries
      const spyNonEmptyDb = createSpySafeConnection({
        dbName: "salesdashboard_sec010_test",
        currentUser: "'sec010_tester'@'localhost'",
        grants: ["GRANT USAGE ON *.* TO `sec010_tester`@`localhost`", "GRANT ALL PRIVILEGES ON `salesdashboard_sec010_test`.* TO `sec010_tester`@`localhost`"],
        existingTables: ["products", "app_users"]
      });
      await assert.rejects(() => assertSafeRealMariaDbConnection(spyNonEmptyDb.connection), /database is not empty/i);
      assert.equal(spyNonEmptyDb.writeQueries.length, 0, "Zero write queries may run when DB has pre-existing tables");

      // 8e. Reject root CURRENT_USER() with zero write queries
      const spyRootConn = createSpySafeConnection({
        dbName: "salesdashboard_sec010_test",
        currentUser: "'root'@'localhost'",
        grants: ["GRANT ALL PRIVILEGES ON *.* TO `root`@`localhost` WITH GRANT OPTION"],
        existingTables: []
      });
      await assert.rejects(() => assertSafeRealMariaDbConnection(spyRootConn.connection), /'root' and system accounts are forbidden/i);
      assert.equal(spyRootConn.writeQueries.length, 0, "Zero write queries may run when CURRENT_USER() is root");

      // 8f. Reject overly broad grants (*.* or salesdashboard.*) with zero write queries
      const spyBroadGrant = createSpySafeConnection({
        dbName: "salesdashboard_sec010_test",
        currentUser: "'sec010_tester'@'localhost'",
        grants: [
          "GRANT USAGE ON *.* TO `sec010_tester`@`localhost`",
          "GRANT SELECT, INSERT ON `salesdashboard`.* TO `sec010_tester`@`localhost`",
          "GRANT ALL PRIVILEGES ON `salesdashboard_sec010_test`.* TO `sec010_tester`@`localhost`"
        ],
        existingTables: []
      });
      await assert.rejects(() => assertSafeRealMariaDbConnection(spyBroadGrant.connection), /non-test database 'salesdashboard'/i);
      assert.equal(spyBroadGrant.writeQueries.length, 0, "Zero write queries may run when user has grants outside test DB");

      const spyGlobalGrant = createSpySafeConnection({
        dbName: "salesdashboard_sec010_test",
        currentUser: "'sec010_tester'@'localhost'",
        grants: ["GRANT ALL PRIVILEGES ON *.* TO `sec010_tester`@`localhost`"],
        existingTables: []
      });
      await assert.rejects(() => assertSafeRealMariaDbConnection(spyGlobalGrant.connection), /global privileges \(\*\.\*\)/i);
      assert.equal(spyGlobalGrant.writeQueries.length, 0, "Zero write queries may run when user has global privileges");

      // 8g. Valid isolated connection passes with 0 write queries executed during guard phase
      const spyValidConn = createSpySafeConnection({
        dbName: "salesdashboard_sec010_test",
        currentUser: "'sec010_tester'@'localhost'",
        grants: [
          "GRANT USAGE ON *.* TO `sec010_tester`@`localhost`",
          "GRANT SELECT, INSERT, UPDATE, CREATE, ALTER, INDEX ON `salesdashboard_sec010_test`.* TO `sec010_tester`@`localhost`"
        ],
        existingTables: []
      });
      await assertSafeRealMariaDbConnection(spyValidConn.connection);
      assert.equal(spyValidConn.writeQueries.length, 0, "Safety verification itself must execute zero write queries");
    }
  });

  const realHost = process.env.SEC010_TEST_MARIADB_HOST;
  const hasRealMariaDbHost = Boolean(realHost && realHost.trim().length > 0);

  it(
    "9. Isolated real MariaDB verification (executes ONLY against empty dedicated 'salesdashboard_sec010_test' with limited non-root user; no DROP/DELETE)",
    {
      skip: hasRealMariaDbHost
        ? false
        : "Real MariaDB server is not installed/configured in this environment (SEC010_TEST_MARIADB_HOST unset)"
    },
    async () => {
      // Strictly validate config BEFORE creating any pool (independent of NODE_ENV / APP_ENV)
      const safeCfg = assertSafeRealMariaDbConfig({
        host: process.env.SEC010_TEST_MARIADB_HOST,
        port: Number(process.env.SEC010_TEST_MARIADB_PORT) || 3306,
        user: process.env.SEC010_TEST_MARIADB_USER,
        password: process.env.SEC010_TEST_MARIADB_PASSWORD,
        database: process.env.SEC010_TEST_MARIADB_DB
      });

      const testPool = mysql.createPool({
        host: safeCfg.host,
        port: safeCfg.port,
        user: safeCfg.user,
        password: safeCfg.password,
        database: safeCfg.database,
        waitForConnections: true,
        connectionLimit: 5
      });

      try {
        // Verify selected DB, limited user privileges, and empty DB on live connection BEFORE any write
        const verifyConn = await testPool.getConnection();
        try {
          await assertSafeRealMariaDbConnection(verifyConn);
        } finally {
          verifyConn.release();
        }

        setDbPoolForTesting(testPool);
        await bootstrapDatabase();
        await seedDatabaseIfEmpty(testPool); // idempotent re-run

        const [[dbCheck]] = (await testPool.query("SELECT DATABASE() AS dbName")) as any[];
        assert.equal(dbCheck.dbName, ALLOWED_ISOLATED_TEST_DB);

        const [[prodCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM products")) as any[];
        const [[agentCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM agents")) as any[];
        const [[scCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM shipping_companies")) as any[];
        const [[driverCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM permanent_drivers")) as any[];
        const [[userCount]] = (await testPool.query("SELECT COUNT(*) AS count FROM app_users")) as any[];
        const [roleRows] = (await testPool.query(
          "SELECT id, username, role FROM app_users WHERE id IN ('usr-0', 'usr-8', 'usr-9') ORDER BY id"
        )) as any[];

        assert.equal(Number(prodCount.count), 5);
        assert.equal(Number(agentCount.count), 4);
        assert.equal(Number(scCount.count), 3);
        assert.equal(Number(driverCount.count), 4);
        assert.equal(Number(userCount.count), 12);
        assert.equal(roleRows.length, 3);
      } finally {
        await testPool.end();
      }
    }
  );
});
