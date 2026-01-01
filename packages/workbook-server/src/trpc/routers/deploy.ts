/**
 * tRPC Router for Deployment
 *
 * Handles building and deploying workbooks to Cloudflare Workers.
 * Uses programmatic APIs instead of CLI tools for self-contained binary.
 *
 * - Vite: spawns bundled bun with builder.js (native modules can't be compiled)
 * - Cloudflare: REST API for D1 and Workers
 */

import Database from "bun:sqlite";
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { initTRPC } from "@trpc/server";
import { z } from "zod";

// ============================================================================
// Bundled Tool Paths
// ============================================================================

/**
 * Get the path to the bundled bun binary
 */
function getBunPath(): string {
  // In dev: src-tauri/binaries/bun-{target}
  // In prod: Contents/MacOS/bun
  const devPath = join(dirname(dirname(dirname(dirname(dirname(import.meta.dir))))), "packages/desktop/src-tauri/binaries");

  if (process.env.NODE_ENV !== "production" && existsSync(devPath)) {
    // Dev mode - find the bun binary with target triple
    const files = readdirSync(devPath);
    const bunFile = files.find(f => f.startsWith("bun-"));
    if (bunFile) {
      return join(devPath, bunFile);
    }
  }

  // Production - bun is in same dir as the running binary (Contents/MacOS/)
  const exeDir = dirname(process.execPath);
  const prodPath = join(exeDir, "bun");
  if (existsSync(prodPath)) {
    return prodPath;
  }

  // Fallback to system bun
  return "bun";
}

/**
 * Get the path to the builder.js bundle
 */
function getBuilderPath(): string {
  // In dev: src-tauri/binaries/builder.js
  // In prod: Contents/Resources/builder.js
  const devPath = join(dirname(dirname(dirname(dirname(dirname(import.meta.dir))))), "packages/desktop/src-tauri/binaries/builder.js");

  if (existsSync(devPath)) {
    return devPath;
  }

  // Production - builder.js is in Resources/
  const exeDir = dirname(process.execPath);
  const prodPath = join(exeDir, "../Resources/builder.js");
  if (existsSync(prodPath)) {
    return prodPath;
  }

  throw new Error("builder.js not found");
}

/**
 * Get the path to lib/node_modules for native modules (lightningcss, etc.)
 */
function getLibPath(): string {
  // In dev: src-tauri/binaries/lib/node_modules
  // In prod: Contents/Resources/lib/node_modules
  const devPath = join(dirname(dirname(dirname(dirname(dirname(import.meta.dir))))), "packages/desktop/src-tauri/binaries/lib/node_modules");

  if (existsSync(devPath)) {
    return devPath;
  }

  // Production - lib is in Resources/
  const exeDir = dirname(process.execPath);
  const prodPath = join(exeDir, "../Resources/lib/node_modules");
  if (existsSync(prodPath)) {
    return prodPath;
  }

  return "";
}

// ============================================================================
// Context
// ============================================================================

export interface DeployContext {
  workbookId: string;
  workbookDir: string;
  getRuntimeUrl: () => string | null;
}

// ============================================================================
// tRPC Setup
// ============================================================================

const t = initTRPC.context<DeployContext>().create();

const publicProcedure = t.procedure;

// ============================================================================
// Cloudflare API Helpers
// ============================================================================

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface CloudflareResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: string[];
  result: T;
}

/**
 * Get account ID from Cloudflare API token
 */
