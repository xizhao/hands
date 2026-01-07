/**
 * Local tRPC Mock
 *
 * Provides the same interface as tRPC hooks but routes directly to local functions.
 * No @trpc/server dependency - runs entirely in browser.
 */

// ============================================================================
// Types
// ============================================================================

export interface LocalTRPCContext {
  /** Execute a read query */
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<T[]>;
  /** Execute a mutation (INSERT/UPDATE/DELETE) */
  execute: (sql: string, params?: unknown[]) => Promise<void>;
  /** Get current schema */
  getSchema: () => Array<{
    table_name: string;
    columns: Array<{ name: string; type: string; nullable: boolean }>;
    foreignKeys?: unknown[];
  }>;
  /** Current workbook ID */
  workbookId: string | null;
  /** Notify data change */
  notifyChange: () => void;
  /** Data version for reactivity */
  dataVersion: number;
  /** Get pages from SQLite _pages table */
  getPages: () => Promise<Array<{ path: string; title: string }>>;
  /** Get a page from SQLite */
  getPage: (path: string) => Promise<{ content: string; title: string } | null>;
  /** Save a page to SQLite */
  savePage: (path: string, content: string, title?: string) => Promise<void>;
  /** Delete a page from SQLite */
  deletePage: (path: string) => Promise<void>;
}

// ============================================================================
// Procedure Implementations
// ============================================================================

function isDDL(sql: string): boolean {
  const ddlKeywords = ["CREATE", "ALTER", "DROP", "TRUNCATE"];
  const upperSql = sql.trim().toUpperCase();
  return ddlKeywords.some((kw) => upperSql.startsWith(kw));
}

/** db.select - Read-only SELECT queries */
export async function dbSelect(ctx: LocalTRPCContext, input: { sql: string; params?: unknown[] }) {
  const upperSql = input.sql.trim().toUpperCase();
  if (!upperSql.startsWith("SELECT") && !upperSql.startsWith("PRAGMA")) {
    throw new Error("db.select only allows SELECT queries. Use db.query for mutations.");
  }

  const rows = await ctx.query(input.sql, input.params);
  return {
    rows,
    rowCount: rows.length,
  };
}

/** db.query - Execute any SQL (mutations) */
export async function dbQuery(ctx: LocalTRPCContext, input: { sql: string; params?: unknown[] }) {
  const upperSql = input.sql.trim().toUpperCase();

  // For SELECT/PRAGMA, use query method
  if (upperSql.startsWith("SELECT") || upperSql.startsWith("PRAGMA")) {
    const rows = await ctx.query(input.sql, input.params);
    return {
      rows,
      rowCount: rows.length,
      changes: 0,
    };
  }

  // For mutations, use execute method
  await ctx.execute(input.sql, input.params);

  // Notify change for DDL statements
  if (isDDL(input.sql)) {
    ctx.notifyChange();
  }

  return {
    rows: [],
    rowCount: 0,
    changes: 1,
  };
}

/** db.tables - List all tables */
export function dbTables(ctx: LocalTRPCContext) {
  const schema = ctx.getSchema();
  return schema.map((t) => ({ name: t.table_name }));
}

/** db.schema - Get detailed schema */
export function dbSchema(ctx: LocalTRPCContext) {
  const schema = ctx.getSchema();
  return schema.map((t) => ({
    table_name: t.table_name,
    columns: t.columns.map((c) => ({
      name: c.name,
      type: c.type,
      nullable: c.nullable,
    })),
    foreignKeys: t.foreignKeys ?? [],
  }));
}

/** db.dropTable - Drop a table */
export async function dbDropTable(ctx: LocalTRPCContext, input: { tableName: string }) {
  const safeName = input.tableName.replace(/[^a-zA-Z0-9_]/g, "");
  if (safeName !== input.tableName) {
    throw new Error("Invalid table name");
  }

  await ctx.execute(`DROP TABLE IF EXISTS "${safeName}"`);
  ctx.notifyChange();
  return { success: true, tableName: safeName };
}

