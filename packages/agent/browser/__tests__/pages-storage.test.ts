/**
 * Tests for pages-storage.ts
 */

import { describe, test, expect, mock } from "bun:test";
import { createPagesStorage } from "../pages-storage";
import type { DatabaseContext } from "../tools";

// Mock database context
const createMockDb = (): DatabaseContext => ({
  query: mock(async (sql: string) => {
    // Return empty for _pages queries (used by listPages)
    if (sql.includes("_pages")) {
      return [];
    }
    return [];
  }),
  execute: mock(async () => {}),
  getSchema: mock(() => [
    {
      table_name: "users",
      columns: [
        { name: "id", type: "INTEGER", nullable: false },
        { name: "name", type: "TEXT", nullable: true },
      ],
    },
    {
      table_name: "orders",
      columns: [
        { name: "id", type: "INTEGER", nullable: false },
        { name: "total", type: "REAL", nullable: true },
      ],
    },
  ]),
  notifyChange: mock(() => {}),
});

describe("pages-storage", () => {
  describe("validatePage", () => {
    test("returns valid for page without queries", async () => {
      const db = createMockDb();
      const storage = createPagesStorage(db);

      const result = await storage.validatePage!(`---
title: Simple Page
---

# Hello World

Just some text.
`);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.queryTests).toHaveLength(0);
    });

    test("tests LiveValue queries against database", async () => {
      const db = createMockDb();
      db.query = mock(async (sql: string) => {
        if (sql.includes("_pages")) return [];
        return [{ id: 1, name: "Test" }];
      });
      const storage = createPagesStorage(db);

      const result = await storage.validatePage!(`---
title: Dashboard
---

<LiveValue query="SELECT * FROM users" display="table" />
`);

      expect(result.valid).toBe(true);
      expect(result.queryTests).toHaveLength(1);
      expect(result.queryTests![0].success).toBe(true);
      expect(result.queryTests![0].rowCount).toBe(1);
    });

    test("captures query errors", async () => {
      const db = createMockDb();
      db.query = mock(async (sql: string) => {
        if (sql.includes("nonexistent")) {
          throw new Error("no such table: nonexistent");
        }
        return [];
      });
      const storage = createPagesStorage(db);

      const result = await storage.validatePage!(`---
title: Bad Dashboard
---

<LiveValue query="SELECT * FROM nonexistent" display="table" />
`);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors.some(e => e.message.includes("no such table"))).toBe(true);
      expect(result.queryTests).toHaveLength(1);
      expect(result.queryTests![0].success).toBe(false);
      expect(result.queryTests![0].error).toContain("no such table");
    });

    test("validates multiple queries", async () => {
      const db = createMockDb();
      let userQueryCount = 0;
      db.query = mock(async (sql: string) => {
        if (sql.includes("_pages")) return [];
        userQueryCount++;
        if (userQueryCount === 2) {
          throw new Error("syntax error");
        }
        return [{ count: 10 }];
      });
      const storage = createPagesStorage(db);

      const result = await storage.validatePage!(`---
title: Multi Query
---

<LiveValue query="SELECT COUNT(*) FROM users" display="inline" />
<LiveValue query="SELECT bad syntax" display="inline" />
<LiveValue query="SELECT COUNT(*) FROM orders" display="inline" />
`);

      expect(result.valid).toBe(false);
      expect(result.queryTests).toHaveLength(3);
      expect(result.queryTests![0].success).toBe(true);
      expect(result.queryTests![1].success).toBe(false);
      expect(result.queryTests![2].success).toBe(true);
    });

    test("validates MDX structure errors", async () => {
      const db = createMockDb();
      const storage = createPagesStorage(db);

      // Tab without Tabs parent
      const result = await storage.validatePage!(`---
title: Bad Structure
---

<Tab value="foo" label="Foo">Content</Tab>
`);

      // Should have structural error
      expect(result.errors.some(e => e.message.includes("must be inside"))).toBe(true);
    });
  });
});
