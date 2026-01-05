/**
 * Browser Tool Registry
 *
 * Defines tools available to the agent in browser context.
 * Uses AI SDK's tool format for seamless integration.
 */

import { z } from "zod";

// ============================================================================
// Database Context Interface (implemented by consumers)
// ============================================================================

export interface DatabaseContext {
  /** Execute a read query */
  query: (sql: string, params?: unknown[]) => unknown[];
  /** Execute a mutation (INSERT/UPDATE/DELETE) */
  execute: (sql: string, params?: unknown[]) => void;
  /** Get current schema */
  getSchema: () => Array<{
    table_name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }>;
  /** Notify data change (for reactivity) */
  notifyChange: () => void;
  /** Get pages list */
  getPages: () => Promise<Array<{ path: string; title: string }>>;
  /** Get a page */
  getPage: (path: string) => Promise<{ content: string; title: string } | null>;
  /** Save a page */
  savePage: (path: string, content: string, title?: string) => Promise<void>;
}

// ============================================================================
// Tool Context (injected at runtime)
// ============================================================================

export interface ToolContext {
  /** Database context for SQL operations */
  db?: DatabaseContext;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
}

// ============================================================================
// Tool Definition Type (compatible with AI SDK)
// ============================================================================

export interface ToolDefinition {
  description: string;
  parameters: z.ZodTypeAny;
  execute: (args: unknown) => Promise<unknown>;
}

// ============================================================================
// SQL Tools
// ============================================================================

