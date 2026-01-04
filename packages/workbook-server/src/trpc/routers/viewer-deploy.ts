/**
 * Viewer Deploy Router
 *
 * Deploys workbooks to the shared viewer by uploading to D1.
 * No build step needed - just uploads MDX pages and syncs data.
 *
 * Schema:
 *   _meta: workbook metadata (name, etc)
 *   _pages: MDX content (id, path, title, content)
 *   user tables: synced from local SQLite
 */

import Database from "bun:sqlite";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { initTRPC, TRPCError } from "@trpc/server";
import { z } from "zod";
import { discoverDomains, discoverPages } from "../../workbook/discovery.js";

// ============================================================================
// Types
// ============================================================================

export interface ViewerDeployContext {
  workbookId: string;
  workbookDir: string;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

// ============================================================================
// Cloudflare D1 HTTP API
// ============================================================================

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

async function listD1Databases(
  accountId: string,
  token: string
): Promise<Array<{ uuid: string; name: string }>> {
  const res = await fetch(`${CF_API_BASE}/accounts/${accountId}/d1/database`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as CloudflareResponse<Array<{ uuid: string; name: string }>>;
  return data.success ? data.result : [];
}

async function createD1Database(
  accountId: string,
  name: string,
  token: string
): Promise<{ uuid: string; name: string }> {
  console.log(`[viewer-deploy] POST ${CF_API_BASE}/accounts/${accountId.slice(0,8)}***/d1/database`);
  const res = await fetch(`${CF_API_BASE}/accounts/${accountId}/d1/database`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });
  console.log(`[viewer-deploy] Create D1 response: ${res.status}`);
  if (!res.ok) {
    const text = await res.text();
    console.error(`[viewer-deploy] Create D1 failed: ${text}`);
    throw new Error(`Failed to create D1: ${text}`);
  }
  const data = (await res.json()) as CloudflareResponse<{ uuid: string; name: string }>;
  if (!data.success) throw new Error(data.errors[0]?.message || "Failed to create D1");
  console.log(`[viewer-deploy] Created D1: ${data.result.uuid}`);
  return data.result;
}

async function deleteD1Database(
  accountId: string,
  dbId: string,
  token: string
): Promise<void> {
  console.log(`[viewer-deploy] Deleting D1 database: ${dbId}`);
  const res = await fetch(`${CF_API_BASE}/accounts/${accountId}/d1/database/${dbId}`, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });
  if (!res.ok) {
    const text = await res.text();
    console.warn(`[viewer-deploy] Failed to delete D1: ${text}`);
    // Don't throw - we'll just create a new one
  } else {
    console.log(`[viewer-deploy] Deleted D1 database`);
  }
}

async function executeD1(
  accountId: string,
  dbId: string,
  sql: string,
  params: unknown[],
  token: string
): Promise<{ success: boolean; error?: string; results?: unknown[] }> {
  const res = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/d1/database/${dbId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql, params }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: text };
  }
  const data = (await res.json()) as CloudflareResponse<Array<{ results: unknown[] }>>;
  if (!data.success) {
    return { success: false, error: data.errors[0]?.message };
  }
  return { success: true, results: data.result[0]?.results };
}

/**
 * Execute raw SQL string (multiple statements) via D1 raw endpoint
 * This is much faster for bulk operations
 */
