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
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => T[] | Promise<T[]>;
  /** Execute a mutation (INSERT/UPDATE/DELETE) (sync or async) */
  execute: (sql: string, params?: unknown[]) => void | Promise<void>;
  /** Get current schema */
  getSchema: () => Array<{
    table_name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
  }>;
  /** Notify data change (for reactivity) */
  notifyChange: () => void;
}

// ============================================================================
// Pages Context Interface (for page operations)
// ============================================================================

export interface PagesContext {
  /** List all pages in the workbook */
  listPages: () => Promise<Array<{ pageId: string; title: string }>>;
  /** Read a page's content */
  readPage: (pageId: string) => Promise<{ content: string; title: string } | null>;
  /** Create or update a page */
  writePage: (pageId: string, content: string) => Promise<void>;
  /** Delete a page */
  deletePage: (pageId: string) => Promise<void>;
  /** Search pages by content (optional - falls back to listPages + readPage) */
  searchPages?: (query: string) => Promise<Array<{ pageId: string; title: string; matches: string[] }>>;
}

// ============================================================================
// Subagent Context (for spawning child agents)
// ============================================================================

export interface SubagentResult {
  /** Child session ID */
  sessionId: string;
  /** Final text from the subagent */
  text: string;
  /** Tool calls made by the subagent */
  toolCalls: Array<{ tool: string; title?: string; status: string }>;
  /** Error if the subagent failed */
  error?: string;
}

export interface SubagentContext {
  /** Available agents */
  listAgents: () => Array<{ id: string; name: string; description?: string; mode?: string }>;
  /** Spawn a subagent */
  spawn: (opts: {
    agentId: string;
    prompt: string;
    description: string;
    parentSessionId: string;
  }) => Promise<SubagentResult>;
}

// ============================================================================
// Tool Context (injected at runtime)
// ============================================================================

