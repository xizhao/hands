/**
 * tRPC Router for Deployment
 *
 * Handles building and deploying workbooks to Cloudflare Workers.
 * Also handles database sync between local and production.
 */

import { initTRPC } from "@trpc/server";
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { z } from "zod";
import Database from "bun:sqlite";

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
// Helpers
// ============================================================================

/**
 * Run a command and return stdout/stderr
 */
async function runCommand(
  command: string,
  args: string[],
  options: { cwd: string; env?: Record<string, string> }
): Promise<{ success: boolean; stdout: string; stderr: string; code: number }> {
  return new Promise((resolve) => {
    const proc = spawn(command, args, {
      cwd: options.cwd,
      env: { ...process.env, ...options.env },
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (data) => {
      stdout += data.toString();
    });

    proc.stderr?.on("data", (data) => {
      stderr += data.toString();
    });

    proc.on("close", (code) => {
      resolve({
        success: code === 0,
        stdout,
        stderr,
        code: code ?? 1,
      });
    });

    proc.on("error", (err) => {
      resolve({
        success: false,
        stdout,
        stderr: err.message,
        code: 1,
      });
    });
  });
}

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
    const bindingMatches = match[1].matchAll(/"([^"]+)":\s*\{\s*className:\s*"([^"]+)",\s*binding:\s*"([^"]+)"\s*\}/g);

    for (const [, id, className, binding] of bindingMatches) {
      bindings[id] = { className, binding };
    }

    return bindings;
  } catch {
    return {};
  }
}

/**
 * Generate wrangler.json for deployment
 */
function generateWranglerConfig(
  workerName: string,
  workflowBindings: Record<string, WorkflowBinding>,
  seedSecret?: string
): object {
  const config: Record<string, unknown> = {
    name: workerName,
    main: "worker/index.js",
    compatibility_date: "2025-01-01",
    compatibility_flags: ["nodejs_compat", "nodejs_als"],
    assets: {
      directory: "client",
      binding: "ASSETS",
    },
    durable_objects: {
      bindings: [
        { name: "DATABASE", class_name: "Database" },
        { name: "SYNCED_STATE_SERVER", class_name: "SyncedStateServer" },
      ],
    },
    migrations: [
      { tag: "v1", new_sqlite_classes: ["Database"] },
      { tag: "v2", new_sqlite_classes: ["SyncedStateServer"] },
    ],
    observability: { enabled: true },
  };

  // Add workflow bindings if any
  const workflowEntries = Object.entries(workflowBindings);
  if (workflowEntries.length > 0) {
    config.workflows = workflowEntries.map(([id, { className, binding }]) => ({
      name: id,
      class_name: className,
      binding,
    }));
  }

  // Add seed secret as env var if provided
  if (seedSecret) {
    config.vars = { HANDS_SEED_SECRET: seedSecret };
  }

  return config;
}

/**
 * Find the local SQLite database file for the workbook's Database DO
 */
function findLocalDbPath(workbookDir: string): string | null {
  // Miniflare stores DO SQLite in .hands/db/miniflare-*.sqlite
  const dbDir = join(workbookDir, ".hands/db");
  if (!existsSync(dbDir)) return null;

  // Look for the Database DO's SQLite file
  // Format: miniflare-{namespace}/blobs/{id}/db.sqlite or similar
  const entries = readdirSync(dbDir, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (entry.isFile() && entry.name.endsWith(".sqlite")) {
      const fullPath = join(entry.parentPath || entry.path, entry.name);
      // Check if this is a user database (not internal miniflare state)
      try {
        const db = new Database(fullPath, { readonly: true });
        const tables = db.query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '__*'").all();
        db.close();
        if (tables.length > 0) {
          return fullPath;
        }
      } catch {
        // Skip files that can't be opened as SQLite
      }
    }
  }
  return null;
}

/**
 * Export local SQLite database as SQL INSERT statements
 */
function exportDbToSql(dbPath: string): string[] {
  const db = new Database(dbPath, { readonly: true });
  const statements: string[] = [];

  try {
    // Get all user tables
    const tables = db.query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '__*'"
    ).all();

    for (const { name: tableName } of tables) {
      // Get table schema
      const createStmt = db.query<{ sql: string }, [string]>(
        "SELECT sql FROM sqlite_master WHERE type='table' AND name=?"
      ).get(tableName);

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
          `INSERT OR REPLACE INTO "${tableName}" (${columns.map(c => `"${c}"`).join(", ")}) VALUES (${values.join(", ")})`
        );
      }
    }
  } finally {
    db.close();
  }

  return statements;
}

/**
 * Generate a random seed secret
 */
