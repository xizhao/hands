/**
 * Database Routes (Dev Only)
 *
 * HTTP endpoints for AI agent database access during development.
 * These routes are NOT included in production builds.
 */

import { route } from "rwsdk/router";
import { getDb, getUserTables, kyselySql, runWithDbMode } from "./dev";

export const dbRoutes = [
  route("/db/health", () =>
    new Response(JSON.stringify({ ready: true }), {
      headers: { "Content-Type": "application/json" },
    })
  ),

  route("/db/schema", async () => {
    try {
      const db = getDb();
      const userTables = await getUserTables();

      const tables = await Promise.all(
        userTables.map(async (t) => {
          const columnsResult = await kyselySql<{
            name: string;
            type: string;
            notnull: number;
            pk: number;
          }>`PRAGMA table_info(${kyselySql.raw(`"${t.name}"`)})`.execute(db);

          return {
            name: t.name,
            columns: columnsResult.rows.map((c) => ({
              name: c.name,
              type: c.type,
              nullable: c.notnull === 0,
              isPrimary: c.pk === 1,
            })),
          };
        })
      );

      return new Response(JSON.stringify({ tables }), {
        headers: { "Content-Type": "application/json" },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return new Response(message, { status: 500 });
    }
  }),

  route("/db/query", {
    post: async ({ request }) => {
      try {
        const body = (await request.json()) as { sql: string };
        const { sql: sqlQuery } = body;

        const db = getDb();
        const result = await runWithDbMode("action", async () => {
          const raw = kyselySql.raw(sqlQuery);
          return raw.execute(db);
        });

        return new Response(
          JSON.stringify({
            rows: result.rows,
            changes: (result as { numAffectedRows?: bigint }).numAffectedRows
              ? Number((result as { numAffectedRows: bigint }).numAffectedRows)
              : undefined,
            lastInsertRowid: (result as { insertId?: bigint }).insertId
              ? Number((result as { insertId: bigint }).insertId)
              : undefined,
          }),
          { headers: { "Content-Type": "application/json" } }
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return new Response(message, { status: 500 });
      }
    },
  }),
];
