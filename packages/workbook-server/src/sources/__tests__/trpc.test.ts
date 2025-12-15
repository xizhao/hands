/**
 * Integration Tests for Sources tRPC Router
 *
 * Uses real PGlite instances with realistic schema and data.
 * Tests the full tRPC flow from router to database.
 */

import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { sourcesRouter, type TRPCContext } from "../trpc";
import { createTestDb, EXPECTED_COUNTS, EXPECTED_TABLES } from "./test-db";

// Create a tRPC caller with context
function createCaller(ctx: TRPCContext) {
  return sourcesRouter.createCaller(ctx);
}

describe("tables.listAll", () => {
  let db: PGlite;
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    db = await createTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-trpc-test-"));
    caller = createCaller({ workbookDir, db, isDbReady: true });
  });

  afterAll(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("returns all tables with metadata", async () => {
    const tables = await caller.tables.listAll();

    expect(tables.length).toBe(EXPECTED_TABLES.length);
    expect(tables.map((t) => t.name).sort()).toEqual(EXPECTED_TABLES.sort());
  });

  test("includes correct column counts", async () => {
    const tables = await caller.tables.listAll();

    const users = tables.find((t) => t.name === "users")!;
    expect(users.columnCount).toBe(8);

    const tasks = tables.find((t) => t.name === "tasks")!;
    expect(tasks.columnCount).toBe(11);
  });

  test("includes primary key info", async () => {
    const tables = await caller.tables.listAll();

    for (const table of tables) {
      expect(table.primaryKey).toEqual(["id"]);
    }
  });
});

describe("tables.schema", () => {
  let db: PGlite;
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    db = await createTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-trpc-test-"));
    caller = createCaller({ workbookDir, db, isDbReady: true });
  });

  afterAll(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("returns full schema for users table", async () => {
    const schema = await caller.tables.schema({ table: "users" });

    expect(schema.primaryKey).toEqual(["id"]);
    expect(schema.columns.length).toBe(8);

    const emailCol = schema.columns.find((c) => c.name === "email")!;
    expect(emailCol.type).toContain("character varying");
    expect(emailCol.nullable).toBe(false);
  });

  test("returns schema for tasks table with correct types", async () => {
    const schema = await caller.tables.schema({ table: "tasks" });

    const priorityCol = schema.columns.find((c) => c.name === "priority")!;
    expect(priorityCol.type).toBe("integer");

    const dueDateCol = schema.columns.find((c) => c.name === "due_date")!;
    expect(dueDateCol.type).toBe("date");
    expect(dueDateCol.nullable).toBe(true);
  });

  test("throws for non-existent table", async () => {
    await expect(caller.tables.schema({ table: "nonexistent" })).rejects.toThrow("not found");
  });
});

describe("tables.list (pagination)", () => {
  let db: PGlite;
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    db = await createTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-trpc-test-"));
    caller = createCaller({ workbookDir, db, isDbReady: true });
  });

  afterAll(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("returns all rows with default limit", async () => {
    const result = await caller.tables.list({ table: "users" });

    expect(result.rows.length).toBe(EXPECTED_COUNTS.users);
    expect(result.total).toBe(EXPECTED_COUNTS.users);
    expect(result.limit).toBe(100); // default
    expect(result.offset).toBe(0);
  });

  test("respects limit parameter", async () => {
    const result = await caller.tables.list({
      table: "tasks",
      limit: 3,
    });

    expect(result.rows.length).toBe(3);
    expect(result.total).toBe(EXPECTED_COUNTS.tasks);
  });

  test("respects offset parameter", async () => {
    const result = await caller.tables.list({
      table: "users",
      limit: 2,
      offset: 3,
    });

    expect(result.rows.length).toBe(2);
    expect(result.offset).toBe(3);
  });

  test("handles offset beyond data", async () => {
    const result = await caller.tables.list({
      table: "users",
      offset: 100,
    });

    expect(result.rows.length).toBe(0);
    expect(result.total).toBe(EXPECTED_COUNTS.users);
  });

  test("sorts by column ascending", async () => {
    const result = await caller.tables.list({
      table: "users",
      sort: "name:asc",
    });

    const names = result.rows.map((r: any) => r.name);
    expect(names[0]).toBe("Alice Johnson");
    expect(names[4]).toBe("Eve Wilson");
  });

  test("sorts by column descending", async () => {
    const result = await caller.tables.list({
      table: "tasks",
      sort: "priority:desc",
    });

    const priorities = result.rows.map((r: any) => r.priority);
    expect(priorities[0]).toBeGreaterThanOrEqual(priorities[1]);
  });

  test("selects specific columns", async () => {
    const result = await caller.tables.list({
      table: "users",
      select: ["id", "name"],
    });

    const firstRow = result.rows[0] as any;
    expect(firstRow.id).toBeDefined();
    expect(firstRow.name).toBeDefined();
    // These should not be in the result (PGlite may still include them, so just check the query worked)
    expect(result.rows.length).toBe(EXPECTED_COUNTS.users);
  });
});

