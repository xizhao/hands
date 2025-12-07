import { neon, NeonQueryFunction } from "@neondatabase/serverless";

// Create a SQL query function from the DATABASE_URL env var
// Neon's serverless driver works in Cloudflare Workers
export function createDb(databaseUrl: string): NeonQueryFunction<false, false> {
  return neon(databaseUrl);
}

// For dynamic queries where the query string comes from config
export async function runQuery(
  sql: NeonQueryFunction<false, false>,
  query: string
): Promise<Record<string, unknown>[]> {
  // Use tagged template literal with the query
  const result = await sql([query] as unknown as TemplateStringsArray);
  return result as Record<string, unknown>[];
}

export type SQL = NeonQueryFunction<false, false>;
