import { describe, expect, test, mock } from "bun:test";
import {
  createToolRegistry,
  createSqlTool,
  createSqlSchemaTool,
  createCodeExecuteTool,
  createListPagesTool,
  createReadPageTool,
  createWritePageTool,
  createDeletePageTool,
  createSearchPagesTool,
  createTaskTool,
  ALL_TOOLS,
  DATA_TOOLS,
  PAGE_TOOLS,
  type DatabaseContext,
  type PagesContext,
  type SubagentContext,
  type SubagentResult,
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
});

// Mock pages context
const createMockPages = (): PagesContext => ({
  listPages: mock(async () => [{ pageId: "index", title: "Home" }]),
  readPage: mock(async () => ({ content: "# Hello", title: "Test" })),
  writePage: mock(async () => {}),
  deletePage: mock(async () => {}),
});

// Mock subagent context
const createMockSubagent = (): SubagentContext => ({
  listAgents: mock(() => [
    { id: "coder", name: "Coder", description: "Write and refactor code", mode: "subagent" },
    { id: "researcher", name: "Researcher", description: "Research topics", mode: "subagent" },
    { id: "hands", name: "Hands", description: "Main agent", mode: "primary" },
  ]),
  spawn: mock(async (): Promise<SubagentResult> => ({
    sessionId: "session_child_123",
    text: "Task completed successfully. Created the requested file.",
    toolCalls: [
      { tool: "writePage", status: "completed", title: "Created new-page.mdx" },
    ],
  })),
});

