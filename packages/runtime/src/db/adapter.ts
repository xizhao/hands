/**
 * Runtime Database Adapter
 *
 * Implements DbAdapter using Kysely for runtime/dev environment.
 */

import type { DbAdapter } from "@hands/core/types";
import { getDb, kyselySql, runWithDbMode } from "./dev";

/**
 * Create a DbAdapter for the runtime using Kysely
 */
export function createRuntimeDbAdapter(): DbAdapter {
  return {
    async executeQuery(sql: string, _params?: unknown[]) {
      const db = getDb();
      const result = await runWithDbMode("block", async () => {
        const raw = kyselySql.raw(sql);
        return raw.execute(db);
      });
      return { rows: result.rows as Record<string, unknown>[] };
    },
  };
}

/**
 * Singleton runtime db adapter
 */
let runtimeDbAdapter: DbAdapter | null = null;

export function getRuntimeDbAdapter(): DbAdapter {
  if (!runtimeDbAdapter) {
    runtimeDbAdapter = createRuntimeDbAdapter();
  }
  return runtimeDbAdapter;
}
