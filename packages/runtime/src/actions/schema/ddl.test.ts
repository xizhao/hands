import type { SchemaTable } from "@hands/core/primitives";
import { describe, expect, it } from "vitest";
import { generateCreateTable, generateCreateTables } from "./ddl";

describe("generateCreateTable", () => {
  it("generates basic table", () => {
    const table: SchemaTable = {
      name: "users",
      columns: [
        { name: "id", type: "TEXT" },
        { name: "email", type: "TEXT" },
      ],
    };

    const sql = generateCreateTable(table);

    expect(sql).toBe(`CREATE TABLE IF NOT EXISTS "users" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL
);`);
  });

  it("handles optional columns", () => {
    const table: SchemaTable = {
      name: "users",
      columns: [
        { name: "id", type: "TEXT" },
        { name: "nickname", type: "TEXT", optional: true },
      ],
    };

    const sql = generateCreateTable(table);

    expect(sql).toContain('"id" TEXT NOT NULL');
    expect(sql).toContain('"nickname" TEXT');
    expect(sql).not.toContain('"nickname" TEXT NOT NULL');
  });

  it("adds primary key constraint", () => {
    const table: SchemaTable = {
      name: "users",
      columns: [
        { name: "id", type: "TEXT" },
        { name: "email", type: "TEXT" },
      ],
      primaryKey: ["id"],
    };

    const sql = generateCreateTable(table);

    expect(sql).toContain('PRIMARY KEY ("id")');
  });

  it("handles composite primary key", () => {
    const table: SchemaTable = {
      name: "order_items",
      columns: [
        { name: "order_id", type: "TEXT" },
        { name: "product_id", type: "TEXT" },
        { name: "quantity", type: "INTEGER" },
      ],
      primaryKey: ["order_id", "product_id"],
    };

    const sql = generateCreateTable(table);

    expect(sql).toContain('PRIMARY KEY ("order_id", "product_id")');
  });

  it("maps all column types correctly", () => {
    const table: SchemaTable = {
      name: "test",
      columns: [
        { name: "text_col", type: "TEXT" },
        { name: "int_col", type: "INTEGER" },
        { name: "real_col", type: "REAL" },
        { name: "bool_col", type: "BOOLEAN" },
        { name: "ts_col", type: "TIMESTAMP" },
        { name: "json_col", type: "JSON" },
      ],
    };

    const sql = generateCreateTable(table);

    expect(sql).toContain('"text_col" TEXT');
    expect(sql).toContain('"int_col" INTEGER');
    expect(sql).toContain('"real_col" REAL');
    expect(sql).toContain('"bool_col" INTEGER'); // SQLite uses 0/1
    expect(sql).toContain('"ts_col" TEXT'); // SQLite stores as ISO string
    expect(sql).toContain('"json_col" TEXT'); // SQLite stores as JSON string
  });
});

describe("generateCreateTables", () => {
  it("generates multiple tables", () => {
    const tables: SchemaTable[] = [
      {
        name: "users",
        columns: [{ name: "id", type: "TEXT" }],
        primaryKey: ["id"],
      },
      {
        name: "orders",
        columns: [{ name: "id", type: "TEXT" }],
        primaryKey: ["id"],
      },
    ];

    const sqls = generateCreateTables(tables);

    expect(sqls).toHaveLength(2);
    expect(sqls[0]).toContain('CREATE TABLE IF NOT EXISTS "users"');
    expect(sqls[1]).toContain('CREATE TABLE IF NOT EXISTS "orders"');
  });
});
