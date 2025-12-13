/**
 * PGTyped Integration for Hands Runtime
 *
 * Provides type-safe SQL queries by:
 * 1. Parsing sql`` tagged templates from TypeScript files
 * 2. Generating .types.ts files with TypeScript interfaces
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
  /** Run type generation for a specific file */
  runFile: (filePath: string) => Promise<void>;
  /** Refresh schema cache (call after DDL changes) */
  refreshSchema: () => Promise<void>;
}

/**
 * Create a pgtyped runner for a workbook
 */
export function createPgTypedRunner(workbookDir: string, db: PGlite): PgTypedRunner {
  const blocksDir = join(workbookDir, "blocks");
  let schemaCache: SchemaMap | null = null;

  async function getSchema(): Promise<SchemaMap> {
    if (!schemaCache) {
      schemaCache = await buildSchemaMap(db);
    }
    return schemaCache;
  }

  async function runFile(filePath: string): Promise<void> {
    if (!existsSync(filePath)) {
      console.log(`[pgtyped] File not found: ${filePath}`);
      return;
    }

    const content = readFileSync(filePath, "utf-8");
    const parsed = extractQueriesFromSource(content, filePath);

    if (parsed.errors.length > 0) {
      for (const err of parsed.errors) {
        console.warn(`[pgtyped] ${err}`);
      }
    }

    if (parsed.queries.length === 0) {
      console.log(`[pgtyped] No SQL queries found in ${relative(workbookDir, filePath)}`);
      return;
    }

    // Ensure schema cache is loaded (used by generateTypesForFiles internally)
    await getSchema();
    const typesMap = await generateTypesForFiles([parsed], db);

    for (const [typesPath, content] of typesMap) {
      writeFileSync(typesPath, content);
      console.log(
        `[pgtyped] Generated ${relative(workbookDir, typesPath)} (${parsed.queries.length} queries)`,
      );
    }
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

    if (parsedFiles.length === 0) {
      console.log("[pgtyped] No SQL queries found in any block files");
      return;
    }

    const typesMap = await generateTypesForFiles(parsedFiles, db);

    for (const [typesPath, content] of typesMap) {
      writeFileSync(typesPath, content);
      console.log(`[pgtyped] Generated ${relative(workbookDir, typesPath)}`);
    }

    console.log(`[pgtyped] Generated types for ${parsedFiles.length} files`);
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