export interface ToolContext {
  /** Database context for SQL operations */
  db?: DatabaseContext;
  /** Pages context for page operations */
  pages?: PagesContext;
  /** Subagent context for spawning child agents */
  subagent?: SubagentContext;
  /** Abort signal for cancellation */
  abortSignal?: AbortSignal;
  /** CORS proxy URL prefix (e.g., "https://corsproxy.io/?") */
  corsProxy?: string;
  /** Current session ID (for subagent spawning) */
  sessionId?: string;
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
// SQL Tool (unified read/write)
// ============================================================================

export function createSqlTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Execute SQL queries against the workbook's SQLite database.

Use this tool to:
- Query data for analysis (SELECT)
- Create/alter tables (CREATE, ALTER)
- Insert/update data (INSERT, UPDATE)
- Delete data (DELETE, DROP)

SQLite-specific notes:
- Uses SQLite syntax (not PostgreSQL)
- Use INTEGER PRIMARY KEY for auto-increment
- BOOLEAN stored as 0/1
- Use datetime('now') for current timestamp

For destructive operations (DROP, TRUNCATE, DELETE without WHERE), set confirm_destructive: true.`,
    parameters: z.object({
      sql: z.string().describe("The SQL query to execute"),
      params: z.array(z.unknown()).optional().describe("Query parameters for prepared statement"),
      confirm_destructive: z.boolean().optional().describe("Set to true to confirm destructive operations (DROP, TRUNCATE, DELETE without WHERE)"),
    }),
    execute: async (args: unknown) => {
      const { sql, params, confirm_destructive = false } = args as {
        sql: string;
        params?: unknown[];
        confirm_destructive?: boolean;
      };

      if (!ctx.db) {
        return { error: "Database not available" };
      }

      const lowerSql = sql.toLowerCase().trim();
      const isDestructive =
        lowerSql.startsWith("drop") ||
        lowerSql.startsWith("truncate") ||
        (lowerSql.startsWith("delete") && !lowerSql.includes("where"));

      if (isDestructive && !confirm_destructive) {
        return {
          error: "Destructive operation detected",
          message: "This would modify/delete data. To proceed, run again with confirm_destructive: true",
          query: sql,
        };
      }

      try {
        const upperSql = sql.trim().toUpperCase();
        const isQuery = upperSql.startsWith("SELECT") || upperSql.startsWith("PRAGMA");

        if (isQuery) {
          const rows = await ctx.db.query(sql, params);
          return {
            rows,
            rowCount: Array.isArray(rows) ? rows.length : 0,
          };
        } else {
          await ctx.db.execute(sql, params);
          ctx.db.notifyChange();
          return { success: true, message: "Query executed successfully" };
        }
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
// Page Tools (semantic API for workbook pages)
// ============================================================================

export function createListPagesTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `List all pages in the workbook. Returns page IDs and titles.`,
    parameters: z.object({}),
    execute: async () => {
      if (!ctx.pages) {
        return { error: "Pages context not available" };
      }

      try {
        const pages = await ctx.pages.listPages();
        return { pages };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function createReadPageTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Read a page's content. Returns the MDX source and title.`,
    parameters: z.object({
      pageId: z.string().describe("Page ID (e.g., 'index', 'about', 'customers')"),
    }),
    execute: async (args: unknown) => {
      const { pageId } = args as { pageId: string };
      if (!ctx.pages) {
        return { error: "Pages context not available" };
      }

      try {
        const page = await ctx.pages.readPage(pageId);
        if (!page) {
          return { error: `Page not found: ${pageId}` };
        }
        return { pageId, content: page.content, title: page.title };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function createWritePageTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Create or update a page. Write MDX content with frontmatter.

Example content:
---
title: "My Page"
---

# Hello World

This is my page content.`,
    parameters: z.object({
      pageId: z.string().describe("Page ID (e.g., 'index', 'about', 'customers')"),
      content: z.string().describe("Full MDX content including frontmatter"),
    }),
    execute: async (args: unknown) => {
      const { pageId, content } = args as { pageId: string; content: string };
      if (!ctx.pages) {
        return { error: "Pages context not available" };
      }

      try {
        await ctx.pages.writePage(pageId, content);
        return { success: true, pageId };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function createDeletePageTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Delete a page from the workbook.`,
    parameters: z.object({
      pageId: z.string().describe("Page ID to delete"),
    }),
    execute: async (args: unknown) => {
      const { pageId } = args as { pageId: string };
      if (!ctx.pages) {
        return { error: "Pages context not available" };
      }

      try {
        await ctx.pages.deletePage(pageId);
        return { success: true, pageId };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function createTaskTool(ctx: ToolContext): ToolDefinition {
  // Build dynamic description with available agents
  const agents = ctx.subagent?.listAgents().filter((a) => a.mode !== "primary") ?? [];
  const agentList = agents.length > 0
    ? agents.map((a) => `- ${a.id}: ${a.description ?? "Specialized agent"}`).join("\n")
    : "No subagents available";

  return {
    description: `Launch a subagent to handle a complex, multi-step task autonomously.

The Task tool spawns specialized agents that work independently and return results.
Each agent has specific capabilities. Use this when you need to delegate work.

Available agents:
${agentList}

Usage:
- Provide a clear, detailed prompt describing what the agent should do
- The agent runs in its own session and returns a summary when done
- You can resume a previous task by providing its session_id`,
    parameters: z.object({
      description: z.string().describe("A short (3-5 words) description of the task"),
      prompt: z.string().describe("The full task for the agent to perform"),
      subagent_type: z.string().describe("The agent ID to use (e.g., 'coder', 'researcher')"),
      session_id: z.string().optional().describe("Optional: resume an existing task session"),
    }),
    execute: async (args: unknown) => {
      const { description, prompt, subagent_type, session_id } = args as {
        description: string;
        prompt: string;
        subagent_type: string;
        session_id?: string;
      };

      if (!ctx.subagent) {
        return { error: "Subagent context not available" };
      }

      if (!ctx.sessionId) {
        return { error: "No session context - cannot spawn subagent" };
      }

      // Check if agent exists
      const agents = ctx.subagent.listAgents();
      const agent = agents.find((a) => a.id === subagent_type);
      if (!agent) {
        return {
          error: `Unknown agent: ${subagent_type}. Available: ${agents.map((a) => a.id).join(", ")}`,
        };
      }

      try {
        const result = await ctx.subagent.spawn({
          agentId: subagent_type,
          prompt,
          description,
          parentSessionId: ctx.sessionId,
        });

        // Format output similar to OpenCode
        const toolSummary = result.toolCalls
          .map((t) => `- ${t.tool}: ${t.title ?? t.status}`)
          .join("\n");

        const output = [
          result.text,
          "",
          "<task_metadata>",
          `session_id: ${result.sessionId}`,
          `tools_used: ${result.toolCalls.length}`,
          "</task_metadata>",
        ].join("\n");

        return {
          title: description,
          metadata: {
            sessionId: result.sessionId,
            toolCalls: result.toolCalls,
          },
          output,
        };
      } catch (error) {
        return {
          error: error instanceof Error ? error.message : String(error),
        };
      }
    },
  };
}

export function createSearchPagesTool(ctx: ToolContext): ToolDefinition {
  return {
    description: `Search for content across all pages in the workbook.
Returns matching pages with context snippets around each match.
Use this to find pages containing specific text, code, or patterns.`,
    parameters: z.object({
      query: z.string().describe("Search query (case-insensitive substring match)"),
    }),
    execute: async (args: unknown) => {
      const { query } = args as { query: string };
      if (!ctx.pages) {
        return { error: "Pages context not available" };
      }

      try {
        // Use optimized search if available
        if (ctx.pages.searchPages) {
          const results = await ctx.pages.searchPages(query);
          return { query, results };
        }

        // Fallback: list all pages and search manually
        const allPages = await ctx.pages.listPages();
        const results: Array<{ pageId: string; title: string; matches: string[] }> = [];
        const lowerQuery = query.toLowerCase();

        for (const page of allPages) {
          const content = await ctx.pages.readPage(page.pageId);
          if (!content) continue;

          const lowerContent = content.content.toLowerCase();
          if (!lowerContent.includes(lowerQuery)) continue;

          // Extract match context (lines containing the query)
          const lines = content.content.split("\n");
          const matches: string[] = [];
          for (let i = 0; i < lines.length && matches.length < 5; i++) {
            if (lines[i].toLowerCase().includes(lowerQuery)) {
              matches.push(lines[i].trim());
            }
          }

          results.push({
            pageId: page.pageId,
            title: content.title,
            matches,
          });
        }

        return { query, results };
      } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

// ============================================================================
// Tool Registry
// ============================================================================

// Tool IDs for browser agent
export type ToolId =
  | "sql"           // Query and mutate database (unified read/write)
  | "schema"        // Show database schema
  | "webfetch"      // Fetch a URL
  | "websearch"     // Search the web
  | "code"          // Execute JavaScript code
  | "listPages"     // List all pages
  | "readPage"      // Read page content
  | "writePage"     // Create/update page
  | "deletePage"    // Delete a page
  | "searchPages"   // Search across page content
  | "task"          // Spawn a subagent
  | "navigate";     // Navigate to page/table

export interface ToolRegistry {
  tools: Record<string, ToolDefinition>;
  getTools: (ids?: ToolId[]) => Record<string, ToolDefinition>;
}

/**
 * Create a tool registry with all available browser tools.
 */
export function createToolRegistry(ctx: ToolContext): ToolRegistry {
  const allTools: Record<ToolId, ToolDefinition> = {
    sql: createSqlTool(ctx),
    schema: createSqlSchemaTool(ctx),
    webfetch: createWebFetchTool(ctx),
    websearch: createWebSearchTool(ctx),
    code: createCodeExecuteTool(ctx),
    listPages: createListPagesTool(ctx),
    readPage: createReadPageTool(ctx),
    writePage: createWritePageTool(ctx),
    deletePage: createDeletePageTool(ctx),
    searchPages: createSearchPagesTool(ctx),
    task: createTaskTool(ctx),
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

/** Tools for page editing */
export const PAGE_TOOLS: ToolId[] = ["listPages", "readPage", "writePage", "deletePage", "searchPages"];

/** All available tools */
export const ALL_TOOLS: ToolId[] = [
  "sql",
  "schema",
  "webfetch",
  "websearch",
  "code",
  "listPages",
  "readPage",
  "writePage",
  "deletePage",
  "searchPages",
  "task",
  "navigate",
];

/** Tools to disable in subagents (prevent recursion) */
export const SUBAGENT_DISABLED_TOOLS: ToolId[] = ["task"];

/**
 * Map legacy VFS-style tool names to new semantic page tool names.
 * Allows agent configs using old names to work with new tools.
 */
export const LEGACY_TOOL_MAP: Record<string, ToolId> = {
  glob: "listPages",
  read: "readPage",
  write: "writePage",
  grep: "searchPages",
};

/** Normalize a tool name, mapping legacy names to current ones */
export function normalizeToolId(id: string): ToolId | null {
  if (ALL_TOOLS.includes(id as ToolId)) {
    return id as ToolId;
  }
  return LEGACY_TOOL_MAP[id] ?? null;
}

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
