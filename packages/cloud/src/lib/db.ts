import type { Hyperdrive } from "@cloudflare/workers-types";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "../schema";

export function getDb(hyperdrive: Hyperdrive) {
  // Use Hyperdrive connection string (works with local and remote Postgres)
  const sql = postgres(hyperdrive.connectionString);
  return drizzle(sql, { schema });
}

export type Database = ReturnType<typeof getDb>;
