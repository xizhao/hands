/**
 * Vite plugin to generate Kysely types from the D1 SQLite database
 *
 * On dev server start, this plugin:
 * 1. Looks for the D1 sqlite file in .hands/db/v3/d1/
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
        const port = typeof address === "object" ? (address?.port ?? 5173) : 5173;

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
        "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE sql IS NOT NULL ORDER BY name",
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
  const persistPath = path.join(workbookPath, ".hands/db");
  const outputPath = path.join(workbookPath, ".hands/db.d.ts");

  // Find sqlite files in the D1 state directory
  const sqliteFile = findD1SqliteFile(persistPath);

  if (!sqliteFile) {
    // Only write placeholder if the file doesn't exist
    if (!fs.existsSync(outputPath)) {
      console.log(
        "[db-types] No SQLite database found yet. Types will be generated after first request.",
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
      },
    );
    console.log(`[db-types] Types written to ${outputPath}`);
  } catch (error) {
    console.error("[db-types] Failed to generate types:", error);
  }
}

/**
 * Find the D1 sqlite file in the persist state directory.
 * D1 databases are stored at: {persistPath}/v3/d1/{database_name}/{hash}.sqlite
 */
function findD1SqliteFile(persistPath: string): string | null {
  const d1Path = path.join(persistPath, "v3", "d1");

  if (!fs.existsSync(d1Path)) {
    return null;
  }

  // Look for database folders (miniflare uses "miniflare-D1DatabaseObject")
  let dbFolders: string[];
  try {
    dbFolders = fs.readdirSync(d1Path, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
  } catch {
    return null;
  }

  if (dbFolders.length === 0) {
    return null;
  }

  // Use the first database folder (typically "hands-workbook")
  const dbFolder = path.join(d1Path, dbFolders[0]);

  // Find .sqlite files in the folder
  let sqliteFiles: string[];
  try {
    sqliteFiles = fs.readdirSync(dbFolder)
      .filter((f) => f.endsWith(".sqlite"));
  } catch {
    return null;
  }

  if (sqliteFiles.length === 0) {
    return null;
  }

  // If multiple files, use the most recently modified
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
