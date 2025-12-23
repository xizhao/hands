import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import type { Hyperdrive } from "@cloudflare/workers-types";
import * as schema from "../schema";

export function getDb(hyperdrive: Hyperdrive) {
  // Use Hyperdrive connection string for pooled connections
  const sql = neon(hyperdrive.connectionString);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof getDb>;