/** tables.list - List all tables */
export async function tablesList(ctx: LocalTRPCContext, _input?: { workbookId?: string }) {
  // workbookId is passed for cache key scoping, actual db is from context
  const schema = ctx.getSchema();
  const pages = await ctx.getPages();

  const tables = schema.map((table) => {
    const pageSlug = table.table_name.replace(/_/g, "-");
    const page = pages.find(
      (p) => p.path === `${pageSlug}.mdx` || p.path === `${pageSlug}/index.mdx`
    );

    return {
      id: table.table_name,
      name: table.table_name,
      columns: table.columns,
      schemaHash: "",
      foreignKeys: [],
      relatedTables: [],
      hasPage: !!page,
      pagePath: page?.path,
      pageId: page?.path,
      icon: undefined,
      syncStatus: undefined,
    };
  });

  return { tables, errors: [] };
}

/** tables.get - Get a single table */
export async function tablesGet(ctx: LocalTRPCContext, input: { tableId: string }) {
  const schema = ctx.getSchema();
  const table = schema.find((t) => t.table_name === input.tableId);

  if (!table) {
    throw new Error(`Table not found: ${input.tableId}`);
  }

  const pages = await ctx.getPages();
  const pageSlug = table.table_name.replace(/_/g, "-");
  const page = pages.find(
    (p) => p.path === `${pageSlug}.mdx` || p.path === `${pageSlug}/index.mdx`
  );

  return {
    id: table.table_name,
    name: table.table_name,
    columns: table.columns,
    schemaHash: "",
    foreignKeys: [],
    relatedTables: [],
    hasPage: !!page,
    pagePath: page?.path,
    pageId: page?.path,
  };
}

/** tables.create - Create a new table (SQLite only, no page creation) */
export async function tablesCreate(ctx: LocalTRPCContext, input: { name: string }) {
  const tableName = input.name.replace(/[^a-zA-Z0-9_]/g, "");

  // Check if table exists
  const schema = ctx.getSchema();
  if (schema.some((t) => t.table_name === tableName)) {
    throw new Error(`Table already exists: ${tableName}`);
  }

  // Create table in SQLite
  await ctx.execute(`CREATE TABLE "${tableName}" (id INTEGER PRIMARY KEY AUTOINCREMENT)`);
  ctx.notifyChange();

  return {
    success: true,
    tableId: tableName,
  };
}

/** tables.delete - Delete a table (SQLite only) */
export async function tablesDelete(ctx: LocalTRPCContext, input: { tableId: string }) {
  const tableName = input.tableId.replace(/[^a-zA-Z0-9_]/g, "");

  await ctx.execute(`DROP TABLE IF EXISTS "${tableName}"`);
  ctx.notifyChange();

  return {
    success: true,
    deletedTable: tableName,
  };
}

/** status.get - Get runtime status */
export function statusGet() {
  return {
    status: "ready" as const,
    rscReady: true,
    rscPort: null,
    rscError: null,
    buildErrors: [],
  };
}

/** pages.list - List all pages */
export async function pagesList(ctx: LocalTRPCContext, _input?: { workbookId?: string }) {
  // workbookId is passed for cache key scoping, actual db is from context
  const pages = await ctx.getPages();
  return {
    pages: pages.map((p) => ({
      path: p.path,
      title: p.title,
      route: "/" + p.path.replace(/\.mdx$/, "").replace(/\/index$/, ""),
    })),
  };
}

/** pages.get - Get a page */
export async function pagesGet(ctx: LocalTRPCContext, input: { path: string }) {
  const page = await ctx.getPage(input.path);
  if (!page) {
    throw new Error(`Page not found: ${input.path}`);
  }
  return page;
}

/** pages.getSource - Get page source (matches workbook-server interface) */
export async function pagesGetSource(ctx: LocalTRPCContext, input: { route: string }) {
  // Normalize route to path
  let route = input.route.startsWith("/") ? input.route.slice(1) : input.route;

  // Handle case where path is passed instead of route (e.g., "hi.mdx" instead of "hi")
  if (route.endsWith(".mdx")) {
    route = route.slice(0, -4);
  }

  const path = route === "" ? "index.mdx" : `${route}.mdx`;

  const page = await ctx.getPage(path);
  if (!page) {
    throw new Error(`Page not found: ${path}`);
  }

  return {
    route: `/${route}`,
    path,
    source: page.content,
  };
}

