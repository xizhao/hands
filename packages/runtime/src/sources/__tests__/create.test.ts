/**
 * Integration Tests for Source Creation
 *
 * Tests the full source creation flow with real PGlite instances.
 */

import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import {
  createSource,
  generateCreateTableDDL,
  generateSourceFile,
  type TableIntrospection,
} from "../create";
import { createEmptyTestDb, createTestDb } from "./test-db";

describe("generateCreateTableDDL", () => {
  test("generates DDL for simple table", () => {
    const table: TableIntrospection = {
      name: "users",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, isPrimaryKey: true },
        { name: "name", type: "VARCHAR", nullable: false, isPrimaryKey: false },
        { name: "email", type: "VARCHAR", nullable: true, isPrimaryKey: false },
      ],
      primaryKey: ["id"],
    };

    const ddl = generateCreateTableDDL(table);

    expect(ddl).toContain("CREATE TABLE IF NOT EXISTS users");
    expect(ddl).toContain("id INTEGER NOT NULL");
    expect(ddl).toContain("name VARCHAR NOT NULL");
    expect(ddl).toContain("email VARCHAR");
    expect(ddl).toContain("PRIMARY KEY (id)");
  });

  test("includes default values", () => {
    const table: TableIntrospection = {
      name: "settings",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, isPrimaryKey: true },
        {
          name: "enabled",
          type: "BOOLEAN",
          nullable: false,
          defaultValue: "true",
          isPrimaryKey: false,
        },
        {
          name: "count",
          type: "INTEGER",
          nullable: false,
          defaultValue: "0",
          isPrimaryKey: false,
        },
      ],
      primaryKey: ["id"],
    };

    const ddl = generateCreateTableDDL(table);

    expect(ddl).toContain("enabled BOOLEAN NOT NULL DEFAULT true");
    expect(ddl).toContain("count INTEGER NOT NULL DEFAULT 0");
  });

  test("handles composite primary keys", () => {
    const table: TableIntrospection = {
      name: "order_items",
      columns: [
        { name: "order_id", type: "INTEGER", nullable: false, isPrimaryKey: true },
        { name: "product_id", type: "INTEGER", nullable: false, isPrimaryKey: true },
        { name: "quantity", type: "INTEGER", nullable: false, isPrimaryKey: false },
      ],
      primaryKey: ["order_id", "product_id"],
    };

    const ddl = generateCreateTableDDL(table);

    expect(ddl).toContain("PRIMARY KEY (order_id, product_id)");
  });

  test("handles various Postgres types", () => {
    const table: TableIntrospection = {
      name: "mixed_types",
      columns: [
        { name: "id", type: "SERIAL", nullable: false, isPrimaryKey: true },
        { name: "data", type: "JSONB", nullable: true, isPrimaryKey: false },
        { name: "created_at", type: "TIMESTAMPTZ", nullable: false, isPrimaryKey: false },
        { name: "price", type: "DECIMAL(10,2)", nullable: true, isPrimaryKey: false },
        { name: "tags", type: "TEXT[]", nullable: true, isPrimaryKey: false },
      ],
      primaryKey: ["id"],
    };

    const ddl = generateCreateTableDDL(table);

    expect(ddl).toContain("data JSONB");
    expect(ddl).toContain("created_at TIMESTAMPTZ NOT NULL");
    expect(ddl).toContain("price DECIMAL(10,2)");
    expect(ddl).toContain("tags TEXT[]");
  });
});

