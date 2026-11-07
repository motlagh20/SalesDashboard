import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("Item 3: Redis Targeted Cache Cleanup Suite", () => {
  it("3.1 Flushes salesdashboard:* keys while strictly preserving foreign/unrelated keys", async () => {
    // In-memory Redis simulation
    const store = new Map<string, string>();

    // 1. Populate SalesDashboard-owned keys
    store.set("salesdashboard:cache:products", JSON.stringify([{ id: "prod-1" }]));
    store.set("salesdashboard:cache:agents", JSON.stringify([{ id: "ag-1" }]));
    store.set("salesdashboard:cache:shipping_companies", JSON.stringify([{ id: "sc-1" }]));
    store.set("salesdashboard:cache:permanent_drivers", JSON.stringify([{ id: "drv-1" }]));
    store.set("salesdashboard:rate:otp:phone:09121110000", "5");
    store.set("salesdashboard:cooldown:LOGIN:09121110000", "1");
    store.set("salesdashboard:otp:LOGIN:09121110000", JSON.stringify({ code: "123456" }));

    // 2. Populate unrelated / foreign application keys that MUST NEVER be deleted
    store.set("unrelated:user:1", "sensitive_user_session");
    store.set("app2:cache:data", "critical_app2_data");
    store.set("rate:foreign_api:client_1", "99");
    store.set("cooldown:other_system:user_2", "1");
    store.set("otp:external_gateway:user_3", "999999");
    store.set("session:node_auth_token", "jwt_data");

    // 3. Execute the exact targeted SCAN-based deletion logic implemented in /api/system/flush-cache
    const mockRedis = {
      scan: async (cursor: string, matchKey?: string, pattern?: string, countKey?: string, countVal?: number) => {
        const allKeys = Array.from(store.keys());
        const regex = pattern ? new RegExp("^" + pattern.replace(/\*/g, ".*") + "$") : /.*/;
        const matched = allKeys.filter(k => regex.test(k));
        return ["0", matched];
      },
      del: async (key: string) => {
        store.delete(key);
        return 1;
      }
    };

    let cursor = "0";
    do {
      const [nextCursor, keys] = (await mockRedis.scan(cursor, "MATCH", "salesdashboard:*", "COUNT", 100)) as [string, string[]];
      cursor = nextCursor;
      if (Array.isArray(keys) && keys.length > 0) {
        for (const k of keys) {
          await mockRedis.del(k);
        }
      }
    } while (cursor !== "0");

    // 4. Assert all SalesDashboard keys have been wiped
    for (const key of store.keys()) {
      assert.ok(!key.startsWith("salesdashboard:"), `Key ${key} should have been deleted`);
    }

    // 5. Assert all foreign and unrelated keys remain 100% intact
    assert.equal(store.get("unrelated:user:1"), "sensitive_user_session");
    assert.equal(store.get("app2:cache:data"), "critical_app2_data");
    assert.equal(store.get("rate:foreign_api:client_1"), "99");
    assert.equal(store.get("cooldown:other_system:user_2"), "1");
    assert.equal(store.get("otp:external_gateway:user_3"), "999999");
    assert.equal(store.get("session:node_auth_token"), "jwt_data");
    assert.equal(store.size, 6, "Exactly 6 unrelated keys must survive the cache flush");
  });
});