/** pages.saveSource - Save page source (matches workbook-server interface) */
export async function pagesSaveSource(
  ctx: LocalTRPCContext,
  input: { route: string; source: string }
) {
  // Normalize route to path
  let route = input.route.startsWith("/") ? input.route.slice(1) : input.route;

  // Handle case where path is passed instead of route
  if (route.endsWith(".mdx")) {
    route = route.slice(0, -4);
  }

  const path = route === "" ? "index.mdx" : `${route}.mdx`;

  await ctx.savePage(path, input.source);

  return {
    route: `/${route}`,
    path,
  };
}

/** pages.save - Save a page */
export async function pagesSave(ctx: LocalTRPCContext, input: { path: string; content: string }) {
  await ctx.savePage(input.path, input.content);
  return { success: true };
}

/** pages.delete - Delete a page */
export async function pagesDelete(ctx: LocalTRPCContext, input: { route: string }) {
  // Normalize route to path
  const route = input.route.startsWith("/") ? input.route.slice(1) : input.route;
  const path = route === "" ? "index.mdx" : `${route}.mdx`;

  await ctx.deletePage(path);
  return { success: true, deletedRoute: `/${route}`, deletedPath: path };
}

// ============================================================================
// Procedure Registry
// ============================================================================

export type ProcedureType = "query" | "mutation";

export interface ProcedureDefinition {
  type: ProcedureType;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (ctx: LocalTRPCContext, input?: any) => any;
}