export function createSqlQueryTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Execute a read-only SQL query against the workbook database.
Returns rows as JSON. Use for SELECT queries and PRAGMA commands.
The database uses SQLite syntax.`,
    parameters: z.object({
      sql: z.string().describe("The SQL SELECT query to execute"),
      params: z.array(z.unknown()).optional().describe("Query parameters for prepared statement"),
    }),
    execute: async (args: unknown) => {
      const { sql, params } = args as { sql: string; params?: unknown[] };
      if (!ctx.db) {
        return { error: "Database not available" };
      }

      try {
        const upperSql = sql.trim().toUpperCase();
        if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("PRAGMA")) {
          return { error: "Only SELECT and PRAGMA queries allowed. Use sql_execute for mutations." };
        }

        const rows = ctx.db.query(sql, params);
        return {
          rows,
          rowCount: rows.length,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function createSqlExecuteTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Execute a SQL mutation (INSERT, UPDATE, DELETE, CREATE TABLE, etc.) against the workbook database.
Use this for any data modifications. The database uses SQLite syntax.`,
    parameters: z.object({
      sql: z.string().describe("The SQL statement to execute"),
      params: z.array(z.unknown()).optional().describe("Query parameters for prepared statement"),
    }),
    execute: async (args: unknown) => {
      const { sql, params } = args as { sql: string; params?: unknown[] };
      if (!ctx.db) {
        return { error: "Database not available" };
      }

      try {
        ctx.db.execute(sql, params);
        ctx.db.notifyChange();
        return { success: true, message: "Query executed successfully" };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function createSqlSchemaTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Get the database schema including all tables, columns, and their types.
Use this to understand the data structure before writing queries.`,
    parameters: z.object({}),
    execute: async () => {
      if (!ctx.db) {
        return { error: "Database not available" };
      }

      try {
        const schema = ctx.db.getSchema();
        return {
          tables: schema.map((t) => ({
            name: t.table_name,
            columns: t.columns.map((c) => ({
              name: c.name,
              type: c.type,
              nullable: c.nullable,
            })),
          })),
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

// ============================================================================
// Web Tools
// ============================================================================

export function createWebFetchTool(_ctx: ToolContext): ToolDefinition {
  return {
    description: `Fetch content from a URL. Returns the response body as text.
Useful for retrieving data from APIs or web pages.
Note: Subject to CORS restrictions in browser.`,
    parameters: z.object({
      url: z.string().url().describe("The URL to fetch"),
      method: z.enum(["GET", "POST", "PUT", "DELETE"]).optional().describe("HTTP method (default: GET)"),
      headers: z.record(z.string()).optional().describe("Request headers"),
      body: z.string().optional().describe("Request body for POST/PUT"),
    }),
    execute: async (args: unknown) => {
      const { url, method = "GET", headers, body } = args as {
        url: string;
        method?: string;
        headers?: Record<string, string>;
        body?: string;
      };

      try {
        const response = await fetch(url, {
          method,
          headers,
          body,
        });

        if (!response.ok) {
          return {
            error: `HTTP ${response.status}: ${response.statusText}`,
            status: response.status,
          };
        }

        const contentType = response.headers.get("content-type") || "";
        let data: unknown;

        if (contentType.includes("application/json")) {
          data = await response.json();
        } else {
          data = await response.text();
        }

        return {
          status: response.status,
          contentType,
          data,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

// ============================================================================
// Code Execution Tool
// ============================================================================

export function createCodeExecuteTool(_ctx: ToolContext): ToolDefinition {
  return {
    description: `Execute JavaScript code in a sandboxed environment.
The code runs in an isolated context with limited capabilities.
Returns the result of the last expression or explicit return value.
Available globals: console, JSON, Math, Date, Array, Object, String, Number, Boolean.`,
    parameters: z.object({
      code: z.string().describe("JavaScript code to execute"),
    }),
    execute: async (args: unknown) => {
      const { code } = args as { code: string };

      try {
        const logs: string[] = [];

        const sandbox = {
          console: {
            log: (...logArgs: unknown[]) => logs.push(logArgs.map(String).join(" ")),
            error: (...logArgs: unknown[]) => logs.push(`ERROR: ${logArgs.map(String).join(" ")}`),
            warn: (...logArgs: unknown[]) => logs.push(`WARN: ${logArgs.map(String).join(" ")}`),
          },
          JSON,
          Math,
          Date,
          Array,
          Object,
          String,
          Number,
          Boolean,
          parseInt,
          parseFloat,
          isNaN,
          isFinite,
        };

        const wrappedCode = `
          "use strict";
          return (function() {
            ${code}
          })();
        `;

        const fn = new Function(...Object.keys(sandbox), wrappedCode);
        const result = fn(...Object.values(sandbox));

        return {
          result: result !== undefined ? JSON.stringify(result, null, 2) : undefined,
          logs: logs.length > 0 ? logs : undefined,
        };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

// ============================================================================
// Page/Document Tools
// ============================================================================

export function createPageListTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `List all pages/documents in the workbook.
Returns paths and titles of MDX documents.`,
    parameters: z.object({}),
    execute: async () => {
      if (!ctx.db) {
        return { error: "Database not available" };
      }

      try {
        const pages = await ctx.db.getPages();
        return { pages };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function createPageReadTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Read the content of a page/document.
Returns the raw MDX source content.`,
    parameters: z.object({
      path: z.string().describe("Path to the page (e.g., 'index.mdx', 'about.mdx')"),
    }),
    execute: async (args: unknown) => {
      const { path } = args as { path: string };
      if (!ctx.db) {
        return { error: "Database not available" };
      }

      try {
        const page = await ctx.db.getPage(path);
        if (!page) {
          return { error: `Page not found: ${path}` };
        }
        return { path, content: page.content, title: page.title };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function createPageWriteTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Create or update a page/document.
Writes MDX content to the specified path.`,
    parameters: z.object({
      path: z.string().describe("Path to the page (e.g., 'index.mdx', 'about.mdx')"),
      content: z.string().describe("MDX content to write"),
      title: z.string().optional().describe("Page title (extracted from frontmatter if not provided)"),
    }),
    execute: async (args: unknown) => {
      const { path, content, title } = args as { path: string; content: string; title?: string };
      if (!ctx.db) {
        return { error: "Database not available" };
      }

      try {
        await ctx.db.savePage(path, content, title);
        return { success: true, path };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

// ============================================================================
// Tool Registry
// ============================================================================

export type ToolId =
  | "sql_query"
  | "sql_execute"
  | "sql_schema"
  | "web_fetch"
  | "code_execute"
  | "page_list"
  | "page_read"
  | "page_write";

export interface ToolRegistry {
  tools: Record<string, ToolDefinition>;
  getTools: (ids?: ToolId[]) => Record<string, ToolDefinition>;
}

/**
 * Create a tool registry with all available browser tools.
 */
export function createToolRegistry(ctx: ToolContext): ToolRegistry {
  const allTools: Record<ToolId, ToolDefinition> = {
    sql_query: createSqlQueryTool(ctx),
    sql_execute: createSqlExecuteTool(ctx),
    sql_schema: createSqlSchemaTool(ctx),
    web_fetch: createWebFetchTool(ctx),
    code_execute: createCodeExecuteTool(ctx),
    page_list: createPageListTool(ctx),
    page_read: createPageReadTool(ctx),
    page_write: createPageWriteTool(ctx),
  };

  return {
    tools: allTools,
    getTools: (ids?: ToolId[]) => {
      if (!ids) return allTools;
      return Object.fromEntries(ids.map((id) => [id, allTools[id]])) as Record<string, ToolDefinition>;
    },
  };
}

// ============================================================================
// Default Tool Sets
// ============================================================================

/** Tools for data analysis tasks */
export const DATA_TOOLS: ToolId[] = ["sql_query", "sql_schema", "code_execute"];

/** Tools for content editing */
export const CONTENT_TOOLS: ToolId[] = ["page_list", "page_read", "page_write"];

/** All available tools */
export const ALL_TOOLS: ToolId[] = [
  "sql_query",
  "sql_execute",
  "sql_schema",
  "web_fetch",
  "code_execute",
  "page_list",
  "page_read",
  "page_write",
];

// ============================================================================
// Convert to AI SDK ToolSet format
// ============================================================================

import { tool } from "ai";

/**
 * Convert our tool definitions to AI SDK's ToolSet format
 */
export function toAISDKTools(tools: Record<string, ToolDefinition>): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [name, def] of Object.entries(tools)) {
    // AI SDK v6 has strict overload typing for tool execute functions
    // Bypass with type assertion to handle the version mismatch
    const toolConfig = {
      description: def.description,
      parameters: def.parameters,
      execute: async (args: unknown) => def.execute(args),
    };
    result[name] = tool(toolConfig as unknown as Parameters<typeof tool>[0]);
  }

  return result;
}