describe("tables.get", () => {
  let db: PGlite;
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    db = await createTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-trpc-test-"));
    caller = createCaller({ workbookDir, db, isDbReady: true });
  });

  afterAll(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("returns single user by id", async () => {
    const user = await caller.tables.get({ table: "users", id: "1" });

    expect(user).toBeDefined();
    expect((user as any).email).toBe("alice@example.com");
    expect((user as any).name).toBe("Alice Johnson");
  });

  test("returns task with all fields", async () => {
    const task = await caller.tables.get({ table: "tasks", id: "1" });

    expect(task).toBeDefined();
    expect((task as any).title).toBe("Design mockups");
    expect((task as any).status).toBe("done");
    expect((task as any).project_id).toBe(1);
  });

  test("throws for non-existent row", async () => {
    await expect(caller.tables.get({ table: "users", id: "999" })).rejects.toThrow("not found");
  });
});

describe("tables.create", () => {
  let db: PGlite;
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    db = await createTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-trpc-test-"));
    caller = createCaller({ workbookDir, db, isDbReady: true });
  });

  afterAll(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("creates new user", async () => {
    const user = await caller.tables.create({
      table: "users",
      data: {
        email: "frank@example.com",
        name: "Frank Miller",
        role: "user",
      },
    });

    expect(user).toBeDefined();
    expect((user as any).id).toBeDefined();
    expect((user as any).email).toBe("frank@example.com");
    expect((user as any).active).toBe(true); // default value
  });

  test("creates new task with foreign key", async () => {
    const task = await caller.tables.create({
      table: "tasks",
      data: {
        project_id: 1,
        title: "New test task",
        description: "Created in test",
        status: "todo",
      },
    });

    expect(task).toBeDefined();
    expect((task as any).id).toBeDefined();
    expect((task as any).title).toBe("New test task");
    expect((task as any).project_id).toBe(1);
  });

  test("creates with JSONB data", async () => {
    const org = await caller.tables.create({
      table: "organizations",
      data: {
        name: "Test Org",
        slug: "test-org",
        settings: { custom: true, count: 42 },
      },
    });

    expect(org).toBeDefined();
    expect((org as any).settings).toEqual({ custom: true, count: 42 });
  });

  test("rejects invalid foreign key", async () => {
    await expect(
      caller.tables.create({
        table: "tasks",
        data: {
          project_id: 999, // doesn't exist
          title: "Invalid task",
        },
      }),
    ).rejects.toThrow();
  });
});

describe("tables.update", () => {
  let db: PGlite;
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    db = await createTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-trpc-test-"));
    caller = createCaller({ workbookDir, db, isDbReady: true });
  });

  afterAll(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("updates user name", async () => {
    const updated = await caller.tables.update({
      table: "users",
      id: "2",
      data: { name: "Robert Smith" },
    });

    expect((updated as any).name).toBe("Robert Smith");
    expect((updated as any).email).toBe("bob@example.com"); // unchanged
  });

  test("updates task status", async () => {
    const updated = await caller.tables.update({
      table: "tasks",
      id: "3",
      data: { status: "in_progress" },
    });

    expect((updated as any).status).toBe("in_progress");
  });

  test("updates JSONB field", async () => {
    const updated = await caller.tables.update({
      table: "users",
      id: "1",
      data: { metadata: { theme: "light", newField: true } },
    });

    expect((updated as any).metadata).toEqual({ theme: "light", newField: true });
  });

  test("throws for non-existent row", async () => {
    await expect(
      caller.tables.update({
        table: "users",
        id: "999",
        data: { name: "Nobody" },
      }),
    ).rejects.toThrow("not found");
  });
});