export const procedures: Record<string, ProcedureDefinition> = {
  // Database
  "db.select": { type: "query", handler: dbSelect },
  "db.query": { type: "mutation", handler: dbQuery },
  "db.tables": { type: "query", handler: dbTables },
  "db.schema": { type: "query", handler: dbSchema },
  "db.dropTable": { type: "mutation", handler: dbDropTable },

  // Tables
  "tables.list": { type: "query", handler: tablesList },
  "tables.get": { type: "query", handler: tablesGet },
  "tables.create": { type: "mutation", handler: tablesCreate },
  "tables.delete": { type: "mutation", handler: tablesDelete },
  "tables.rename": { type: "mutation", handler: async (ctx, input: { tableId: string; newName: string }) => {
    const oldName = input.tableId.replace(/[^a-zA-Z0-9_]/g, "");
    const newName = input.newName.replace(/[^a-zA-Z0-9_]/g, "");

    if (oldName === newName) {
      return { success: true, noChange: true };
    }

    // Rename table in SQLite only
    await ctx.execute(`ALTER TABLE "${oldName}" RENAME TO "${newName}"`);
    ctx.notifyChange();

    return { success: true, oldName, newName };
  }},

  // Status
  "status.get": { type: "query", handler: statusGet },

  // Pages
  "pages.list": { type: "query", handler: pagesList },
  "pages.get": { type: "query", handler: pagesGet },
  "pages.getSource": { type: "query", handler: pagesGetSource },
  "pages.save": { type: "mutation", handler: pagesSave },
  "pages.saveSource": { type: "mutation", handler: pagesSaveSource },
  "pages.delete": { type: "mutation", handler: pagesDelete },
  "pages.create": { type: "mutation", handler: async (ctx, input?: { pageId?: string }) => {
    const pageId = input?.pageId ?? `untitled-${Date.now()}`;
    const title = pageId.split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
    const content = `---\ntitle: "${title}"\n---\n\n`;
    await ctx.savePage(`${pageId}.mdx`, content, title);
    return { pageId, filePath: `${pageId}.mdx` };
  }},
  "pages.duplicate": { type: "mutation", handler: async (ctx, input: { route: string }) => {
    const route = input.route.startsWith("/") ? input.route.slice(1) : input.route;
    const path = route === "" ? "index.mdx" : `${route}.mdx`;
    const page = await ctx.getPage(path);
    if (!page) throw new Error(`Page not found: ${input.route}`);
    const newId = `${route}-copy-${Date.now()}`;
    const newPath = `${newId}.mdx`;
    await ctx.savePage(newPath, page.content);
    return { originalRoute: input.route, newRoute: `/${newId}`, newPath };
  }},
  "pages.rename": { type: "mutation", handler: async (ctx, input: { route: string; newSlug: string }) => {
    // Normalize route to get current path
    const route = input.route.startsWith("/") ? input.route.slice(1) : input.route;
    const oldPath = route === "" ? "index.mdx" : `${route}.mdx`;
    const newPath = input.newSlug === "index" ? "index.mdx" : `${input.newSlug}.mdx`;

    if (oldPath === newPath) {
      return { noChange: true, newRoute: `/${route}` };
    }

    // Get the old page content
    const page = await ctx.getPage(oldPath);
    if (!page) throw new Error(`Page not found: ${input.route}`);

    // Update title in frontmatter to match new slug
    const newTitle = input.newSlug
      .split("-")
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    const updatedContent = page.content.replace(
      /^(---\s*\n[\s\S]*?title:\s*)["']?.*?["']?(\s*\n)/m,
      `$1"${newTitle}"$2`
    );

    // Save to new path and delete old
    await ctx.savePage(newPath, updatedContent, newTitle);
    await ctx.deletePage(oldPath);

    const newRoute = input.newSlug === "index" ? "/" : `/${input.newSlug}`;
    return { oldRoute: `/${route}`, newRoute, newPath };
  }},

  // Editor State (stubs - stored in memory/localStorage for web)
  "editorState.getUiState": { type: "query", handler: () => null },
  "editorState.saveUiState": { type: "mutation", handler: () => ({ success: true }) },
  "editorState.updateUiState": { type: "mutation", handler: () => ({ success: true }) },
  "editorState.getRecents": { type: "query", handler: () => [] },
  "editorState.addRecent": { type: "mutation", handler: () => ({ success: true }) },
  "editorState.getExpandedFolders": { type: "query", handler: () => ({}) },
  "editorState.getExpandedSources": { type: "query", handler: () => ({}) },
  "editorState.setFolderExpanded": { type: "mutation", handler: () => ({ success: true }) },
  "editorState.setSourceExpanded": { type: "mutation", handler: () => ({ success: true }) },

  // Secrets (stubs - use localStorage in local mode)
  "secrets.list": { type: "query", handler: () => [] },
  "secrets.get": { type: "query", handler: () => null },
  "secrets.set": { type: "mutation", handler: () => ({ success: true }) },
  "secrets.save": { type: "mutation", handler: () => ({ success: true }) },
  "secrets.delete": { type: "mutation", handler: () => ({ success: true }) },

  // Workbook
  "workbook.getManifest": { type: "query", handler: (ctx) => ({
    id: ctx.workbookId ?? "local",
    name: "Local Workbook",
    blocks: [],
  }) },
  "workbook.manifest": { type: "query", handler: (ctx) => ({
    id: ctx.workbookId ?? "local",
    name: "Local Workbook",
    blocks: [],
  }) },

  // Thumbnails (stubs)
  "thumbnails.get": { type: "query", handler: () => null },
  "thumbnails.generate": { type: "mutation", handler: () => ({ success: true }) },

  // AI (stubs - handled by direct LLM calls in web mode)
  "ai.textToSql": { type: "mutation", handler: () => {
    throw new Error("AI features are handled directly in local mode");
  }},
  "ai.generateMdx": { type: "mutation", handler: () => {
    throw new Error("AI features are handled directly in local mode");
  }},
  "ai.generateMdxBlock": { type: "mutation", handler: () => {
    throw new Error("AI features are handled directly in local mode");
  }},
  "ai.generateHint": { type: "mutation", handler: () => {
    throw new Error("AI features are handled directly in local mode");
  }},
  "ai.generateHintsBatch": { type: "mutation", handler: () => {
    throw new Error("AI features are handled directly in local mode");
  }},

  // Git (stub - no git in local mode)
  "git.status": { type: "query", handler: () => ({ isRepo: false }) },

  // Actions (stubs)
  "actions.list": { type: "query", handler: () => [] },

  // Action Runs (stubs)
  "actionRuns.list": { type: "query", handler: () => [] },
  "actionRuns.get": { type: "query", handler: () => null },
  "actionRuns.getLogs": { type: "query", handler: () => null },

  // Deploy (stubs)
  "deploy.status": { type: "query", handler: () => ({ deployed: false }) },
  "viewerDeploy.status": { type: "query", handler: () => ({ deployed: false }) },
};

/** Execute a procedure by path */
export async function executeProcedure(
  ctx: LocalTRPCContext,
  path: string,
  input?: unknown
): Promise<unknown> {
  const procedure = procedures[path];
  if (!procedure) {
    throw new Error(`Procedure not found: ${path}`);
  }
  return procedure.handler(ctx, input);
}