describe("generateSourceFile", () => {
  test("generates local-only source file", () => {
    const content = generateSourceFile({
      name: "scratch",
      description: "Local scratch data",
      tables: ["notes", "tasks"],
      hasSubscription: false,
    });

    expect(content).toContain('name: "scratch"');
    expect(content).toContain("Local-only");
    expect(content).toContain("notes:");
    expect(content).toContain("tasks:");
    expect(content).not.toContain("ELECTRIC_URL");
    expect(content).not.toContain("subscription:");
  });

  test("generates synced source with Electric-SQL subscriptions", () => {
    const content = generateSourceFile({
      name: "crm",
      description: "CRM data from production",
      tables: ["contacts", "deals", "activities"],
      hasSubscription: true,
    });

    expect(content).toContain('name: "crm"');
    expect(content).toContain("Electric-SQL");
    expect(content).toContain("subscription:");
    expect(content).toContain("process.env.ELECTRIC_URL");
    expect(content).toContain('table: "contacts"');
    expect(content).toContain('table: "deals"');
    expect(content).toContain('table: "activities"');
  });

  test("includes WHERE clause in subscriptions", () => {
    const content = generateSourceFile({
      name: "tenant_data",
      tables: ["orders"],
      hasSubscription: true,
      where: "tenant_id = 'acme'",
    });

    expect(content).toContain("where: \"tenant_id = 'acme'\"");
  });

  test("includes custom description", () => {
    const content = generateSourceFile({
      name: "analytics",
      description: "Analytics data warehouse sync",
      tables: ["events"],
      hasSubscription: true,
    });

    expect(content).toContain('description: "Analytics data warehouse sync"');
  });
});

