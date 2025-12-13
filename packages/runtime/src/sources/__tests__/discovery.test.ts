/**
 * Integration Tests for Source Discovery
 *
 * Uses real PGlite instances with realistic schema and data.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import type { PGlite } from "@electric-sql/pglite";
import { getOrphanTables, introspectTables } from "../discovery";
import { createTestDb, EXPECTED_COUNTS, EXPECTED_TABLES } from "./test-db";

describe("introspectTables", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  test("discovers all tables in database", async () => {
    const tables = await introspectTables(db);
    const tableNames = tables.map((t) => t.name).sort();

    expect(tableNames).toEqual(EXPECTED_TABLES.sort());
  });

  test("introspects users table schema correctly", async () => {
    const tables = await introspectTables(db);
    const users = tables.find((t) => t.name === "users")!;

    expect(users).toBeDefined();
    expect(users.schema.primaryKey).toEqual(["id"]);

    // Check column count
    expect(users.schema.columns.length).toBe(8);

    // Check specific columns
    const columns = new Map(users.schema.columns.map((c) => [c.name, c]));

    expect(columns.get("id")?.isPrimaryKey).toBe(true);
    expect(columns.get("id")?.type).toContain("integer");

    expect(columns.get("email")?.nullable).toBe(false);
    expect(columns.get("email")?.type).toContain("character varying");

    expect(columns.get("active")?.nullable).toBe(true);
    expect(columns.get("active")?.type).toBe("boolean");

    expect(columns.get("metadata")?.type).toBe("jsonb");

    expect(columns.get("created_at")?.type).toContain("timestamp");
  });

  test("introspects tasks table with foreign keys", async () => {
    const tables = await introspectTables(db);
    const tasks = tables.find((t) => t.name === "tasks")!;

    expect(tasks).toBeDefined();
    expect(tasks.schema.columns.length).toBe(11);

    const columns = new Map(tasks.schema.columns.map((c) => [c.name, c]));

    // Foreign key columns exist
    expect(columns.get("project_id")).toBeDefined();
    expect(columns.get("assignee_id")).toBeDefined();

    // Nullable FK (assignee can be null)
    expect(columns.get("assignee_id")?.nullable).toBe(true);

    // Non-nullable FK
    expect(columns.get("project_id")?.nullable).toBe(false);
  });

  test("introspects join table with composite unique constraint", async () => {
    const tables = await introspectTables(db);
    const orgMembers = tables.find((t) => t.name === "org_members")!;

    expect(orgMembers).toBeDefined();

    const columns = new Map(orgMembers.schema.columns.map((c) => [c.name, c]));

    expect(columns.get("org_id")?.nullable).toBe(false);
    expect(columns.get("user_id")?.nullable).toBe(false);
  });

  test("detects default values", async () => {
    const tables = await introspectTables(db);
    const users = tables.find((t) => t.name === "users")!;

    const activeCol = users.schema.columns.find((c) => c.name === "active")!;
    expect(activeCol.defaultValue).toContain("true");

    const roleCol = users.schema.columns.find((c) => c.name === "role")!;
    expect(roleCol.defaultValue).toContain("user");
  });
});

describe("getOrphanTables", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  test("returns all tables when no sources defined", async () => {
    const orphans = await getOrphanTables(db, []);

    expect(orphans.length).toBe(EXPECTED_TABLES.length);
  });

  test("excludes tables claimed by sources", async () => {
    const sources = [
      {
        id: "crm",
        path: "/fake",
        definition: { name: "crm" },
        tables: [
          { name: "users", source: "crm", schema: { columns: [] } },
          { name: "organizations", source: "crm", schema: { columns: [] } },
          { name: "org_members", source: "crm", schema: { columns: [] } },
        ],
      },
    ];

    const orphans = await getOrphanTables(db, sources);

    expect(orphans.length).toBe(3); // projects, tasks, comments
    expect(orphans.map((t) => t.name).sort()).toEqual(["comments", "projects", "tasks"]);
  });

  test("returns empty when all tables claimed", async () => {
    const sources = [
      {
        id: "app",
        path: "/fake",
        definition: { name: "app" },
        tables: EXPECTED_TABLES.map((name) => ({
          name,
          source: "app",
          schema: { columns: [] },
        })),
      },
    ];

    const orphans = await getOrphanTables(db, sources);

    expect(orphans.length).toBe(0);
  });

  test("handles multiple sources", async () => {
    const sources = [
      {
        id: "users",
        path: "/fake",
        definition: { name: "users" },
        tables: [
          { name: "users", source: "users", schema: { columns: [] } },
          { name: "org_members", source: "users", schema: { columns: [] } },
        ],
      },
      {
        id: "projects",
        path: "/fake",
        definition: { name: "projects" },
        tables: [
          { name: "projects", source: "projects", schema: { columns: [] } },
          { name: "tasks", source: "projects", schema: { columns: [] } },
        ],
      },
    ];

    const orphans = await getOrphanTables(db, sources);

    expect(orphans.length).toBe(2); // organizations, comments
    expect(orphans.map((t) => t.name).sort()).toEqual(["comments", "organizations"]);
  });
});

describe("table data verification", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = await createTestDb();
  });

  afterAll(async () => {
    await db.close();
  });

  test("seed data is correctly loaded", async () => {
    for (const [table, count] of Object.entries(EXPECTED_COUNTS)) {
      const result = await db.query<{ count: string }>(`SELECT COUNT(*) as count FROM ${table}`);
      expect(Number(result.rows[0].count)).toBe(count);
    }
  });

  test("foreign key relationships are valid", async () => {
    // All tasks have valid project_id
    const invalidTasks = await db.query(`
      SELECT t.id FROM tasks t
      LEFT JOIN projects p ON t.project_id = p.id
      WHERE p.id IS NULL
    `);
    expect(invalidTasks.rows.length).toBe(0);

    // All comments have valid task_id
    const invalidComments = await db.query(`
      SELECT c.id FROM comments c
      LEFT JOIN tasks t ON c.task_id = t.id
      WHERE t.id IS NULL
    `);
    expect(invalidComments.rows.length).toBe(0);

    // All org_members have valid org_id and user_id
    const invalidMembers = await db.query(`
      SELECT om.id FROM org_members om
      LEFT JOIN organizations o ON om.org_id = o.id
      LEFT JOIN users u ON om.user_id = u.id
      WHERE o.id IS NULL OR u.id IS NULL
    `);
    expect(invalidMembers.rows.length).toBe(0);
  });

  test("JSONB data is queryable", async () => {
    // Query users with dark theme
    const darkThemeUsers = await db.query<{ name: string }>(`
      SELECT name FROM users
      WHERE metadata->>'theme' = 'dark'
    `);
    expect(darkThemeUsers.rows.length).toBe(1);
    expect(darkThemeUsers.rows[0].name).toBe("Alice Johnson");

    // Query orgs with specific features
    const orgsWithApi = await db.query<{ name: string }>(`
      SELECT name FROM organizations
      WHERE settings->'features' ? 'api'
    `);
    expect(orgsWithApi.rows.length).toBe(1);
    expect(orgsWithApi.rows[0].name).toBe("Acme Corp");
  });
});
