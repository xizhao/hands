/**
 * Tests for Action Flow Analysis
 */

import { describe, expect, it } from "vitest";
import { analyzeSql } from "./analyze-sql";
import { extractActionFlow } from "./walk-run-function";

describe("extractActionFlow", () => {
  it("extracts action name from defineAction", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "my-action",
        async run(input, ctx) {
          return {};
        },
      });
    `;

    const flow = extractActionFlow(source);
    expect(flow.name).toBe("my-action");
  });

  it("extracts SQL queries from ctx.sql tagged templates", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "query-action",
        async run(input, ctx) {
          const users = await ctx.sql\`
            SELECT id, name, email
            FROM users
            WHERE active = true
          \`;
          return { users };
        },
      });
    `;

    const flow = extractActionFlow(source);
    expect(flow.steps.length).toBeGreaterThan(0);

    const sqlStep = flow.steps.find((s) => s.type === "sql");
    expect(sqlStep).toBeDefined();
    expect(sqlStep?.sql?.operation).toBe("select");
    expect(sqlStep?.sql?.tables).toContainEqual(
      expect.objectContaining({ table: "users", usage: "read" }),
    );
    expect(sqlStep?.sql?.assignedTo).toBe("users");
  });

  it("extracts multiple SQL queries", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "multi-query",
        async run(input, ctx) {
          const orders = await ctx.sql\`SELECT * FROM orders\`;
          const products = await ctx.sql\`SELECT * FROM products\`;
          return { orders, products };
        },
      });
    `;

    const flow = extractActionFlow(source);
    const sqlSteps = flow.steps.filter((s) => s.type === "sql");
    expect(sqlSteps.length).toBe(2);

    expect(flow.tables).toContainEqual(expect.objectContaining({ table: "orders", isRead: true }));
    expect(flow.tables).toContainEqual(
      expect.objectContaining({ table: "products", isRead: true }),
    );
  });

  it("extracts INSERT operations", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "insert-action",
        async run(input, ctx) {
          await ctx.sql\`
            INSERT INTO logs (message, created_at)
            VALUES ('test', NOW())
          \`;
        },
      });
    `;

    const flow = extractActionFlow(source);
    const sqlStep = flow.steps.find((s) => s.type === "sql");
    expect(sqlStep?.sql?.operation).toBe("insert");
    expect(sqlStep?.sql?.tables).toContainEqual(
      expect.objectContaining({ table: "logs", usage: "write" }),
    );
  });

  it("detects upsert with ON CONFLICT", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "upsert-action",
        async run(input, ctx) {
          await ctx.sql\`
            INSERT INTO users (id, name)
            VALUES ('123', 'Test')
            ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
          \`;
        },
      });
    `;

    const flow = extractActionFlow(source);
    const sqlStep = flow.steps.find((s) => s.type === "sql");
    expect(sqlStep?.sql?.operation).toBe("upsert");
  });

  it("extracts fetch calls", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "fetch-action",
        async run(input, ctx) {
          const response = await fetch("https://api.example.com/data");
          const data = await response.json();
          return data;
        },
      });
    `;

    const flow = extractActionFlow(source);
    const fetchStep = flow.steps.find((s) => s.type === "fetch");
    expect(fetchStep).toBeDefined();
    expect(fetchStep?.fetch?.url).toContain("api.example.com");
    expect(fetchStep?.fetch?.assignedTo).toBe("response");

    expect(flow.sources).toContainEqual(expect.objectContaining({ type: "api", name: "Api" }));
  });

  it("extracts schedule trigger", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "scheduled-action",
        schedule: "0 * * * *",
        async run(input, ctx) {
          return {};
        },
      });
    `;

    const flow = extractActionFlow(source);
    expect(flow.sources).toContainEqual(
      expect.objectContaining({ type: "schedule", name: "0 * * * *" }),
    );
  });

  it("extracts conditional branches", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "conditional-action",
        async run(input, ctx) {
          if (input.shouldArchive) {
            await ctx.sql\`INSERT INTO archive SELECT * FROM orders\`;
          } else {
            await ctx.sql\`UPDATE orders SET status = 'processed'\`;
          }
        },
      });
    `;

    const flow = extractActionFlow(source);
    const conditionStep = flow.steps.find((s) => s.type === "condition");
    expect(conditionStep).toBeDefined();
    expect(conditionStep?.condition?.thenBranch.length).toBeGreaterThan(0);
    expect(conditionStep?.condition?.elseBranch?.length).toBeGreaterThan(0);
  });

  it("extracts loops", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "loop-action",
        async run(input, ctx) {
          for (const item of items) {
            await ctx.sql\`INSERT INTO processed (id) VALUES (\${item.id})\`;
          }
        },
      });
    `;

    const flow = extractActionFlow(source);
    const loopStep = flow.steps.find((s) => s.type === "loop");
    expect(loopStep).toBeDefined();
    expect(loopStep?.loop?.loopType).toBe("for-of");
    expect(loopStep?.loop?.body.length).toBeGreaterThan(0);
  });

  it("extracts return statement", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "return-action",
        async run(input, ctx) {
          const result = await ctx.sql\`SELECT * FROM data\`;
          return { data: result, count: result.length };
        },
      });
    `;

    const flow = extractActionFlow(source);
    const returnStep = flow.steps.find((s) => s.type === "return");
    expect(returnStep).toBeDefined();
    expect(returnStep?.returnValue?.references).toContain("result");
  });

  it("builds table summary correctly", () => {
    const source = `
      import { defineAction } from "@hands/core/primitives";

      export default defineAction({
        name: "mixed-action",
        async run(input, ctx) {
          const users = await ctx.sql\`SELECT * FROM users\`;
          await ctx.sql\`INSERT INTO audit_log (user_id) SELECT id FROM users\`;
          await ctx.sql\`UPDATE users SET last_login = NOW()\`;
          return users;
        },
      });
    `;

    const flow = extractActionFlow(source);

    const usersTable = flow.tables.find((t) => t.table === "users");
    expect(usersTable).toBeDefined();
    expect(usersTable?.isRead).toBe(true);
    expect(usersTable?.isWritten).toBe(true);
    expect(usersTable?.operations).toContain("select");
    expect(usersTable?.operations).toContain("update");

    const auditTable = flow.tables.find((t) => t.table === "audit_log");
    expect(auditTable).toBeDefined();
    expect(auditTable?.isWritten).toBe(true);
  });
});

