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
  /** Execute a read query (sync or async) */
  query: (sql: string, params?: unknown[]) => unknown[] | Promise<unknown[]>;
  /** Execute a mutation (INSERT/UPDATE/DELETE) (sync or async) */
  execute: (sql: string, params?: unknown[]) => void | Promise<void>;
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
  /** CORS proxy URL prefix (e.g., "https://corsproxy.io/?") */
  corsProxy?: string;
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

        const rows = await ctx.db.query(sql, params);
        return {
          rows,
          rowCount: Array.isArray(rows) ? rows.length : 0,
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
        await ctx.db.execute(sql, params);
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

export function createWebFetchTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Fetch content from a URL. Returns the response body as text.
Useful for retrieving data from APIs or web pages.
Uses CORS proxy for cross-origin requests when configured.`,
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
        // Use CORS proxy for cross-origin requests
        const targetUrl = ctx.corsProxy
          ? `${ctx.corsProxy}${encodeURIComponent(url)}`
          : url;

        const response = await fetch(targetUrl, {
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

export function createWebSearchTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Search the web using DuckDuckGo. Returns search results with titles, URLs, and snippets.
Use for finding information, documentation, or researching topics.`,
    parameters: z.object({
      query: z.string().describe("The search query"),
      maxResults: z.number().optional().describe("Maximum results to return (default: 10)"),
    }),
    execute: async (args: unknown) => {
      const { query, maxResults = 10 } = args as { query: string; maxResults?: number };

      try {
        const encodedQuery = encodeURIComponent(query);
        const searchUrl = `https://html.duckduckgo.com/html/?q=${encodedQuery}`;

        // Use CORS proxy for cross-origin request
        const targetUrl = ctx.corsProxy
          ? `${ctx.corsProxy}${encodeURIComponent(searchUrl)}`
          : searchUrl;

        const response = await fetch(targetUrl, {
          headers: {
            Accept: "text/html",
          },
        });

        if (!response.ok) {
          return { error: `Search failed: ${response.status} ${response.statusText}` };
        }

        const html = await response.text();
        const results = parseSearchResults(html, maxResults);

        if (results.length === 0) {
          return { message: `No results found for "${query}"`, results: [] };
        }

        return { query, results };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

/** Parse DuckDuckGo HTML search results */
function parseSearchResults(html: string, maxResults: number): Array<{ title: string; url: string; snippet: string }> {
  const results: Array<{ title: string; url: string; snippet: string }> = [];

  // Try JSON data first (most reliable)
  const jsonMatch = html.match(/DDG\.pageLayout\.load\('d',(\[.*?\])\)/);
  if (jsonMatch) {
    try {
      const data = JSON.parse(jsonMatch[1]);
      for (const item of data) {
        if (item.u && item.t) {
          results.push({
            title: item.t,
            url: item.u,
            snippet: item.a || "",
          });
          if (results.length >= maxResults) break;
        }
      }
      return results;
    } catch {
      // Fall through to HTML parsing
    }
  }

  // Parse HTML result blocks
  const blocks = html.split(/<div[^>]*class="[^"]*result[^"]*"[^>]*>/i).slice(1);

  for (const block of blocks) {
    if (results.length >= maxResults) break;

    // Extract URL
    const urlMatch = block.match(/uddg=([^&"]+)/);
    const directUrlMatch = block.match(/href="(https?:\/\/[^"]+)"/);

    // Extract title
    const titleMatch = block.match(/<a[^>]*class="[^"]*result__a[^"]*"[^>]*>([^<]+)<\/a>/i);
    const altTitleMatch = block.match(/<h2[^>]*>([^<]+)<\/h2>/i);

    // Extract snippet
    const snippetMatch = block.match(/<a[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)/i);
    const altSnippetMatch = block.match(/<span[^>]*class="[^"]*result__snippet[^"]*"[^>]*>([^<]+)/i);

    const url = urlMatch ? decodeURIComponent(urlMatch[1]) : directUrlMatch?.[1] || null;
    const title = titleMatch?.[1] || altTitleMatch?.[1];
    const snippet = snippetMatch?.[1] || altSnippetMatch?.[1] || "";

    if (url && title) {
      results.push({
        title: decodeHtmlEntities(title.trim()),
        url,
        snippet: decodeHtmlEntities(snippet.trim()),
      });
    }
  }

  return results;
}

/** Decode HTML entities */
function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
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
// Navigation Tool
// ============================================================================

export function createNavigateTool(_ctx: ToolContext): ToolDefinition {
  return {
    description: `Navigate the user to a page or table in the workbook.

Use this tool after completing work to show the user the result. For example:
- After creating a page, navigate to that page
- After importing data to a table, navigate to that table
- After creating a customer database, navigate to the customers page

Parameters:
- routeType: "page", "block", or "table" (block is alias for page)
- id: The page path (e.g., "customers.mdx") or table name (e.g., "customers")
- title: Optional display title
- description: Optional description of what they'll see`,
    parameters: z.object({
      routeType: z.enum(["page", "block", "table"]).describe('Type of destination: "page", "block" (alias for page), or "table"'),
      id: z.string().describe("Page path (e.g., 'customers.mdx') or table name (e.g., 'customers')"),
      title: z.string().optional().describe("Display title for the navigation"),
      description: z.string().optional().describe("Brief description of what the user will see"),
    }),
    execute: async (args: unknown) => {
      const { routeType, id, title, description } = args as {
        routeType: "page" | "block" | "table";
        id: string;
        title?: string;
        description?: string;
      };

      // Normalize "block" to "page" (browser has no separate blocks)
      const normalizedType = routeType === "block" ? "page" : routeType;

      // Return navigation intent as JSON - UI will handle actual navigation
      return {
        type: "navigate",
        routeType: normalizedType,
        id,
        title: title || id,
        description,
      };
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

// Tool IDs aligned with OpenCode SDK naming
export type ToolId =
  | "sql"           // Query database (read-only)
  | "sql_execute"   // Execute database mutations
  | "schema"        // Show database schema
  | "webfetch"      // Fetch a URL
  | "websearch"     // Search the web
  | "code"          // Execute JavaScript code
  | "glob"          // List pages/files
  | "read"          // Read page content
  | "write"         // Write page content
  | "navigate";     // Navigate to page/table

export interface ToolRegistry {
  tools: Record<string, ToolDefinition>;
  getTools: (ids?: ToolId[]) => Record<string, ToolDefinition>;
}

/**
 * Create a tool registry with all available browser tools.
 * Tool names aligned with OpenCode SDK naming conventions.
 */
export function createToolRegistry(ctx: ToolContext): ToolRegistry {
  const allTools: Record<ToolId, ToolDefinition> = {
    sql: createSqlQueryTool(ctx),
    sql_execute: createSqlExecuteTool(ctx),
    schema: createSqlSchemaTool(ctx),
    webfetch: createWebFetchTool(ctx),
    websearch: createWebSearchTool(ctx),
    code: createCodeExecuteTool(ctx),
    glob: createPageListTool(ctx),
    read: createPageReadTool(ctx),
    write: createPageWriteTool(ctx),
    navigate: createNavigateTool(ctx),
  };

  return {
    tools: allTools,
    getTools: (ids?: ToolId[]) => {
      if (!ids) return allTools;
      // Filter out tool IDs that don't exist in the browser registry
      // (e.g., desktop-only tools like 'sources', 'secrets', 'polars')
      return Object.fromEntries(
        ids
          .filter((id) => id in allTools && allTools[id as keyof typeof allTools] !== undefined)
          .map((id) => [id, allTools[id as keyof typeof allTools]])
      ) as Record<string, ToolDefinition>;
    },
  };
}

// ============================================================================
// Default Tool Sets (aligned with OpenCode SDK naming)
// ============================================================================

/** Tools for data analysis tasks */
export const DATA_TOOLS: ToolId[] = ["sql", "schema", "code"];

/** Tools for web research */
export const RESEARCH_TOOLS: ToolId[] = ["webfetch", "websearch"];

/** Tools for content editing */
export const CONTENT_TOOLS: ToolId[] = ["glob", "read", "write"];

/** All available tools */
export const ALL_TOOLS: ToolId[] = [
  "sql",
  "sql_execute",
  "schema",
  "webfetch",
  "websearch",
  "code",
  "glob",
  "read",
  "write",
  "navigate",
];

// ============================================================================
// Convert to AI SDK ToolSet format
// ============================================================================

import type { Tool, ToolSet, ToolCallOptions } from "ai";

/**
 * Convert our tool definitions to AI SDK's ToolSet format.
 * Maps our ToolDefinition (with `parameters`) to AI SDK Tool (with `inputSchema`).
 */
export function toAISDKTools(tools: Record<string, ToolDefinition>): ToolSet {
  const result: ToolSet = {};

  for (const [name, def] of Object.entries(tools)) {
    // Skip undefined tool definitions (can happen if tool ID isn't in registry)
    if (!def) {
      console.warn(`[toAISDKTools] Skipping undefined tool: ${name}`);
      continue;
    }

    // Create a Tool object with proper typing
    // Our ToolDefinition.parameters maps to Tool.inputSchema
    const aiTool: Tool<unknown, unknown> = {
      description: def.description,
      inputSchema: def.parameters,
      execute: async (input: unknown, _options: ToolCallOptions) => def.execute(input),
    };
    result[name] = aiTool;
  }

  return result;
}