describe("tools", () => {
  describe("createToolRegistry", () => {
    test("creates registry with all tools", () => {
      const ctx: ToolContext = { db: createMockDb(), pages: createMockPages() };
      const registry = createToolRegistry(ctx);

      expect(Object.keys(registry.tools)).toHaveLength(ALL_TOOLS.length);
      ALL_TOOLS.forEach((toolId) => {
        expect(registry.tools[toolId]).toBeDefined();
      });
    });

    test("getTools returns subset of tools", () => {
      const ctx: ToolContext = { db: createMockDb(), pages: createMockPages() };
      const registry = createToolRegistry(ctx);

      const dataTools = registry.getTools(DATA_TOOLS);
      expect(Object.keys(dataTools)).toHaveLength(DATA_TOOLS.length);

      const pageTools = registry.getTools(PAGE_TOOLS);
      expect(Object.keys(pageTools)).toHaveLength(PAGE_TOOLS.length);
    });
  });

  describe("sql tool (unified read/write)", () => {
    test("executes SELECT queries", async () => {
      const mockDb = createMockDb();
      const ctx: ToolContext = { db: mockDb };
      const tool = createSqlTool(ctx);

      const result = await tool.execute({ sql: "SELECT * FROM users" });

      expect(mockDb.query).toHaveBeenCalledWith("SELECT * FROM users", undefined);
      expect(result).toEqual({
        rows: [{ id: 1, name: "test" }],
        rowCount: 1,
      });
    });

    test("executes INSERT queries", async () => {
      const mockDb = createMockDb();
      const ctx: ToolContext = { db: mockDb };
      const tool = createSqlTool(ctx);

      const result = await tool.execute({ sql: "INSERT INTO users (name) VALUES ('test')" });

      expect(mockDb.execute).toHaveBeenCalledWith("INSERT INTO users (name) VALUES ('test')", undefined);
      expect(mockDb.notifyChange).toHaveBeenCalled();
      expect(result).toEqual({ success: true, message: "Query executed successfully" });
    });

    test("blocks destructive queries without confirmation", async () => {
      const mockDb = createMockDb();
      const ctx: ToolContext = { db: mockDb };
      const tool = createSqlTool(ctx);

      const result = await tool.execute({ sql: "DROP TABLE users" });

      expect(mockDb.execute).not.toHaveBeenCalled();
      expect(result).toHaveProperty("error", "Destructive operation detected");
    });

    test("allows destructive queries with confirmation", async () => {
      const mockDb = createMockDb();
      const ctx: ToolContext = { db: mockDb };
      const tool = createSqlTool(ctx);

      const result = await tool.execute({ sql: "DROP TABLE users", confirm_destructive: true });

      expect(mockDb.execute).toHaveBeenCalledWith("DROP TABLE users", undefined);
      expect(result).toEqual({ success: true, message: "Query executed successfully" });
    });

    test("allows PRAGMA queries", async () => {
      const mockDb = createMockDb();
      const ctx: ToolContext = { db: mockDb };
      const tool = createSqlTool(ctx);

      await tool.execute({ sql: "PRAGMA table_info(users)" });

      expect(mockDb.query).toHaveBeenCalled();
    });

    test("returns error when db not available", async () => {
      const ctx: ToolContext = {};
      const tool = createSqlTool(ctx);

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

  describe("page tools", () => {
    test("listPages returns pages", async () => {
      const mockPages = createMockPages();
      const ctx: ToolContext = { pages: mockPages };
      const tool = createListPagesTool(ctx);

      const result = await tool.execute({});

      expect(mockPages.listPages).toHaveBeenCalled();
      expect(result).toEqual({
        pages: [{ pageId: "index", title: "Home" }],
      });
    });

    test("readPage returns page content", async () => {
      const mockPages = createMockPages();
      const ctx: ToolContext = { pages: mockPages };
      const tool = createReadPageTool(ctx);

      const result = await tool.execute({ pageId: "index" });

      expect(mockPages.readPage).toHaveBeenCalledWith("index");
      expect(result).toEqual({
        pageId: "index",
        content: "# Hello",
        title: "Test",
      });
    });

    test("readPage returns error for missing page", async () => {
      const mockPages = createMockPages();
      mockPages.readPage = mock(async () => null);
      const ctx: ToolContext = { pages: mockPages };
      const tool = createReadPageTool(ctx);

      const result = await tool.execute({ pageId: "nonexistent" });

      expect(result).toEqual({ error: "Page not found: nonexistent" });
    });

    test("writePage creates page", async () => {
      const mockPages = createMockPages();
      const ctx: ToolContext = { pages: mockPages };
      const tool = createWritePageTool(ctx);

      const result = await tool.execute({
        pageId: "new-page",
        content: "---\ntitle: New\n---\n# New Page",
      });

      expect(mockPages.writePage).toHaveBeenCalledWith(
        "new-page",
        "---\ntitle: New\n---\n# New Page"
      );
      expect(result).toEqual({ success: true, pageId: "new-page" });
    });

    test("deletePage removes page", async () => {
      const mockPages = createMockPages();
      const ctx: ToolContext = { pages: mockPages };
      const tool = createDeletePageTool(ctx);

      const result = await tool.execute({ pageId: "old-page" });

      expect(mockPages.deletePage).toHaveBeenCalledWith("old-page");
      expect(result).toEqual({ success: true, pageId: "old-page" });
    });

    test("page tools return error when context not available", async () => {
      const ctx: ToolContext = {};

      const listTool = createListPagesTool(ctx);
      expect(await listTool.execute({})).toEqual({
        error: "Pages context not available",
      });

      const readTool = createReadPageTool(ctx);
      expect(await readTool.execute({ pageId: "test" })).toEqual({
        error: "Pages context not available",
      });

      const writeTool = createWritePageTool(ctx);
      expect(await writeTool.execute({ pageId: "test", content: "" })).toEqual({
        error: "Pages context not available",
      });

      const deleteTool = createDeletePageTool(ctx);
      expect(await deleteTool.execute({ pageId: "test" })).toEqual({
        error: "Pages context not available",
      });

      const searchTool = createSearchPagesTool(ctx);
      expect(await searchTool.execute({ query: "test" })).toEqual({
        error: "Pages context not available",
      });
    });

    test("searchPages finds matching content", async () => {
      const mockPages = createMockPages();
      mockPages.readPage = mock(async (pageId: string) => {
        if (pageId === "index") {
          return { content: "# Welcome\n\nThis page has some keywords here.", title: "Home" };
        }
        if (pageId === "about") {
          return { content: "# About\n\nNo match in this one.", title: "About" };
        }
        return null;
      });
      mockPages.listPages = mock(async () => [
        { pageId: "index", title: "Home" },
        { pageId: "about", title: "About" },
      ]);

      const ctx: ToolContext = { pages: mockPages };
      const tool = createSearchPagesTool(ctx);

      const result = await tool.execute({ query: "keywords" });

      expect(result).toEqual({
        query: "keywords",
        results: [
          {
            pageId: "index",
            title: "Home",
            matches: ["This page has some keywords here."],
          },
        ],
      });
    });

    test("searchPages uses optimized search when available", async () => {
      const mockPages = createMockPages();
      mockPages.searchPages = mock(async () => [
        { pageId: "found", title: "Found Page", matches: ["line with query"] },
      ]);

      const ctx: ToolContext = { pages: mockPages };
      const tool = createSearchPagesTool(ctx);

      const result = await tool.execute({ query: "test" });

      expect(mockPages.searchPages).toHaveBeenCalledWith("test");
      expect(result).toEqual({
        query: "test",
        results: [{ pageId: "found", title: "Found Page", matches: ["line with query"] }],
      });
    });

    test("searchPages returns all matching pages", async () => {
      const mockPages = createMockPages();
      mockPages.listPages = mock(async () =>
        Array.from({ length: 20 }, (_, i) => ({ pageId: `page-${i}`, title: `Page ${i}` }))
      );
      mockPages.readPage = mock(async (pageId: string) => ({
        content: `# ${pageId}\n\nThis has the keyword.`,
        title: pageId,
      }));

      const ctx: ToolContext = { pages: mockPages };
      const tool = createSearchPagesTool(ctx);

      const result = (await tool.execute({ query: "keyword" })) as { results: unknown[] };

      expect(result.results).toHaveLength(20);
    });
  });

  describe("task tool", () => {
    test("returns error when subagent context not available", async () => {
      const ctx: ToolContext = { sessionId: "session_123" };
      const tool = createTaskTool(ctx);

      const result = await tool.execute({
        description: "Test task",
        prompt: "Do something",
        subagent_type: "coder",
      });

      expect(result).toEqual({ error: "Subagent context not available" });
    });

    test("returns error when sessionId not available", async () => {
      const mockSubagent = createMockSubagent();
      const ctx: ToolContext = { subagent: mockSubagent };
      const tool = createTaskTool(ctx);

      const result = await tool.execute({
        description: "Test task",
        prompt: "Do something",
        subagent_type: "coder",
      });

      expect(result).toEqual({ error: "No session context - cannot spawn subagent" });
    });

    test("returns error for unknown agent", async () => {
      const mockSubagent = createMockSubagent();
      const ctx: ToolContext = {
        subagent: mockSubagent,
        sessionId: "session_123",
      };
      const tool = createTaskTool(ctx);

      const result = await tool.execute({
        description: "Test task",
        prompt: "Do something",
        subagent_type: "unknown_agent",
      });

      expect(result).toHaveProperty("error");
      expect((result as { error: string }).error).toContain("Unknown agent: unknown_agent");
      expect((result as { error: string }).error).toContain("coder");
      expect((result as { error: string }).error).toContain("researcher");
    });

    test("spawns subagent and returns formatted result", async () => {
      const mockSubagent = createMockSubagent();
      const ctx: ToolContext = {
        subagent: mockSubagent,
        sessionId: "session_parent_123",
      };
      const tool = createTaskTool(ctx);

      const result = await tool.execute({
        description: "Create a page",
        prompt: "Create a new page with hello world content",
        subagent_type: "coder",
      });

      expect(mockSubagent.spawn).toHaveBeenCalledWith({
        agentId: "coder",
        prompt: "Create a new page with hello world content",
        description: "Create a page",
        parentSessionId: "session_parent_123",
      });

      expect(result).toHaveProperty("title", "Create a page");
      expect(result).toHaveProperty("metadata");
      expect(result).toHaveProperty("output");

      const typedResult = result as { title: string; metadata: { sessionId: string; toolCalls: unknown[] }; output: string };
      expect(typedResult.metadata.sessionId).toBe("session_child_123");
      expect(typedResult.metadata.toolCalls).toHaveLength(1);
      expect(typedResult.output).toContain("Task completed successfully");
      expect(typedResult.output).toContain("session_child_123");
    });

    test("includes available agents in description", () => {
      const mockSubagent = createMockSubagent();
      const ctx: ToolContext = {
        subagent: mockSubagent,
        sessionId: "session_123",
      };
      const tool = createTaskTool(ctx);

      // Primary agents should be filtered out
      expect(tool.description).toContain("coder");
      expect(tool.description).toContain("researcher");
      expect(tool.description).not.toContain("hands"); // Primary agent filtered
    });

    test("handles spawn errors gracefully", async () => {
      const mockSubagent = createMockSubagent();
      mockSubagent.spawn = mock(async () => {
        throw new Error("Subagent execution failed");
      });

      const ctx: ToolContext = {
        subagent: mockSubagent,
        sessionId: "session_123",
      };
      const tool = createTaskTool(ctx);

      const result = await tool.execute({
        description: "Test task",
        prompt: "Do something that fails",
        subagent_type: "coder",
      });

      expect(result).toHaveProperty("error", "Subagent execution failed");
    });
  });
});