function generateSeedSecret(): string {
  return crypto.randomUUID();
}

/**
 * Get the workers.dev subdomain for the current CF account
 */
async function getWorkersSubdomain(distDir: string, cfToken: string): Promise<string | null> {
  const result = await runCommand("npx", ["wrangler", "subdomain"], {
    cwd: distDir,
    env: { CLOUDFLARE_API_TOKEN: cfToken },
  });

  if (result.success) {
    // Output is like "👷 Your subdomain is: kwang1imsa"
    const match = result.stdout.match(/subdomain is[:\s]+(\S+)/i) ||
                  result.stdout.match(/(\w+)\.workers\.dev/);
    if (match) {
      return match[1].replace(".workers.dev", "");
    }
  }
  return null;
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

      // Step 1: Run Vite build
      console.log("[deploy] Building workbook...");
      const buildResult = await runCommand("bun", ["run", "build"], {
        cwd: runtimePath,
        env: {
          HANDS_WORKBOOK_PATH: workbookDir,
          NODE_ENV: "production",
        },
      });

      if (!buildResult.success) {
        console.error("[deploy] Build failed:", buildResult.stderr);
        return {
          success: false,
          error: `Build failed: ${buildResult.stderr || buildResult.stdout}`,
          url: null,
        };
      }

      console.log("[deploy] Build completed successfully");

      // Step 2: Copy build output from runtime/dist to workbook/.hands/dist
      // RWSDK outputs to runtime/dist, not the configured outDir
      const runtimeDistDir = join(runtimePath, "dist");
      const distDir = join(workbookDir, ".hands/dist");

      if (!existsSync(runtimeDistDir)) {
        return {
          success: false,
          error: "Build output not found in runtime/dist. Build may have failed.",
          url: null,
        };
      }

      // Clean and copy dist folder
      console.log("[deploy] Copying build output to workbook...");
      if (existsSync(distDir)) {
        rmSync(distDir, { recursive: true, force: true });
      }
      mkdirSync(distDir, { recursive: true });
      cpSync(runtimeDistDir, distDir, { recursive: true });

      // Generate seed secret if including DB
      const seedSecret = includeDb ? generateSeedSecret() : undefined;

      // Read workflow bindings from generated manifest
      const workflowBindings = readWorkflowBindings(workbookDir);
      const workflowCount = Object.keys(workflowBindings).length;
      if (workflowCount > 0) {
        console.log(`[deploy] Found ${workflowCount} workflow actions`);
      }

      const wranglerConfig = generateWranglerConfig(workerName, workflowBindings, seedSecret);
      const wranglerPath = join(distDir, "wrangler.json");
      writeFileSync(wranglerPath, JSON.stringify(wranglerConfig, null, 2));
      console.log(`[deploy] Generated wrangler.json for ${workerName}`);

      // Step 3: Run wrangler deploy
      console.log("[deploy] Deploying to Cloudflare Workers...");
      const deployResult = await runCommand("npx", ["wrangler", "deploy"], {
        cwd: distDir,
        env: {
          CLOUDFLARE_API_TOKEN: cfToken,
        },
      });

      if (!deployResult.success) {
        console.error("[deploy] Deploy failed:", deployResult.stderr);
        return {
          success: false,
          error: `Deploy failed: ${deployResult.stderr || deployResult.stdout}`,
          url: null,
        };
      }

      // Extract URL from wrangler output
      // wrangler outputs: "Published <name> (<id>)\n  https://<name>.<subdomain>.workers.dev"
      const urlMatch = deployResult.stdout.match(
        /https:\/\/[^\s]+\.workers\.dev/
      );
      const deployedUrl = urlMatch
        ? urlMatch[0]
        : `https://${workerName}.workers.dev`;

      // Extract and cache subdomain for fast status queries
      const subdomainMatch = deployedUrl.match(/\.([^.]+)\.workers\.dev$/);
      if (subdomainMatch) {
        const subdomain = subdomainMatch[1];
        const configWithSubdomain = { ...wranglerConfig, _subdomain: subdomain };
        writeFileSync(wranglerPath, JSON.stringify(configWithSubdomain, null, 2));
      }

      console.log(`[deploy] Deployed successfully to ${deployedUrl}`);

      // Step 4: Push local DB if requested
      if (includeDb && seedSecret) {
        console.log("[deploy] Pushing local database to production...");

        const dbPath = findLocalDbPath(workbookDir);
        if (dbPath) {
          try {
            const statements = exportDbToSql(dbPath);
            console.log(`[deploy] Exporting ${statements.length} SQL statements...`);

            const seedResponse = await fetch(`${deployedUrl}/db/seed`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ secret: seedSecret, statements }),
            });

            if (seedResponse.ok) {
              const result = await seedResponse.json() as { success: boolean; executed: number };
              console.log(`[deploy] Database seeded: ${result.executed} statements executed`);
            } else {
              console.error("[deploy] Database seed failed:", await seedResponse.text());
            }
          } catch (err) {
            console.error("[deploy] Database seed error:", err);
          }
        } else {
          console.log("[deploy] No local database found to push");
        }
      }

      return {
        success: true,
        error: null,
        url: deployedUrl,
        workerName,
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
        lastDeployedAt: null,
      };
    }

    try {
      const config = JSON.parse(readFileSync(wranglerPath, "utf-8")) as {
        name: string;
        vars?: { HANDS_SEED_SECRET?: string };
      };
      const workerName = config.name;
      const seedSecret = config.vars?.HANDS_SEED_SECRET;

      // Check for cached subdomain in config
      const cachedSubdomain = (config as { _subdomain?: string })._subdomain;
      const url = buildWorkerUrl(workerName, cachedSubdomain || null);

      return {
        deployed: true,
        url,
        workerName,
        seedSecret,
        lastDeployedAt: null,
      };
    } catch {
      return {
        deployed: false,
        url: null,
        workerName: null,
        seedSecret: null,
        lastDeployedAt: null,
      };
    }
  }),

  /**
   * Push local database to production
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

    let config: { name: string; vars?: { HANDS_SEED_SECRET?: string } };
    try {
      config = JSON.parse(readFileSync(wranglerPath, "utf-8"));
    } catch {
      return { success: false, error: "Failed to read deployment config." };
    }

    const seedSecret = config.vars?.HANDS_SEED_SECRET;
    if (!seedSecret) {
      return {
        success: false,
        error: "No seed secret configured. Redeploy with 'Include local database' checked.",
      };
    }

    // Get deployed URL
    const subdomain = await getWorkersSubdomain(distDir, cfToken);
    const deployedUrl = buildWorkerUrl(config.name, subdomain);

    // Find and export local DB
    const dbPath = findLocalDbPath(workbookDir);
    if (!dbPath) {
      return { success: false, error: "No local database found." };
    }

    try {
      const statements = exportDbToSql(dbPath);
      console.log(`[pushDb] Exporting ${statements.length} SQL statements...`);

      const response = await fetch(`${deployedUrl}/db/seed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: seedSecret, statements }),
      });

      if (!response.ok) {
        const text = await response.text();
        return { success: false, error: `Push failed: ${text}` };
      }

      const result = (await response.json()) as { success: boolean; executed: number; failures: unknown[] };
      return {
        success: result.success,
        executed: result.executed,
        failures: result.failures?.length ?? 0,
        error: result.success ? null : "Some statements failed",
      };
    } catch (err) {
      return {
        success: false,
        error: `Push failed: ${err instanceof Error ? err.message : String(err)}`,
      };
    }
  }),

  /**
   * Pull production database to local
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

    let config: { name: string; vars?: { HANDS_SEED_SECRET?: string } };
    try {
      config = JSON.parse(readFileSync(wranglerPath, "utf-8"));
    } catch {
      return { success: false, error: "Failed to read deployment config." };
    }

    const seedSecret = config.vars?.HANDS_SEED_SECRET;
    if (!seedSecret) {
      return {
        success: false,
        error: "No seed secret configured. Redeploy with 'Include local database' checked.",
      };
    }

    // Get deployed URL
    const subdomain = await getWorkersSubdomain(distDir, cfToken);
    const deployedUrl = buildWorkerUrl(config.name, subdomain);

    // Get runtime URL to execute SQL locally
    const runtimeUrl = getRuntimeUrl();
    if (!runtimeUrl) {
      return { success: false, error: "Runtime not running. Start the runtime first." };
    }

    try {
      // Fetch DB dump from production
      const dumpResponse = await fetch(`${deployedUrl}/db/dump`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret: seedSecret }),
      });

      if (!dumpResponse.ok) {
        const text = await dumpResponse.text();
        return { success: false, error: `Pull failed: ${text}` };
      }

      const { statements } = (await dumpResponse.json()) as { statements: string[] };
      console.log(`[pullDb] Received ${statements.length} SQL statements from production`);

      // Execute each statement locally
      let executed = 0;
      for (const stmt of statements) {
        const execResponse = await fetch(`${runtimeUrl}/db/query`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sql: stmt }),
        });

        if (execResponse.ok) {
          executed++;
        } else {
          console.warn(`[pullDb] Failed to execute: ${stmt.slice(0, 100)}...`);
        }
      }

      return {
        success: true,
        executed,
        total: statements.length,
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