async function executeD1Raw(
  accountId: string,
  dbId: string,
  sql: string,
  token: string
): Promise<{ success: boolean; error?: string }> {
  const res = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/d1/database/${dbId}/raw`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
    }
  );
  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: text };
  }
  const data = (await res.json()) as CloudflareResponse<unknown>;
  if (!data.success) {
    return { success: false, error: data.errors[0]?.message };
  }
  return { success: true };
}

/**
 * Escape SQL string value
 */
function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  // Escape single quotes by doubling them
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ============================================================================
// Schema for viewer tables
// ============================================================================

const VIEWER_SCHEMA = `
-- Workbook metadata
CREATE TABLE IF NOT EXISTS _meta (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Pages (MDX content)
CREATE TABLE IF NOT EXISTS _pages (
  id TEXT PRIMARY KEY,
  path TEXT NOT NULL,
  title TEXT,
  content TEXT NOT NULL,
  updated_at INTEGER DEFAULT (unixepoch())
);

CREATE INDEX IF NOT EXISTS idx_pages_path ON _pages(path);
`;

// ============================================================================
// Helpers
// ============================================================================

function findLocalDbPath(workbookDir: string): string | null {
  // Check .hands/workbook.db first (new location)
  const directPath = join(workbookDir, ".hands/workbook.db");
  if (existsSync(directPath)) return directPath;

  // Fallback to .hands/db/v3/d1/... (old wrangler location)
  const d1Path = join(workbookDir, ".hands/db/v3/d1");
  if (!existsSync(d1Path)) return null;

  const dbFolders = readdirSync(d1Path, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  if (dbFolders.length === 0) return null;

  const dbFolder = join(d1Path, dbFolders[0]);
  const sqliteFiles = readdirSync(dbFolder).filter((f) => f.endsWith(".sqlite"));

  if (sqliteFiles.length === 0) return null;

  // Use most recently modified
  sqliteFiles.sort((a, b) => {
    return statSync(join(dbFolder, b)).mtimeMs - statSync(join(dbFolder, a)).mtimeMs;
  });

  return join(dbFolder, sqliteFiles[0]);
}

/**
 * Get pages to deploy using the same discovery logic as DomainSidebar.
 * Only includes pages that are associated with domains (database tables).
 */
async function getDomainPages(workbookDir: string): Promise<Array<{ id: string; path: string; content: string }>> {
  const pagesDir = join(workbookDir, "pages");
  if (!existsSync(pagesDir)) return [];

  // Use same discovery as DomainSidebar
  const pagesResult = await discoverPages(pagesDir);
  const domainsResult = discoverDomains(workbookDir, pagesResult.items);

  const pages: Array<{ id: string; path: string; content: string }> = [];

  for (const domain of domainsResult.items) {
    // Only include domains that have an associated page
    if (!domain.hasPage || !domain.pagePath) continue;

    const fullPath = join(pagesDir, domain.pagePath);
    if (!existsSync(fullPath)) continue;

    try {
      const content = readFileSync(fullPath, "utf-8");
      // Use domain id as page id, route from page path
      const routePath = `/${domain.id.replace(/_/g, "-")}`;
      pages.push({
        id: domain.id,
        path: routePath,
        content,
      });
    } catch (err) {
      console.warn(`[viewer-deploy] Failed to read page for domain ${domain.id}:`, err);
    }
  }

  return pages;
}

function extractTitle(mdxContent: string): string | null {
  // Extract from frontmatter
  if (mdxContent.startsWith("---")) {
    const endIndex = mdxContent.indexOf("---", 3);
    if (endIndex !== -1) {
      const frontmatter = mdxContent.slice(3, endIndex);
      const titleMatch = frontmatter.match(/title:\s*["']?([^"'\n]+)["']?/);
      if (titleMatch) return titleMatch[1].trim();
    }
  }
  // Extract from first heading
  const h1Match = mdxContent.match(/^#\s+(.+)$/m);
  return h1Match ? h1Match[1].trim() : null;
}

// ============================================================================
// tRPC Router
// ============================================================================

const t = initTRPC.context<ViewerDeployContext>().create();

export const viewerDeployRouter = t.router({
  /**
   * Deploy workbook to shared viewer
   */
  publish: t.procedure
    .input(z.object({ includeData: z.boolean().default(true) }).optional())
    .mutation(async ({ ctx, input }) => {
      const { workbookId, workbookDir } = ctx;
      const includeData = input?.includeData ?? true;

      // Token bundled at build time via HANDS_CF_TOKEN, or CLOUDFLARE_API_TOKEN for dev
      const cfToken = process.env.HANDS_CF_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
      if (!cfToken) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Deploy not available - missing Cloudflare API token",
        });
      }

      // Account ID bundled at build time via HANDS_CF_ACCOUNT_ID, or CF_ACCOUNT_ID for dev
      const accountId = process.env.HANDS_CF_ACCOUNT_ID || process.env.CF_ACCOUNT_ID;
      if (!accountId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "Deploy not available - missing Cloudflare account ID",
        });
      }

      console.log(`[viewer-deploy] Starting deploy for ${workbookId}...`);

      // Simple deploy: delete old DB if exists, create fresh one
      // D1 doesn't support rename, so we can't do atomic swap
      const dbName = `hands-wb-${workbookId.slice(0, 40)}`;
      const databases = await listD1Databases(accountId, cfToken);

      // Find and delete existing database (fresh deploy each time)
      const existingDb = databases.find((d) => d.name === dbName);
      if (existingDb) {
        console.log(`[viewer-deploy] Deleting existing DB for fresh deploy`);
        await deleteD1Database(accountId, existingDb.uuid, cfToken);
      }

      // Also clean up any leftover staging DBs from old deploys
      const oldStagingDb = databases.find((d) => d.name === `${dbName}-staging`);
      if (oldStagingDb) {
        console.log(`[viewer-deploy] Cleaning up old staging DB`);
        await deleteD1Database(accountId, oldStagingDb.uuid, cfToken);
      }

      // Create fresh database with production name
      console.log(`[viewer-deploy] Creating D1 database: ${dbName}`);
      let db: { uuid: string; name: string };
      try {
        db = await createD1Database(accountId, dbName, cfToken);
      } catch (err) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Failed to create D1: ${err}`,
        });
      }

      // Initialize viewer schema
      console.log("[viewer-deploy] Initializing schema...");
      const schemaResult = await executeD1(accountId, db.uuid, VIEWER_SCHEMA, [], cfToken);
      if (!schemaResult.success) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Schema init failed: ${schemaResult.error}`,
        });
      }

      // Upload MDX pages (clear and replace to handle deleted pages)
      // Uses same discovery logic as DomainSidebar - only deploys pages with associated domains
      console.log("[viewer-deploy] Discovering domain pages...");
      const pages = await getDomainPages(workbookDir);

      // Clear existing pages first
      const clearResult = await executeD1(accountId, db.uuid, `DELETE FROM _pages`, [], cfToken);
      if (!clearResult.success) {
        console.warn(`[viewer-deploy] Failed to clear pages: ${clearResult.error}`);
      }

      for (const page of pages) {
        const title = extractTitle(page.content) || page.id;
        const result = await executeD1(
          accountId,
          db.uuid,
          `INSERT INTO _pages (id, path, title, content, updated_at) VALUES (?, ?, ?, ?, unixepoch())`,
          [page.id, page.path, title, page.content],
          cfToken
        );
        if (!result.success) {
          console.warn(`[viewer-deploy] Failed to upload page ${page.id}: ${result.error}`);
        }
      }
      console.log(`[viewer-deploy] Uploaded ${pages.length} pages`);

      // Update metadata
      await executeD1(
        accountId,
        db.uuid,
        `INSERT OR REPLACE INTO _meta (key, value) VALUES ('name', ?)`,
        [workbookId],
        cfToken
      );
      await executeD1(
        accountId,
        db.uuid,
        `INSERT OR REPLACE INTO _meta (key, value) VALUES ('deployed_at', ?)`,
        [new Date().toISOString()],
        cfToken
      );

      // Sync data tables
      if (includeData) {
        const localDbPath = findLocalDbPath(workbookDir);
        console.log(`[viewer-deploy] Looking for local DB in: ${workbookDir}`);
        if (localDbPath) {
          console.log(`[viewer-deploy] Syncing data tables from: ${localDbPath}`);
          const localDb = new Database(localDbPath, { readonly: true });

          try {
            // Debug: list all tables first
            const allTables = localDb
              .query<{ name: string }, []>(`SELECT name FROM sqlite_master WHERE type='table'`)
              .all();
            console.log(`[viewer-deploy] All tables in local DB: ${allTables.map(t => t.name).join(', ') || '(none)'}`);

            // Get user tables (exclude system tables)
            // Note: Use ESCAPE to treat _ as literal underscore, not wildcard
            const tableNames = localDb
              .query<{ name: string }, []>(
                `SELECT name FROM sqlite_master
                 WHERE type='table'
                 AND name NOT LIKE 'sqlite\\_%' ESCAPE '\\'
                 AND name NOT LIKE '\\_\\_%' ESCAPE '\\'
                 AND name NOT LIKE '\\_cf\\_%' ESCAPE '\\'`
              )
              .all();

            console.log(`[viewer-deploy] User tables to sync: ${tableNames.map(t => t.name).join(', ') || '(none)'}`);

            if (tableNames.length > 0) {
              // Start transaction for data sync
              await executeD1(accountId, db.uuid, "BEGIN TRANSACTION", [], cfToken);

              try {
                // Create tables from local schema using PRAGMA table_info
                // (sqlite_master.sql doesn't reflect ALTER TABLE ADD COLUMN changes)
                for (const { name: tableName } of tableNames) {
                  // Get actual column info from PRAGMA
                  const tableColumns = localDb
                    .query<{ name: string; type: string; notnull: number; dflt_value: string | null; pk: number }, []>(
                      `PRAGMA table_info("${tableName}")`
                    )
                    .all();

                  // Build CREATE TABLE from column info
                  const colDefs = tableColumns.map((col) => {
                    let def = `"${col.name}" ${col.type || "TEXT"}`;
                    if (col.pk) def += " PRIMARY KEY";
                    if (col.notnull && !col.pk) def += " NOT NULL";
                    if (col.dflt_value !== null) def += ` DEFAULT ${col.dflt_value}`;
                    return def;
                  });
                  const createSql = `CREATE TABLE "${tableName}" (${colDefs.join(", ")})`;

                  console.log(`[viewer-deploy] Creating table: ${tableName}`);

                  const createResult = await executeD1(accountId, db.uuid, createSql, [], cfToken);
                  if (!createResult.success) {
                    throw new Error(`Failed to create table ${tableName}: ${createResult.error}`);
                  }

                  // Get all rows
                  const rows = localDb.query(`SELECT * FROM "${tableName}"`).all() as Record<
                    string,
                    unknown
                  >[];

                  if (rows.length === 0) {
                    console.log(`[viewer-deploy] Table ${tableName} is empty`);
                    continue;
                  }

                  // Generate SQL dump and send in chunks
                  const CHUNK_SIZE = 500;
                  const columns = Object.keys(rows[0]);
                  const columnList = columns.map((c) => `"${c}"`).join(", ");

                  console.log(`[viewer-deploy] Inserting ${rows.length} rows into ${tableName}...`);

                  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
                    const chunk = rows.slice(i, i + CHUNK_SIZE);

                    // Generate INSERT statements as raw SQL
                    const statements = chunk.map((row) => {
                      const values = columns.map((c) => escapeSqlValue(row[c])).join(", ");
                      return `INSERT INTO "${tableName}" (${columnList}) VALUES (${values})`;
                    });

                    const sql = statements.join(";\n") + ";";
                    const result = await executeD1Raw(accountId, db.uuid, sql, cfToken);

                    if (!result.success) {
                      throw new Error(`Batch insert failed: ${result.error}`);
                    }

                    // Progress log
                    const progress = Math.min(i + CHUNK_SIZE, rows.length);
                    console.log(`[viewer-deploy] ${tableName}: ${progress}/${rows.length}`);
                  }
                }

                // Commit transaction
                await executeD1(accountId, db.uuid, "COMMIT", [], cfToken);
                console.log(`[viewer-deploy] Data sync complete`);
              } catch (err) {
                // Rollback on error
                console.error(`[viewer-deploy] Sync failed, rolling back:`, err);
                await executeD1(accountId, db.uuid, "ROLLBACK", [], cfToken);
                throw err;
              }
            }
          } finally {
            localDb.close();
          }
        } else {
          console.log(`[viewer-deploy] No local database found at .hands/workbook.db`);
        }
      }

      // Save deploy info locally
      const deployInfo = {
        workbookId,
        d1DatabaseId: db.uuid,
        d1DatabaseName: db.name,
        accountId,
        deployedAt: new Date().toISOString(),
        viewerUrl: `https://view.hands.app/${workbookId}`,
      };
      writeFileSync(
        join(workbookDir, ".hands/viewer-deploy.json"),
        JSON.stringify(deployInfo, null, 2)
      );

      console.log(`[viewer-deploy] Done! View at: ${deployInfo.viewerUrl}`);

      return {
        success: true,
        url: deployInfo.viewerUrl,
        d1DatabaseId: db.uuid,
        pagesUploaded: pages.length,
      };
    }),

  /**
   * Get deployment status
   */
  status: t.procedure.query(async ({ ctx }) => {
    const deployInfoPath = join(ctx.workbookDir, ".hands/viewer-deploy.json");
    if (!existsSync(deployInfoPath)) {
      return { deployed: false, url: null, d1DatabaseId: null, deployedAt: null };
    }

    try {
      const info = JSON.parse(readFileSync(deployInfoPath, "utf-8"));
      return {
        deployed: true,
        url: info.viewerUrl as string,
        d1DatabaseId: info.d1DatabaseId as string,
        deployedAt: info.deployedAt as string,
      };
    } catch {
      return { deployed: false, url: null, d1DatabaseId: null, deployedAt: null };
    }
  }),
});

export type ViewerDeployRouter = typeof viewerDeployRouter;