async function getAccountId(cfToken: string): Promise<string> {
  const response = await fetch(`${CF_API_BASE}/accounts`, {
    headers: { Authorization: `Bearer ${cfToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to get account ID: ${response.statusText}`);
  }

  const data = (await response.json()) as CloudflareResponse<Array<{ id: string; name: string }>>;
  if (!data.success || !data.result.length) {
    throw new Error("No Cloudflare accounts found for this token");
  }

  return data.result[0].id;
}

/**
 * List D1 databases
 */
async function listD1Databases(
  accountId: string,
  cfToken: string,
): Promise<Array<{ uuid: string; name: string }>> {
  const response = await fetch(`${CF_API_BASE}/accounts/${accountId}/d1/database`, {
    headers: { Authorization: `Bearer ${cfToken}` },
  });

  if (!response.ok) {
    throw new Error(`Failed to list D1 databases: ${response.statusText}`);
  }

  const data = (await response.json()) as CloudflareResponse<
    Array<{ uuid: string; name: string }>
  >;
  return data.success ? data.result : [];
}

/**
 * Create D1 database
 */
async function createD1Database(
  accountId: string,
  dbName: string,
  cfToken: string,
): Promise<{ uuid: string; name: string }> {
  const response = await fetch(`${CF_API_BASE}/accounts/${accountId}/d1/database`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: dbName }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to create D1 database: ${response.statusText} - ${text}`);
  }

  const data = (await response.json()) as CloudflareResponse<{ uuid: string; name: string }>;
  if (!data.success) {
    throw new Error(`Failed to create D1 database: ${data.errors.map((e) => e.message).join(", ")}`);
  }

  return data.result;
}

/**
 * Execute SQL on D1 database
 */
async function executeD1Sql(
  accountId: string,
  databaseId: string,
  sql: string,
  cfToken: string,
): Promise<{ success: boolean; error?: string }> {
  const response = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: `${response.statusText}: ${text}` };
  }

  const data = (await response.json()) as CloudflareResponse<unknown>;
  return { success: data.success, error: data.errors?.[0]?.message };
}

/**
 * Query D1 database and return results
 */
async function queryD1(
  accountId: string,
  databaseId: string,
  sql: string,
  cfToken: string,
): Promise<{ success: boolean; results?: unknown[]; error?: string }> {
  const response = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/d1/database/${databaseId}/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sql }),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: `${response.statusText}: ${text}` };
  }

  const data = (await response.json()) as CloudflareResponse<Array<{ results: unknown[] }>>;
  if (!data.success) {
    return { success: false, error: data.errors?.[0]?.message };
  }

  return { success: true, results: data.result?.[0]?.results ?? [] };
}

/**
 * Get workers.dev subdomain for the account
 */
async function getWorkersSubdomain(accountId: string, cfToken: string): Promise<string | null> {
  const response = await fetch(`${CF_API_BASE}/accounts/${accountId}/workers/subdomain`, {
    headers: { Authorization: `Bearer ${cfToken}` },
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as CloudflareResponse<{ subdomain: string }>;
  return data.success ? data.result.subdomain : null;
}

/**
 * Deploy worker script with assets
 */
async function deployWorker(
  accountId: string,
  workerName: string,
  distDir: string,
  metadata: object,
  cfToken: string,
): Promise<{ success: boolean; error?: string }> {
  // Read the worker script
  const workerPath = join(distDir, "worker/index.js");
  if (!existsSync(workerPath)) {
    return { success: false, error: "Worker script not found" };
  }

  const workerScript = readFileSync(workerPath, "utf-8");

  // Read source map if exists
  const sourceMapPath = join(distDir, "worker/index.js.map");
  const sourceMap = existsSync(sourceMapPath) ? readFileSync(sourceMapPath, "utf-8") : null;

  // Build form data for multipart upload
  const formData = new FormData();

  // Add worker script
  formData.append("worker.js", new Blob([workerScript], { type: "application/javascript" }), "worker.js");

  // Add source map if exists
  if (sourceMap) {
    formData.append("worker.js.map", new Blob([sourceMap], { type: "application/json" }), "worker.js.map");
  }

  // Add metadata
  formData.append(
    "metadata",
    new Blob([JSON.stringify(metadata)], { type: "application/json" }),
  );

  const response = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/workers/scripts/${workerName}`,
    {
      method: "PUT",
      headers: { Authorization: `Bearer ${cfToken}` },
      body: formData,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    return { success: false, error: `${response.statusText}: ${text}` };
  }

  const data = (await response.json()) as CloudflareResponse<unknown>;
  return { success: data.success, error: data.errors?.[0]?.message };
}

/**
 * Upload static assets for worker
 */
async function uploadAssets(
  accountId: string,
  workerName: string,
  distDir: string,
  cfToken: string,
): Promise<{ success: boolean; error?: string }> {
  const clientDir = join(distDir, "client");
  if (!existsSync(clientDir)) {
    return { success: true }; // No assets to upload
  }

  // Collect all files recursively
  const files: Array<{ path: string; content: Buffer }> = [];
  function collectFiles(dir: string, basePath = "") {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      const relativePath = basePath ? `${basePath}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        collectFiles(fullPath, relativePath);
      } else {
        files.push({ path: relativePath, content: readFileSync(fullPath) });
      }
    }
  }
  collectFiles(clientDir);

  if (files.length === 0) {
    return { success: true };
  }

  // Upload assets using Workers Assets API
  // First, create an upload session
  const createResponse = await fetch(
    `${CF_API_BASE}/accounts/${accountId}/workers/scripts/${workerName}/assets/upload`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        manifest: Object.fromEntries(
          files.map((f) => [f.path, { hash: "", size: f.content.length }]),
        ),
      }),
    },
  );

  if (!createResponse.ok) {
    // Assets API might not be available, try alternative approach
    console.log("[deploy] Assets API not available, assets will be served from worker");
    return { success: true };
  }

  return { success: true };
}

// ============================================================================
// Build & Deploy Helpers
// ============================================================================

/**
 * Find the runtime package path
 */
function getRuntimePath(): string {
  // workbook-server is at packages/workbook-server
  // runtime is at packages/runtime
  const workbookServerDir = dirname(dirname(dirname(import.meta.dir)));
  return join(dirname(workbookServerDir), "runtime");
}

interface WorkflowBinding {
  className: string;
  binding: string;
}

/**
 * Parse .env.local file and return secrets
 */
function readSecretsFromEnvLocal(workbookDir: string): Record<string, string> {
  const envPath = join(workbookDir, ".env.local");
  if (!existsSync(envPath)) {
    return {};
  }

  try {
    const content = readFileSync(envPath, "utf-8");
    const secrets: Record<string, string> = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      // Remove quotes if present
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      // Only include non-empty values
      if (value) {
        secrets[key] = value;
      }
    }

    return secrets;
  } catch {
    return {};
  }
}

/**
 * Read workflow bindings from generated manifest
 */
function readWorkflowBindings(workbookDir: string): Record<string, WorkflowBinding> {
  const workflowsPath = join(workbookDir, ".hands/actions/workflows.ts");
  if (!existsSync(workflowsPath)) {
    return {};
  }

  try {
    const content = readFileSync(workflowsPath, "utf-8");
    // Extract workflowBindings object from the generated file
    const match = content.match(/export const workflowBindings = \{([^}]+)\}/s);
    if (!match) return {};

    const bindings: Record<string, WorkflowBinding> = {};
    const bindingMatches = match[1].matchAll(
      /"([^"]+)":\s*\{\s*className:\s*"([^"]+)",\s*binding:\s*"([^"]+)"\s*\}/g,
    );

    for (const [, id, className, binding] of bindingMatches) {
      bindings[id] = { className, binding };
    }

    return bindings;
  } catch {
    return {};
  }
}

/**
 * Generate worker metadata for Cloudflare API deployment
 */
function generateWorkerMetadata(
  workerName: string,
  d1DatabaseId: string,
  d1DatabaseName: string,
  workflowBindings: Record<string, WorkflowBinding>,
  secrets: Record<string, string>,
): object {
  const bindings: Array<object> = [];

  // D1 database binding
  bindings.push({
    type: "d1",
    name: "DB",
    id: d1DatabaseId,
  });

  // Add secrets as plain text bindings (HANDS_SECRET_*)
  for (const [key, value] of Object.entries(secrets)) {
    bindings.push({
      type: "plain_text",
      name: `HANDS_SECRET_${key}`,
      text: value,
    });
  }

  // Workflow bindings
  for (const [id, { className, binding }] of Object.entries(workflowBindings)) {
    bindings.push({
      type: "workflow",
      name: binding,
      workflow_name: id,
      class_name: className,
    });
  }

  return {
    main_module: "worker.js",
    compatibility_date: "2025-01-01",
    compatibility_flags: ["nodejs_compat", "nodejs_als"],
    bindings,
  };
}

/**
 * Find or create D1 database for this workbook
 */
async function findOrCreateD1Database(
  dbName: string,
  accountId: string,
  cfToken: string,
): Promise<{ id: string; name: string; created: boolean }> {
  // List existing D1 databases
  const databases = await listD1Databases(accountId, cfToken);
  const existing = databases.find((db) => db.name === dbName);

  if (existing) {
    return { id: existing.uuid, name: existing.name, created: false };
  }

  // Create new D1 database
  const created = await createD1Database(accountId, dbName, cfToken);
  return { id: created.uuid, name: created.name, created: true };
}

/**
 * Find the local D1 SQLite database file
 * D1 databases are stored at: {workbook}/.hands/db/v3/d1/{database_name}/{hash}.sqlite
 */
function findLocalDbPath(workbookDir: string): string | null {
  const d1Path = join(workbookDir, ".hands/db/v3/d1");
  if (!existsSync(d1Path)) return null;

  // Look for database folders
  let dbFolders: string[];
  try {
    dbFolders = readdirSync(d1Path, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }

  if (dbFolders.length === 0) return null;

  // Use the first database folder
  const dbFolder = join(d1Path, dbFolders[0]);

  // Find .sqlite files in the folder
  let sqliteFiles: string[];
  try {
    sqliteFiles = readdirSync(dbFolder).filter((f) => f.endsWith(".sqlite"));
  } catch {
    return null;
  }

  if (sqliteFiles.length === 0) return null;

  // If multiple files, use the most recently modified
  if (sqliteFiles.length > 1) {
    sqliteFiles.sort((a, b) => {
      const aPath = join(dbFolder, a);
      const bPath = join(dbFolder, b);
      return statSync(bPath).mtimeMs - statSync(aPath).mtimeMs;
    });
  }

  return join(dbFolder, sqliteFiles[0]);
}

/**
 * Export local SQLite database as SQL INSERT statements
 */
function exportDbToSql(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  const statements: string[] = [];

  try {
    // Get all user tables
    const tables = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '__*'",
      )
      .all();

    for (const { name: tableName } of tables) {
      // Get table schema
      const createStmt = db
        .query<{ sql: string }, [string]>(
          "SELECT sql FROM sqlite_master WHERE type='table' AND name=?",
        )
        .get(tableName);

      if (createStmt?.sql) {
        // Use CREATE TABLE IF NOT EXISTS
        statements.push(createStmt.sql.replace("CREATE TABLE", "CREATE TABLE IF NOT EXISTS"));
      }

      // Get all rows
      const rows = db.query(`SELECT * FROM "${tableName}"`).all() as Record<string, unknown>[];

      for (const row of rows) {
        const columns = Object.keys(row);
        const values = columns.map((col) => {
          const val = row[col];
          if (val === null) return "NULL";
          if (typeof val === "number") return String(val);
          if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
          return `'${String(val).replace(/'/g, "''")}'`;
        });

        statements.push(
          `INSERT OR REPLACE INTO "${tableName}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")})`,
        );
      }
    }
  } finally {
    db.close();
  }

  return statements;
}