describe("createSource - local sources", () => {
  let db: PGlite;
  let workbookDir: string;

  beforeEach(async () => {
    db = await createEmptyTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-create-test-"));
  });

  afterEach(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("creates local-only source directory and file", async () => {
    const result = await createSource(workbookDir, db, {
      name: "scratch",
      description: "Local scratch tables",
    });

    expect(result.success).toBe(true);
    expect(result.sourcePath).toBe(join(workbookDir, "sources", "scratch"));

    // Check directory was created
    expect(existsSync(result.sourcePath!)).toBe(true);

    // Check source.ts was created with correct content
    const sourceFile = join(result.sourcePath!, "source.ts");
    expect(existsSync(sourceFile)).toBe(true);

    const content = readFileSync(sourceFile, "utf-8");
    expect(content).toContain('name: "scratch"');
    expect(content).toContain("Local-only");
    expect(content).toContain('description: "Local scratch tables"');
  });

  test("creates source with existing tables", async () => {
    // Create tables in DB first
    await db.exec(`
      CREATE TABLE my_notes (id SERIAL PRIMARY KEY, content TEXT);
      CREATE TABLE my_tasks (id SERIAL PRIMARY KEY, title TEXT);
    `);

    const result = await createSource(workbookDir, db, {
      name: "myapp",
      tables: ["my_notes", "my_tasks"],
    });

    expect(result.success).toBe(true);

    const content = readFileSync(join(result.sourcePath!, "source.ts"), "utf-8");
    expect(content).toContain("my_notes:");
    expect(content).toContain("my_tasks:");
  });

  test("rejects source with non-existent tables", async () => {
    const result = await createSource(workbookDir, db, {
      name: "bad",
      tables: ["does_not_exist"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("does_not_exist");
    expect(result.error).toContain("does not exist");
  });
});

describe("createSource - validation", () => {
  let db: PGlite;
  let workbookDir: string;

  beforeEach(async () => {
    db = await createEmptyTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-validate-test-"));
  });

  afterEach(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("accepts valid lowercase names", async () => {
    const validNames = ["mydata", "my-data", "my_data", "data123", "a"];

    for (const name of validNames) {
      const result = await createSource(workbookDir, db, { name });
      expect(result.success).toBe(true);
    }
  });

  test("rejects uppercase names", async () => {
    const result = await createSource(workbookDir, db, { name: "MyData" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("lowercase");
  });

  test("rejects names starting with numbers", async () => {
    const result = await createSource(workbookDir, db, { name: "123data" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("lowercase letter");
  });

  test("rejects names with spaces", async () => {
    const result = await createSource(workbookDir, db, { name: "my data" });

    expect(result.success).toBe(false);
  });

  test("rejects duplicate source names", async () => {
    await createSource(workbookDir, db, { name: "unique" });
    const result = await createSource(workbookDir, db, { name: "unique" });

    expect(result.success).toBe(false);
    expect(result.error).toContain("already exists");
  });

  test("requires tables when using --from", async () => {
    const result = await createSource(workbookDir, db, {
      name: "external",
      from: "postgres://localhost:5432/db",
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("--tables");
  });
});

describe("createSource - with real test data", () => {
  let db: PGlite;
  let workbookDir: string;

  beforeEach(async () => {
    db = await createTestDb(); // Uses full test schema and data
    workbookDir = mkdtempSync(join(tmpdir(), "hands-realdata-test-"));
  });

  afterEach(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("creates source referencing existing tables", async () => {
    const result = await createSource(workbookDir, db, {
      name: "app",
      description: "Main application data",
      tables: ["users", "organizations", "projects"],
    });

    expect(result.success).toBe(true);

    const content = readFileSync(join(result.sourcePath!, "source.ts"), "utf-8");
    expect(content).toContain("users:");
    expect(content).toContain("organizations:");
    expect(content).toContain("projects:");
  });

  test("can verify tables exist after source creation", async () => {
    await createSource(workbookDir, db, {
      name: "tasks",
      tables: ["tasks", "comments"],
    });

    // Tables should still have their data
    const tasks = await db.query("SELECT COUNT(*) as count FROM tasks");
    expect(Number((tasks.rows[0] as any).count)).toBe(10);

    const comments = await db.query("SELECT COUNT(*) as count FROM comments");
    expect(Number((comments.rows[0] as any).count)).toBe(7);
  });
});

describe("DDL execution with real database", () => {
  let db: PGlite;

  beforeEach(async () => {
    db = new PGlite();
  });

  afterEach(async () => {
    await db.close();
  });

  test("generated DDL creates valid table in PGlite", async () => {
    const table: TableIntrospection = {
      name: "test_products",
      columns: [
        { name: "id", type: "SERIAL", nullable: false, isPrimaryKey: true },
        { name: "name", type: "VARCHAR(255)", nullable: false, isPrimaryKey: false },
        { name: "price", type: "DECIMAL(10,2)", nullable: false, isPrimaryKey: false },
        {
          name: "active",
          type: "BOOLEAN",
          nullable: false,
          defaultValue: "true",
          isPrimaryKey: false,
        },
        { name: "metadata", type: "JSONB", nullable: true, isPrimaryKey: false },
      ],
      primaryKey: ["id"],
    };

    const ddl = generateCreateTableDDL(table);
    await db.exec(ddl);

    // Insert data
    await db.exec(`
      INSERT INTO test_products (name, price, metadata)
      VALUES ('Widget', 19.99, '{"color": "red"}')
    `);

    // Query it back
    const result = await db.query<{
      id: number;
      name: string;
      price: string;
      active: boolean;
      metadata: object;
    }>("SELECT * FROM test_products");

    expect(result.rows.length).toBe(1);
    expect(result.rows[0].name).toBe("Widget");
    expect(result.rows[0].active).toBe(true);
    expect(result.rows[0].metadata).toEqual({ color: "red" });
  });

  test("generated DDL handles all common Postgres types", async () => {
    const table: TableIntrospection = {
      name: "all_types",
      columns: [
        { name: "id", type: "INTEGER", nullable: false, isPrimaryKey: true },
        { name: "small_num", type: "SMALLINT", nullable: true, isPrimaryKey: false },
        { name: "big_num", type: "BIGINT", nullable: true, isPrimaryKey: false },
        { name: "float_num", type: "REAL", nullable: true, isPrimaryKey: false },
        { name: "double_num", type: "DOUBLE PRECISION", nullable: true, isPrimaryKey: false },
        { name: "text_val", type: "TEXT", nullable: true, isPrimaryKey: false },
        { name: "bool_val", type: "BOOLEAN", nullable: true, isPrimaryKey: false },
        { name: "date_val", type: "DATE", nullable: true, isPrimaryKey: false },
        { name: "time_val", type: "TIME", nullable: true, isPrimaryKey: false },
        { name: "ts_val", type: "TIMESTAMP", nullable: true, isPrimaryKey: false },
        { name: "tstz_val", type: "TIMESTAMPTZ", nullable: true, isPrimaryKey: false },
        { name: "json_val", type: "JSONB", nullable: true, isPrimaryKey: false },
        { name: "uuid_val", type: "UUID", nullable: true, isPrimaryKey: false },
      ],
      primaryKey: ["id"],
    };

    const ddl = generateCreateTableDDL(table);

    // Should not throw
    await db.exec(ddl);

    // Verify table was created
    const result = await db.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'all_types'
      ORDER BY ordinal_position
    `);

    expect(result.rows.length).toBe(13);
  });
});