describe("analyzeSql", () => {
  it("parses simple SELECT", () => {
    const result = analyzeSql("SELECT id, name FROM users WHERE active = true");
    expect(result.operation).toBe("select");
    expect(result.tables).toContainEqual(
      expect.objectContaining({ table: "users", usage: "read" }),
    );
  });

  it("parses SELECT with JOIN", () => {
    const result = analyzeSql(`
      SELECT o.id, u.name
      FROM orders o
      JOIN users u ON o.user_id = u.id
    `);
    expect(result.operation).toBe("select");
    expect(result.tables).toContainEqual(expect.objectContaining({ table: "orders" }));
    expect(result.tables).toContainEqual(expect.objectContaining({ table: "users" }));
  });

  it("parses INSERT", () => {
    const result = analyzeSql("INSERT INTO logs (message) VALUES ('test')");
    expect(result.operation).toBe("insert");
    expect(result.tables).toContainEqual(
      expect.objectContaining({ table: "logs", usage: "write" }),
    );
  });

  it("parses UPDATE", () => {
    const result = analyzeSql("UPDATE users SET name = 'test' WHERE id = 1");
    expect(result.operation).toBe("update");
    expect(result.tables).toContainEqual(
      expect.objectContaining({ table: "users", usage: "write" }),
    );
  });

  it("parses DELETE", () => {
    const result = analyzeSql("DELETE FROM old_records WHERE created_at < '2020-01-01'");
    expect(result.operation).toBe("delete");
    expect(result.tables).toContainEqual(
      expect.objectContaining({ table: "old_records", usage: "write" }),
    );
  });

  it("detects upsert with ON CONFLICT", () => {
    const result = analyzeSql(`
      INSERT INTO users (id, name)
      VALUES (1, 'test')
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `);
    expect(result.operation).toBe("upsert");
  });

  it("parses CTE (WITH clause)", () => {
    const result = analyzeSql(`
      WITH active_users AS (
        SELECT * FROM users WHERE active = true
      )
      SELECT * FROM active_users
    `);
    expect(result.ctes.length).toBeGreaterThan(0);
    expect(result.ctes[0].name).toBe("active_users");
  });

  it("handles INSERT ... SELECT", () => {
    const result = analyzeSql(`
      INSERT INTO archive
      SELECT * FROM orders WHERE status = 'completed'
    `);
    expect(result.operation).toBe("insert");
    expect(result.tables).toContainEqual(
      expect.objectContaining({ table: "archive", usage: "write" }),
    );
    expect(result.tables).toContainEqual(
      expect.objectContaining({ table: "orders", usage: "read" }),
    );
  });

  it("handles subquery in WHERE", () => {
    const result = analyzeSql(`
      SELECT * FROM orders
      WHERE user_id IN (SELECT id FROM users WHERE premium = true)
    `);
    expect(result.tables).toContainEqual(expect.objectContaining({ table: "orders" }));
    expect(result.tables).toContainEqual(expect.objectContaining({ table: "users" }));
  });

  it("falls back to regex for invalid SQL", () => {
    const result = analyzeSql("SELECT * FROM users WHERE id = ${userId}");
    expect(result.tables).toContainEqual(expect.objectContaining({ table: "users" }));
  });
});