/**
 * Sync local D1 database to remote D1 using Cloudflare API
 */
async function syncLocalDbToRemote(
  localDbPath: string,
  accountId: string,
  databaseId: string,
  cfToken: string,
): Promise<{ success: boolean; executed: number; error?: string }> {
  // Export local SQLite to SQL statements
  const statements = exportDbToSql(localDbPath);
  if (statements.length === 0) {
    return { success: true, executed: 0 };
  }

  console.log(`[deploy] Syncing ${statements.length} statements to remote D1...`);

  let executed = 0;
  let lastError: string | undefined;

  // Execute statements in batches (D1 API has limits)
  const batchSize = 100;
  for (let i = 0; i < statements.length; i += batchSize) {
    const batch = statements.slice(i, i + batchSize);
    const sql = batch.join(";\n") + ";";

    const result = await executeD1Sql(accountId, databaseId, sql, cfToken);
    if (!result.success) {
      lastError = result.error;
      console.error(`[deploy] Batch ${i / batchSize + 1} failed:`, result.error);
    } else {
      executed += batch.length;
    }
  }

  return {
    success: executed === statements.length,
    executed,
    error: lastError,
  };
}

/**
 * Build the full worker URL from name and subdomain
 */
function buildWorkerUrl(workerName: string, subdomain: string | null): string {
  if (subdomain) {
    return `https://${workerName}.${subdomain}.workers.dev`;
  }
  return `https://${workerName}.workers.dev`;
}

