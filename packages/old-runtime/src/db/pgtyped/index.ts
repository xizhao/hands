/**
 * PGTyped Integration for Hands Runtime
 *
 * Provides type-safe SQL queries by:
 * 1. Parsing sql`` tagged templates from TypeScript files
 * 2. Generating a single .hands/types.ts file with all TypeScript interfaces
 * 3. Running on file changes during dev mode
 */

import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { PGlite } from "@electric-sql/pglite";
import { extractQueriesFromSource, type ParsedFile } from "./parser.js";
import { buildSchemaMap, generateTypesForFiles, type SchemaMap } from "./type-generator.js";

export interface PgTypedRunner {
  /** Run type generation for all block files */
  runAll: () => Promise<void>;
  /** Run type generation for a specific file (regenerates all types) */
  runFile: (filePath: string) => Promise<void>;
  /** Refresh schema cache (call after DDL changes) */
  refreshSchema: () => Promise<void>;
}

/**
 * Create a pgtyped runner for a workbook
 * Outputs all types to a single file: .hands/types.ts
 */
export function createPgTypedRunner(workbookDir: string, db: PGlite): PgTypedRunner {
  const blocksDir = join(workbookDir, "blocks");
  const outputPath = join(workbookDir, ".hands", "types.ts");
  let schemaCache: SchemaMap | null = null;

  async function getSchema(): Promise<SchemaMap> {
    if (!schemaCache) {
      schemaCache = await buildSchemaMap(db);
    }
    return schemaCache;
  }

  async function runFile(_filePath: string): Promise<void> {
    // When a single file changes, regenerate all types
    // This keeps the single types.ts file up to date
    await runAll();
  }

  async function runAll(): Promise<void> {
    if (!existsSync(blocksDir)) {
      console.log("[pgtyped] No blocks directory found");
      return;
    }

    const files = findTsFiles(blocksDir);
    console.log(`[pgtyped] Processing ${files.length} files...`);

    const parsedFiles: ParsedFile[] = [];

    for (const filePath of files) {
      const content = readFileSync(filePath, "utf-8");
      const parsed = extractQueriesFromSource(content, filePath);

      if (parsed.errors.length > 0) {
        for (const err of parsed.errors) {
          console.warn(`[pgtyped] ${err}`);
        }
      }

      if (parsed.queries.length > 0) {
        parsedFiles.push(parsed);
      }
    }

    // Generate consolidated types file
    const typesContent = await generateTypesForFiles(parsedFiles, db, outputPath);
    writeFileSync(outputPath, typesContent);

    const totalQueries = parsedFiles.reduce((sum, f) => sum + f.queries.length, 0);
    console.log(`[pgtyped] Generated .hands/types.ts (${totalQueries} queries from ${parsedFiles.length} files)`);
  }

  async function refreshSchema(): Promise<void> {
    schemaCache = null;
    await getSchema();
    console.log("[pgtyped] Schema cache refreshed");
  }

  return {
    runAll,
    runFile,
    refreshSchema,
  };
}

/**
 * Find all TypeScript/TSX files in a directory
 */
function findTsFiles(dir: string): string[] {
  const results: string[] = [];

  if (!existsSync(dir)) return results;

  const entries = readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = join(dir, entry.name);

    if (entry.isDirectory()) {
      results.push(...findTsFiles(fullPath));
    } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
      // Skip .types.ts files
      if (!entry.name.endsWith(".types.ts")) {
        results.push(fullPath);
      }
    }
  }

  return results;
}

// Re-export for external use
export { type ExtractedQuery, extractQueriesFromSource, type ParsedFile } from "./parser.js";
export { generateTypesFile, generateTypesForFiles } from "./type-generator.js";