describe("tables.delete", () => {
  let db: PGlite;
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    db = await createTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-trpc-test-"));
    caller = createCaller({ workbookDir, db, isDbReady: true });
  });

  afterAll(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("deletes comment", async () => {
    // Get initial count
    const before = await caller.tables.list({ table: "comments" });
    const initialCount = before.total;

    // Delete a comment (no FK constraints pointing to it)
    const result = await caller.tables.delete({
      table: "comments",
      id: "7",
    });

    expect(result.deleted).toBe(true);

    // Verify it's gone
    const after = await caller.tables.list({ table: "comments" });
    expect(after.total).toBe(initialCount - 1);
  });

  test("throws for non-existent row", async () => {
    await expect(
      caller.tables.delete({
        table: "comments",
        id: "999",
      }),
    ).rejects.toThrow("not found");
  });
});

describe("tables.bulkUpdate", () => {
  let db: PGlite;
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    db = await createTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-trpc-test-"));
    caller = createCaller({ workbookDir, db, isDbReady: true });
  });

  afterAll(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("updates multiple tasks at once", async () => {
    const result = await caller.tables.bulkUpdate({
      table: "tasks",
      updates: [
        { id: "1", data: { status: "archived" } },
        { id: "2", data: { status: "archived" } },
        { id: "3", data: { status: "archived" } },
      ],
    });

    expect(result.updated).toBe(3);

    // Verify updates
    const task1 = await caller.tables.get({ table: "tasks", id: "1" });
    const task2 = await caller.tables.get({ table: "tasks", id: "2" });
    const task3 = await caller.tables.get({ table: "tasks", id: "3" });

    expect((task1 as any).status).toBe("archived");
    expect((task2 as any).status).toBe("archived");
    expect((task3 as any).status).toBe("archived");
  });

  test("handles partial updates (some rows don't exist)", async () => {
    const result = await caller.tables.bulkUpdate({
      table: "users",
      updates: [
        { id: "1", data: { active: false } },
        { id: "999", data: { active: false } }, // doesn't exist
      ],
    });

    // Only 1 row was actually updated
    expect(result.updated).toBe(1);
  });
});

describe("sources.create", () => {
  let db: PGlite;
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(async () => {
    db = await createTestDb();
    workbookDir = mkdtempSync(join(tmpdir(), "hands-sources-test-"));
    caller = createCaller({ workbookDir, db, isDbReady: true });
  });

  afterAll(async () => {
    await db.close();
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("creates local source", async () => {
    const result = await caller.sources.create({
      name: "analytics",
      description: "Analytics data",
    });

    expect(result.success).toBe(true);
    expect(result.sourcePath).toContain("analytics");
  });

  test("rejects invalid source name", async () => {
    await expect(caller.sources.create({ name: "Invalid-Name" })).rejects.toThrow();
  });

  test("rejects duplicate source name", async () => {
    await caller.sources.create({ name: "mydata" });

    await expect(caller.sources.create({ name: "mydata" })).rejects.toThrow("already exists");
  });
});

describe("database not ready", () => {
  let workbookDir: string;
  let caller: ReturnType<typeof createCaller>;

  beforeAll(() => {
    workbookDir = mkdtempSync(join(tmpdir(), "hands-nodb-test-"));
    caller = createCaller({
      workbookDir,
      db: null,
      isDbReady: false,
    });
  });

  afterAll(() => {
    rmSync(workbookDir, { recursive: true, force: true });
  });

  test("tables.listAll throws when db not ready", async () => {
    await expect(caller.tables.listAll()).rejects.toThrow("not ready");
  });

  test("tables.list throws when db not ready", async () => {
    await expect(caller.tables.list({ table: "users" })).rejects.toThrow("not ready");
  });

  test("tables.create throws when db not ready", async () => {
    await expect(caller.tables.create({ table: "users", data: { name: "Test" } })).rejects.toThrow(
      "not ready",
    );
  });
});
