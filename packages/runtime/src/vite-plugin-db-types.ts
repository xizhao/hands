/**
 * Vite plugin to generate Kysely types from the Durable Object SQLite database
 *
 * On dev server start, this plugin:
 * 1. Looks for the DO sqlite file in .wrangler/state/v3/do/
 * 2. Runs kysely-codegen against it to generate types
 * 3. Outputs to the workbook's .hands/db.d.ts
 *
 * Schema changes are detected by hashing the sqlite_master table,
 * so we only regenerate types when DDL changes occur (not on insert/update/delete).
 */

import { execSync } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import BetterSqlite3 from "better-sqlite3";
import type { Plugin } from "vite";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface DbTypesPluginOptions {
  workbookPath: string;
}

// Track the last known schema hash to avoid unnecessary regeneration
let lastSchemaHash: string | null = null;

export function dbTypesPlugin(options: DbTypesPluginOptions): Plugin {
  const { workbookPath } = options;
  let pollInterval: ReturnType<typeof setInterval> | null = null;

  return {
    name: "hands-db-types",
    apply: "serve", // Only run in dev mode

    async buildStart() {
      await generateDbTypesIfChanged(workbookPath);
    },

    configureServer(server) {
      // Warm up the Durable Object on server start to initialize the SQLite database
      server.httpServer?.once("listening", async () => {
        const address = server.httpServer?.address();
        const port = typeof address === "object" ? address?.port ?? 5173 : 5173;

        try {
          // Hit the schema endpoint to trigger DO initialization
          await fetch(`http://localhost:${port}/db/schema`);
          // Generate types immediately after warmup
          await generateDbTypesIfChanged(workbookPath);
        } catch {
          // Server might not be fully ready, types will generate on next poll
        }
      });

      // Poll every 2 seconds for schema changes
      pollInterval = setInterval(async () => {
        await generateDbTypesIfChanged(workbookPath);
      }, 2000);

      // Clean up on server close
      server.httpServer?.on("close", () => {
        if (pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      });
    },
  };
}

/**
 * Get a hash of the database schema by querying sqlite_master
 */
function getSchemaHash(sqliteFile: string): string | null {
  try {
    const db = new BetterSqlite3(sqliteFile, { readonly: true });
    const schema = db
      .prepare(
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name"
      )
      .all();
    db.close();

    const hash = createHash("sha256").update(JSON.stringify(schema)).digest("hex");
    return hash;
  } catch {
    return null;
  }
}

async function generateDbTypesIfChanged(workbookPath: string): Promise<void> {
  // Check .hands/db (current) or legacy .wrangler path
  const dbPath = path.join(workbookPath, ".hands/db");
  const legacyPath = path.join(workbookPath, ".wrangler/state/v3/do");
  const doStatePath = fs.existsSync(dbPath) ? dbPath : legacyPath;
  const outputPath = path.join(workbookPath, ".hands/db.d.ts");

  // Find sqlite files in the DO state directory
  const sqliteFile = findSqliteFile(doStatePath);

  if (!sqliteFile) {
    // Only write placeholder if the file doesn't exist
    if (!fs.existsSync(outputPath)) {
      console.log(
        "[db-types] No SQLite database found yet. Types will be generated after first request."
      );
      const placeholder = `// Database types will be generated after the first request initializes the database
export interface DB {}
`;
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, placeholder);
    }
    return;
  }

  // Check if schema has changed
  const currentHash = getSchemaHash(sqliteFile);
  if (!currentHash) {
    return;
  }

  if (currentHash === lastSchemaHash) {
    // Schema hasn't changed, skip regeneration
    return;
  }

  console.log(`[db-types] Schema change detected, generating types...`);
  lastSchemaHash = currentHash;

  try {
    // Run kysely-codegen from runtime directory (has better-sqlite3 installed)
    const runtimeDir = path.resolve(__dirname, "..");
    execSync(
      `npx kysely-codegen --dialect sqlite --url "${sqliteFile}" --out-file "${outputPath}"`,
      {
        stdio: "pipe",
        cwd: runtimeDir,
      }
    );
    console.log(`[db-types] Types written to ${outputPath}`);
  } catch (error) {
    console.error("[db-types] Failed to generate types:", error);
  }
}

/**
 * Get the script name from wrangler.jsonc - this determines the DO folder name.
 * Must match what the cloudflare vite plugin uses.
 */
function getScriptName(): string {
  const wranglerPath = path.resolve(__dirname, "../wrangler.jsonc");
  try {
    const content = fs.readFileSync(wranglerPath, "utf-8");
    // Strip comments and parse as JSON
    const json = content.replace(/\/\*[\s\S]*?\*\/|\/\/.*/g, "");
    const config = JSON.parse(json);
    return config.name || "runtime";
  } catch {
    return "runtime";
  }
}

/**
 * Find the sqlite file in the DO state directory.
 * Uses the script name from wrangler.jsonc to find the correct folder.
 * This ensures we read the same DB that the runtime writes to.
 */
function findSqliteFile(doStatePath: string): string | null {
  if (!fs.existsSync(doStatePath)) {
    return null;
  }

  // Look in the specific folder for our Database DO class
  // Structure: {persistState}/v3/do/{scriptName}-Database/{idHash}.sqlite
  const scriptName = getScriptName();
  const dbFolder = path.join(doStatePath, "v3", "do", `${scriptName}-Database`);

  if (!fs.existsSync(dbFolder)) {
    // Fallback: scan all folders (for migration from old structure)
    const files = walkDir(doStatePath);
    const sqliteFiles = files.filter((f) => f.endsWith(".sqlite") && f.includes("-Database/"));
    if (sqliteFiles.length === 0) return null;
    // Return most recently modified (active one)
    sqliteFiles.sort((a, b) => fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs);
    return sqliteFiles[0];
  }

  // Find sqlite files in the correct folder
  const files = fs.readdirSync(dbFolder);
  const sqliteFiles = files.filter((f) => f.endsWith(".sqlite"));

  if (sqliteFiles.length === 0) {
    return null;
  }

  // If multiple (shouldn't happen with stable DO ID), use most recent
  if (sqliteFiles.length > 1) {
    sqliteFiles.sort((a, b) => {
      const aPath = path.join(dbFolder, a);
      const bPath = path.join(dbFolder, b);
      return fs.statSync(bPath).mtimeMs - fs.statSync(aPath).mtimeMs;
    });
  }

  return path.join(dbFolder, sqliteFiles[0]);
}

function walkDir(dir: string): string[] {
  const results: string[] = [];

  if (!fs.existsSync(dir)) {
    return results;
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else {
      results.push(fullPath);
    }
  }

  return results;
}
