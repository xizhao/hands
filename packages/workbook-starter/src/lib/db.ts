import postgres from "postgres";

// Create a SQL client from the DATABASE_URL env var
// The postgres package works in both Cloudflare Workers (via Hyperdrive) and locally
export function createDb(databaseUrl: string) {
  return postgres(databaseUrl, {
    // Cloudflare Workers compatibility
    prepare: false,
  });
}

// For dynamic queries where the query string comes from config
export async function runQuery(
  sql: ReturnType<typeof postgres>,
  query: string
): Promise<Record<string, unknown>[]> {
  const result = await sql.unsafe(query);
  return result as Record<string, unknown>[];
}

export type SQL = ReturnType<typeof postgres>;
