/**
 * Deploy Handler
 *
 * Receives workbook data and creates/populates a D1 database.
 * Called from the web app to publish a workbook.
 */

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

// ============================================================================
// Types
// ============================================================================

export interface DeployRequest {
  workbookId: string;
  meta: { name: string; description: string | null } | null;
  pages: Array<{ path: string; title: string | null; content: string }>;
  tables: Array<{
    name: string;
    schema: Array<{
      name: string;
      type: string;
      pk: boolean;
      notnull: boolean;
      dflt_value: string | null;
    }>;
    rows: Record<string, unknown>[];
  }>;
}

export interface DeployResult {
  success: boolean;
  url: string;
  d1DatabaseId: string;
  pagesUploaded: number;
  tablesUploaded: number;
}

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  result: T;
}

// ============================================================================
// D1 API Helpers
// ============================================================================

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
  console.log(`[deploy] Creating D1 database: ${name}`);
  const res = await fetch(`${CF_API_BASE}/accounts/${accountId}/d1/database`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name }),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to create D1: ${text}`);
  }

  const data = (await res.json()) as CloudflareResponse<{ uuid: string; name: string }>;
  if (!data.success) throw new Error(data.errors[0]?.message || "Failed to create D1");
  return data.result;
}

async function deleteD1Database(
  accountId: string,
  dbId: string,
  token: string
): Promise<void> {
  console.log(`[deploy] Deleting D1 database: ${dbId}`);
  await fetch(`${CF_API_BASE}/accounts/${accountId}/d1/database/${dbId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function executeD1(
  accountId: string,
  dbId: string,
  sql: string,
  params: unknown[],
  token: string
): Promise<{ success: boolean; error?: string }> {
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

  const data = (await res.json()) as CloudflareResponse<unknown>;
  if (!data.success) {
    return { success: false, error: data.errors[0]?.message };
  }

  return { success: true };
}

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

function escapeSqlValue(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

// ============================================================================
// Viewer Schema
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
// Deploy Handler
// ============================================================================

export async function handleDeploy(
  request: DeployRequest,
  accountId: string,
  apiToken: string
): Promise<DeployResult> {
  const { workbookId, meta, pages, tables } = request;

  console.log(`[deploy] Starting deploy for ${workbookId}...`);

  // D1 database name - limited to 40 chars
  const dbName = `hands-wb-${workbookId.slice(0, 40)}`;

  // Find and delete existing database (fresh deploy each time)
  const databases = await listD1Databases(accountId, apiToken);
  const existingDb = databases.find((d) => d.name === dbName);
  if (existingDb) {
    console.log(`[deploy] Deleting existing DB for fresh deploy`);
    await deleteD1Database(accountId, existingDb.uuid, apiToken);
  }

  // Create fresh database
  const db = await createD1Database(accountId, dbName, apiToken);

  // Initialize viewer schema
  console.log("[deploy] Initializing schema...");
  const schemaResult = await executeD1(accountId, db.uuid, VIEWER_SCHEMA, [], apiToken);
  if (!schemaResult.success) {
    throw new Error(`Schema init failed: ${schemaResult.error}`);
  }

  // Upload pages
  console.log(`[deploy] Uploading ${pages.length} pages...`);
  for (const page of pages) {
    // Generate page ID from path (e.g., "customers.mdx" -> "customers")
    const pageId = page.path.replace(/\.mdx$/, "").replace(/\//g, "-");
    // Generate route path (e.g., "customers.mdx" -> "/customers")
    const routePath = "/" + page.path.replace(/\.mdx$/, "").replace(/\/index$/, "");

    const result = await executeD1(
      accountId,
      db.uuid,
      `INSERT INTO _pages (id, path, title, content, updated_at) VALUES (?, ?, ?, ?, unixepoch())`,
      [pageId, routePath, page.title || pageId, page.content],
      apiToken
    );

    if (!result.success) {
      console.warn(`[deploy] Failed to upload page ${pageId}: ${result.error}`);
    }
  }

  // Update metadata
  await executeD1(
    accountId,
    db.uuid,
    `INSERT OR REPLACE INTO _meta (key, value) VALUES ('name', ?)`,
    [meta?.name || workbookId],
    apiToken
  );
  await executeD1(
    accountId,
    db.uuid,
    `INSERT OR REPLACE INTO _meta (key, value) VALUES ('deployed_at', ?)`,
    [new Date().toISOString()],
    apiToken
  );

  // Create and populate user tables
  console.log(`[deploy] Syncing ${tables.length} tables...`);

  for (const table of tables) {
    // Build CREATE TABLE from schema
    const colDefs = table.schema.map((col) => {
      let def = `"${col.name}" ${col.type || "TEXT"}`;
      if (col.pk) def += " PRIMARY KEY";
      if (col.notnull && !col.pk) def += " NOT NULL";
      // Skip complex default values (functions like datetime()) - D1 may not support them
      if (col.dflt_value !== null && !col.dflt_value.includes("(")) {
        def += ` DEFAULT ${col.dflt_value}`;
      }
      return def;
    });

    const createSql = `CREATE TABLE "${table.name}" (${colDefs.join(", ")})`;
    console.log(`[deploy] CREATE TABLE SQL: ${createSql}`);
    const createResult = await executeD1(accountId, db.uuid, createSql, [], apiToken);

    if (!createResult.success) {
      console.error(`[deploy] Failed to create table ${table.name}: ${createResult.error}`);
      continue;
    }

    if (table.rows.length === 0) {
      console.log(`[deploy] Table ${table.name} is empty`);
      continue;
    }

    // Insert rows in chunks
    const CHUNK_SIZE = 500;
    const columns = table.schema.map((c) => c.name);
    const columnList = columns.map((c) => `"${c}"`).join(", ");

    console.log(`[deploy] Inserting ${table.rows.length} rows into ${table.name}...`);

    for (let i = 0; i < table.rows.length; i += CHUNK_SIZE) {
      const chunk = table.rows.slice(i, i + CHUNK_SIZE);

      const statements = chunk.map((row) => {
        const values = columns.map((c) => escapeSqlValue(row[c])).join(", ");
        return `INSERT INTO "${table.name}" (${columnList}) VALUES (${values})`;
      });

      const sql = statements.join(";\n") + ";";
      const result = await executeD1Raw(accountId, db.uuid, sql, apiToken);

      if (!result.success) {
        console.error(`[deploy] Batch insert failed: ${result.error}`);
        break;
      }
    }
  }

  console.log(`[deploy] Done! Deployed to D1: ${db.uuid}`);

  return {
    success: true,
    url: `https://hands-viewer.kwang1imsa.workers.dev/${workbookId}`,
    d1DatabaseId: db.uuid,
    pagesUploaded: pages.length,
    tablesUploaded: tables.length,
  };
}
