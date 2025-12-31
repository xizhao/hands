/**
 * Database Seed/Dump Routes (Production)
 *
 * Endpoints for syncing database between local and production.
 * Protected by HANDS_SEED_SECRET environment variable.
 */

import { env } from "cloudflare:workers";
import { route } from "rwsdk/router";
import { getDb, getUserTables, kyselySql, runWithDbMode } from "./dev";

function getSecret(): string | undefined {
  // @ts-expect-error - HANDS_SEED_SECRET is optional env var
  return env.HANDS_SEED_SECRET as string | undefined;
}

export const seedRoutes = [
  /**
   * Seed endpoint - receives SQL statements and executes them
   */
  route("/db/seed", {
    post: async ({ request }) => {
      try {
        const secret = getSecret();
        if (!secret) {
          return new Response("Seeding not configured", { status: 404 });
        }

        const body = (await request.json()) as {
          secret: string;
          statements: string[];
        };

        if (body.secret !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const db = getDb();
        const results: { index: number; success: boolean; error?: string }[] = [];

        await runWithDbMode("action", async () => {
          for (let i = 0; i < body.statements.length; i++) {
            const stmt = body.statements[i];
            try {
              await kyselySql.raw(stmt).execute(db);
              results.push({ index: i, success: true });
            } catch (err) {
              results.push({
                index: i,
                success: false,
                error: err instanceof Error ? err.message : String(err),
              });
            }
          }
        });

        const failures = results.filter((r) => !r.success);
        return new Response(
          JSON.stringify({
            success: failures.length === 0,
            total: body.statements.length,
            executed: results.filter((r) => r.success).length,
            failures,
          }),
          { headers: { "Content-Type": "application/json" } },
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  }),

  /**
   * Dump endpoint - exports database as SQL statements
   */
  route("/db/dump", {
    post: async ({ request }) => {
      try {
        const secret = getSecret();
        if (!secret) {
          return new Response("Dump not configured", { status: 404 });
        }

        const body = (await request.json()) as { secret: string };

        if (body.secret !== secret) {
          return new Response("Unauthorized", { status: 401 });
        }

        const db = getDb();
        const statements: string[] = [];

        await runWithDbMode("action", async () => {
          // Get all user tables
          const userTables = await getUserTables();

          for (const table of userTables) {
            // Add CREATE TABLE statement
            if (table.sql) {
              statements.push(table.sql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"));
            }

            // Get all rows
            const rowsResult = await kyselySql.raw(`SELECT * FROM "${table.name}"`).execute(db);

            for (const row of rowsResult.rows as Record<string, unknown>[]) {
              const columns = Object.keys(row);
              const values = columns.map((col) => {
                const val = row[col];
                if (val === null) return "NULL";
                if (typeof val === "number") return String(val);
                if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
                return `'${String(val).replace(/'/g, "''")}'`;
              });

              statements.push(
                `INSERT OR REPLACE INTO "${table.name}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")})`,
              );
            }
          }
        });

        return new Response(JSON.stringify({ success: true, statements }), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(JSON.stringify({ error: message }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  }),
];
