import { describe, expect, test, mock } from "bun:test";
import {
  createToolRegistry,
  createSqlQueryTool,
  createSqlSchemaTool,
  createCodeExecuteTool,
  ALL_TOOLS,
  DATA_TOOLS,
  CONTENT_TOOLS,
  type DatabaseContext,
  type ToolContext,
} from "../tools";

// Mock database context
const createMockDb = (): DatabaseContext => ({
  query: mock(() => [{ id: 1, name: "test" }]),
  execute: mock(() => {}),
  getSchema: mock(() => [
    {
      table_name: "users",
      columns: [
        { name: "id", type: "INTEGER", nullable: false },
        { name: "name", type: "TEXT", nullable: true },
      ],
    },
  ]),
  notifyChange: mock(() => {}),
  getPages: mock(async () => [{ path: "index.mdx", title: "Home" }]),
  getPage: mock(async () => ({ content: "# Hello", title: "Test" })),
  savePage: mock(async () => {}),
});

describe("tools", () => {
  describe("createToolRegistry", () => {
    test("creates registry with all tools", () => {
      const ctx: ToolContext = { db: createMockDb() };
      const registry = createToolRegistry(ctx);

      expect(Object.keys(registry.tools)).toHaveLength(ALL_TOOLS.length);
      ALL_TOOLS.forEach((toolId) => {
        expect(registry.tools[toolId]).toBeDefined();
      });
    });

    test("getTools returns subset of tools", () => {
      const ctx: ToolContext = { db: createMockDb() };
      const registry = createToolRegistry(ctx);

      const dataTools = registry.getTools(DATA_TOOLS);
      expect(Object.keys(dataTools)).toHaveLength(DATA_TOOLS.length);

      const contentTools = registry.getTools(CONTENT_TOOLS);
      expect(Object.keys(contentTools)).toHaveLength(CONTENT_TOOLS.length);
    });
  });

  describe("sql_query tool", () => {
    test("executes SELECT queries", async () => {
      const mockDb = createMockDb();
      const ctx: ToolContext = { db: mockDb };
      const tool = createSqlQueryTool(ctx);

      const result = await tool.execute({ sql: "SELECT * FROM users" });

      expect(mockDb.query).toHaveBeenCalledWith("SELECT * FROM users", undefined);
      expect(result).toEqual({
        rows: [{ id: 1, name: "test" }],
        rowCount: 1,
      });
    });

    test("rejects non-SELECT queries", async () => {
      const ctx: ToolContext = { db: createMockDb() };
      const tool = createSqlQueryTool(ctx);

      const result = await tool.execute({ sql: "DELETE FROM users" });

      expect(result).toEqual({
        error: "Only SELECT and PRAGMA queries allowed. Use sql_execute for mutations.",
      });
    });

    test("allows PRAGMA queries", async () => {
      const mockDb = createMockDb();
      const ctx: ToolContext = { db: mockDb };
      const tool = createSqlQueryTool(ctx);

      await tool.execute({ sql: "PRAGMA table_info(users)" });

      expect(mockDb.query).toHaveBeenCalled();
    });

    test("returns error when db not available", async () => {
      const ctx: ToolContext = {};
      const tool = createSqlQueryTool(ctx);

      const result = await tool.execute({ sql: "SELECT 1" });

      expect(result).toEqual({ error: "Database not available" });
    });
  });

  describe("sql_schema tool", () => {
    test("returns table schema", async () => {
      const mockDb = createMockDb();
      const ctx: ToolContext = { db: mockDb };
      const tool = createSqlSchemaTool(ctx);

      const result = await tool.execute({});

      expect(result).toEqual({
        tables: [
          {
            name: "users",
            columns: [
              { name: "id", type: "INTEGER", nullable: false },
              { name: "name", type: "TEXT", nullable: true },
            ],
          },
        ],
      });
    });
  });

  describe("code_execute tool", () => {
    test("executes JavaScript code", async () => {
      const ctx: ToolContext = {};
      const tool = createCodeExecuteTool(ctx);

      const result = await tool.execute({ code: "return 1 + 2" });

      expect(result).toEqual({ result: "3" });
    });

    test("captures console.log output", async () => {
      const ctx: ToolContext = {};
      const tool = createCodeExecuteTool(ctx);

      const result = await tool.execute({
        code: 'console.log("hello"); return 42',
      });

      expect(result).toEqual({
        result: "42",
        logs: ["hello"],
      });
    });

    test("returns error on syntax error", async () => {
      const ctx: ToolContext = {};
      const tool = createCodeExecuteTool(ctx);

      const result = await tool.execute({ code: "invalid syntax {{{" });

      expect(result).toHaveProperty("error");
    });
  });
});