// ============================================================================
// Router
// ============================================================================

export const deployRouter = t.router({
  /**
   * Build and deploy the workbook to Cloudflare Workers
   */
  publish: publicProcedure
    .input(z.object({ includeDb: z.boolean().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const { workbookId, workbookDir } = ctx;
      const includeDb = input?.includeDb ?? false;
      const runtimePath = getRuntimePath();

      // Get CF token from env vars
      const cfToken = process.env.HANDS_CF_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
      if (!cfToken) {
        return {
          success: false,
          error: "Set CLOUDFLARE_API_TOKEN environment variable to deploy.",
          url: null,
        };
      }

      // Get account ID
      let accountId: string;
      try {
        accountId = await getAccountId(cfToken);
      } catch (err) {
        return {
          success: false,
          error: `Failed to get Cloudflare account: ${err instanceof Error ? err.message : String(err)}`,
          url: null,
        };
      }

      // Generate worker name from workbook ID
      // Sanitize: lowercase, alphanumeric + hyphens only
      const sanitizedId = workbookId
        .toLowerCase()
        .replace(/[^a-z0-9-]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 50);
      const workerName = `hands-${sanitizedId}`;

      console.log(`[deploy] Starting deployment for ${workerName}...`);

      // Step 1: Run Vite build using bundled bun + builder.js
      console.log("[deploy] Building workbook...");
      const distDir = join(workbookDir, ".hands/dist");

      try {
        const bunPath = getBunPath();
        const builderPath = getBuilderPath();
        const libPath = getLibPath();

        console.log(`[deploy] Using bun: ${bunPath}`);
        console.log(`[deploy] Using builder: ${builderPath}`);
        console.log(`[deploy] Using lib: ${libPath}`);

        // Spawn bun with builder.js to build the workbook
        // Set NODE_PATH so native modules (lightningcss) can be found
        const buildResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
          const nodePathEnv = libPath
            ? `${libPath}${process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : ""}`
            : process.env.NODE_PATH || "";

          const proc = spawn(bunPath, [builderPath, workbookDir, distDir], {
            stdio: ["ignore", "pipe", "pipe"],
            env: {
              ...process.env,
              NODE_PATH: nodePathEnv,
            },
          });

          let stdout = "";
          let stderr = "";

          proc.stdout?.on("data", (data) => {
            const text = data.toString();
            stdout += text;
            console.log(text.trim());
          });

          proc.stderr?.on("data", (data) => {
            const text = data.toString();
            stderr += text;
            console.error(text.trim());
          });

          proc.on("close", (code) => {
            if (code === 0) {
              resolve({ success: true });
            } else {
              resolve({ success: false, error: stderr || `Build exited with code ${code}` });
            }
          });

          proc.on("error", (err) => {
            resolve({ success: false, error: err.message });
          });
        });

        if (!buildResult.success) {
          return {
            success: false,
            error: `Build failed: ${buildResult.error}`,
            url: null,
          };
        }
      } catch (err) {
        console.error("[deploy] Build failed:", err);
        return {
          success: false,
          error: `Build failed: ${err instanceof Error ? err.message : String(err)}`,
          url: null,
        };
      }

      console.log("[deploy] Build completed successfully");

      // Verify build output exists
      if (!existsSync(join(distDir, "worker"))) {
        // RWSDK might output to runtime/dist instead of our configured outDir
        const runtimeDistDir = join(getRuntimePath(), "dist");
        if (existsSync(join(runtimeDistDir, "worker"))) {
          // Copy from runtime/dist to workbook/.hands/dist
          console.log("[deploy] Copying build output to workbook...");
          if (existsSync(distDir)) {
            rmSync(distDir, { recursive: true, force: true });
          }
          mkdirSync(distDir, { recursive: true });
          cpSync(runtimeDistDir, distDir, { recursive: true });
        } else {
          return {
            success: false,
            error: "Build output not found. Build may have failed.",
            url: null,
          };
        }
      }

      // Step 2: Find or create D1 database
      const d1DatabaseName = `hands-${sanitizedId}`;
      console.log(`[deploy] Setting up D1 database: ${d1DatabaseName}...`);

      let d1Database: { id: string; name: string; created: boolean };
      try {
        d1Database = await findOrCreateD1Database(d1DatabaseName, accountId, cfToken);
        if (d1Database.created) {
          console.log(`[deploy] Created new D1 database: ${d1Database.name}`);
        } else {
          console.log(`[deploy] Using existing D1 database: ${d1Database.name}`);
        }
      } catch (err) {
        return {
          success: false,
          error: `Failed to setup D1 database: ${err instanceof Error ? err.message : String(err)}`,
          url: null,
        };
      }

      // Read workflow bindings from generated manifest
      const workflowBindings = readWorkflowBindings(workbookDir);
      const workflowCount = Object.keys(workflowBindings).length;
      if (workflowCount > 0) {
        console.log(`[deploy] Found ${workflowCount} workflow actions`);
      }

      // Read secrets from .env.local
      const secrets = readSecretsFromEnvLocal(workbookDir);
      const secretCount = Object.keys(secrets).length;
      if (secretCount > 0) {
        console.log(`[deploy] Including ${secretCount} secrets from .env.local`);
      }

      // Step 3: Generate worker metadata
      const workerMetadata = generateWorkerMetadata(
        workerName,
        d1Database.id,
        d1Database.name,
        workflowBindings,
        secrets,
      );

      // Also save wrangler.json for reference/debugging
      const wranglerConfig = {
        name: workerName,
        main: "worker/index.js",
        compatibility_date: "2025-01-01",
        compatibility_flags: ["nodejs_compat", "nodejs_als"],
        d1_databases: [
          {
            binding: "DB",
            database_name: d1Database.name,
            database_id: d1Database.id,
          },
        ],
      };
      writeFileSync(join(distDir, "wrangler.json"), JSON.stringify(wranglerConfig, null, 2));

      // Step 4: Deploy worker using Cloudflare API
      console.log("[deploy] Deploying to Cloudflare Workers...");
      const deployResult = await deployWorker(accountId, workerName, distDir, workerMetadata, cfToken);

      if (!deployResult.success) {
        console.error("[deploy] Deploy failed:", deployResult.error);
        return {
          success: false,
          error: `Deploy failed: ${deployResult.error}`,
          url: null,
        };
      }

      // Get workers subdomain for URL
      const subdomain = await getWorkersSubdomain(accountId, cfToken);
      const deployedUrl = buildWorkerUrl(workerName, subdomain);

      // Cache subdomain in config for fast status queries
      if (subdomain) {
        const configWithSubdomain = { ...wranglerConfig, _subdomain: subdomain, _accountId: accountId };
        writeFileSync(join(distDir, "wrangler.json"), JSON.stringify(configWithSubdomain, null, 2));
      }

      console.log(`[deploy] Deployed successfully to ${deployedUrl}`);

      // Step 5: Sync local DB if requested
      if (includeDb) {
        console.log("[deploy] Syncing local database to production D1...");

        const dbPath = findLocalDbPath(workbookDir);
        if (dbPath) {
          const syncResult = await syncLocalDbToRemote(dbPath, accountId, d1Database.id, cfToken);
          if (syncResult.success) {
            console.log(`[deploy] Database synced: ${syncResult.executed} statements executed`);
          } else {
            console.error("[deploy] Database sync failed:", syncResult.error);
          }
        } else {
          console.log("[deploy] No local database found to sync");
        }
      }

      return {
        success: true,
        error: null,
        url: deployedUrl,
        workerName,
        d1DatabaseId: d1Database.id,
        d1DatabaseName: d1Database.name,
      };
    }),

  /**
   * Get current deployment status
   */
  status: publicProcedure.query(async ({ ctx }) => {
    const { workbookDir } = ctx;

    // Check if there's a previous deployment (fast local check)
    const distDir = join(workbookDir, ".hands/dist");
    const wranglerPath = join(distDir, "wrangler.json");

    if (!existsSync(wranglerPath)) {
      return {
        deployed: false,
        url: null,
        workerName: null,
        d1DatabaseName: null,
        lastDeployedAt: null,
      };
    }

    try {
      const config = JSON.parse(readFileSync(wranglerPath, "utf-8")) as {
        name: string;
        d1_databases?: Array<{ database_name: string; database_id: string }>;
        _subdomain?: string;
      };
      const workerName = config.name;
      const d1Database = config.d1_databases?.[0];

      // Check for cached subdomain in config
      const url = buildWorkerUrl(workerName, config._subdomain || null);

      return {
        deployed: true,
        url,
        workerName,
        d1DatabaseName: d1Database?.database_name ?? null,
        d1DatabaseId: d1Database?.database_id ?? null,
        lastDeployedAt: null,
      };
    } catch {
      return {
        deployed: false,
        url: null,
        workerName: null,
        d1DatabaseName: null,
        lastDeployedAt: null,
      };
    }
  }),

  /**
   * Push local database to production D1
   */
  pushDb: publicProcedure.mutation(async ({ ctx }) => {
    const { workbookDir } = ctx;

    // Get deployment info
    const distDir = join(workbookDir, ".hands/dist");
    const wranglerPath = join(distDir, "wrangler.json");

    if (!existsSync(wranglerPath)) {
      return { success: false, error: "No deployment found. Deploy first." };
    }

    const cfToken = process.env.HANDS_CF_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
    if (!cfToken) {
      return { success: false, error: "No Cloudflare API token configured." };
    }

    let config: {
      d1_databases?: Array<{ database_name: string; database_id: string }>;
      _accountId?: string;
    };
    try {
      config = JSON.parse(readFileSync(wranglerPath, "utf-8"));
    } catch {
      return { success: false, error: "Failed to read deployment config." };
    }

    const d1Database = config.d1_databases?.[0];
    if (!d1Database?.database_id) {
      return { success: false, error: "No D1 database configured. Redeploy first." };
    }

    // Get account ID (cached or fetch)
    let accountId = config._accountId;
    if (!accountId) {
      try {
        accountId = await getAccountId(cfToken);
      } catch (err) {
        return { success: false, error: `Failed to get account: ${err}` };
      }
    }

    // Find local DB
    const dbPath = findLocalDbPath(workbookDir);
    if (!dbPath) {
      return { success: false, error: "No local database found." };
    }

    // Sync using Cloudflare API
    const result = await syncLocalDbToRemote(dbPath, accountId, d1Database.database_id, cfToken);
    return {
      success: result.success,
      executed: result.executed,
      error: result.error ?? null,
    };
  }),

  /**
   * Pull production D1 database to local
   */
  pullDb: publicProcedure.mutation(async ({ ctx }) => {
    const { workbookDir, getRuntimeUrl } = ctx;

    // Get deployment info
    const distDir = join(workbookDir, ".hands/dist");
    const wranglerPath = join(distDir, "wrangler.json");

    if (!existsSync(wranglerPath)) {
      return { success: false, error: "No deployment found. Deploy first." };
    }

    const cfToken = process.env.HANDS_CF_TOKEN || process.env.CLOUDFLARE_API_TOKEN;
    if (!cfToken) {
      return { success: false, error: "No Cloudflare API token configured." };
    }

    let config: {
      d1_databases?: Array<{ database_name: string; database_id: string }>;
      _accountId?: string;
    };
    try {
      config = JSON.parse(readFileSync(wranglerPath, "utf-8"));
    } catch {
      return { success: false, error: "Failed to read deployment config." };
    }

    const d1Database = config.d1_databases?.[0];
    if (!d1Database?.database_id) {
      return { success: false, error: "No D1 database configured. Redeploy first." };
    }

    // Get runtime URL to execute SQL locally
    const runtimeUrl = getRuntimeUrl();
    if (!runtimeUrl) {
      return { success: false, error: "Runtime not running. Start the runtime first." };
    }

    // Get account ID (cached or fetch)
    let accountId = config._accountId;
    if (!accountId) {
      try {
        accountId = await getAccountId(cfToken);
      } catch (err) {
        return { success: false, error: `Failed to get account: ${err}` };
      }
    }

    try {
      // Get all table names from remote D1
      const tableResult = await queryD1(
        accountId,
        d1Database.database_id,
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%'",
        cfToken,
      );

      if (!tableResult.success) {
        return { success: false, error: `Failed to get tables: ${tableResult.error}` };
      }

      const tables = (tableResult.results as Array<{ name: string }>).map((r) => r.name);
      console.log(`[pullDb] Found ${tables.length} tables to pull`);

      let executed = 0;

      // For each table, export data and execute locally
      for (const table of tables) {
        // Get table data
        const dataResult = await queryD1(
          accountId,
          d1Database.database_id,
          `SELECT * FROM "${table}"`,
          cfToken,
        );

        if (!dataResult.success) {
          console.warn(`[pullDb] Failed to get data from ${table}`);
          continue;
        }

        const rows = dataResult.results as Record<string, unknown>[];

        // Generate INSERT statements and execute locally
        for (const row of rows) {
          const columns = Object.keys(row);
          const values = columns.map((col) => {
            const val = row[col];
            if (val === null) return "NULL";
            if (typeof val === "number") return String(val);
            if (typeof val === "string") return `'${val.replace(/'/g, "''")}'`;
            return `'${String(val).replace(/'/g, "''")}'`;
          });

          const stmt = `INSERT OR REPLACE INTO "${table}" (${columns.map((c) => `"${c}"`).join(", ")}) VALUES (${values.join(", ")})`;

          // Execute locally
          const execResponse = await fetch(`${runtimeUrl}/db/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ sql: stmt }),
          });

          if (execResponse.ok) {
            executed++;
          }
        }
      }

      return {
        success: true,
        executed,
        total: executed,
        error: null,
      };
    } catch (err) {
      return {
        success: false,
        error: `Pull failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }),
});

export type DeployRouter = typeof deployRouter;
