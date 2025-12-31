/**
 * MDX Page Validation (CLI Layer)
 *
 * CLI-specific validation that wraps @hands/core/validation
 * with file system operations and console formatting.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
// Import portable validation from core
import {
  extractMdxComponents,
  type MdxComponent,
  type ValidationContext,
  type ValidationError,
  type ValidationSchemaTable,
  validateComponent,
  validateMdxContent,
} from "@hands/core/validation";
import pc from "picocolors";

// Re-export types for convenience
export type {
  MdxComponent,
  ValidationSchemaTable as SchemaTable,
  ValidationContext,
  ValidationError,
};

// Re-export core validation functions
export { extractMdxComponents, validateComponent, validateMdxContent };

// ============================================================================
// File System Operations (CLI-specific)
// ============================================================================

/**
 * Discover available pages and blocks that can be referenced with <Page src="..." />.
 * Looks for MDX files in pages/ and pages/blocks/.
 */
export function discoverPageRefs(workbookPath: string): string[] {
  const pagesDir = path.join(workbookPath, "pages");
  if (!existsSync(pagesDir)) return [];

  const refs: string[] = [];

  function scanDir(dir: string, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath, `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith(".mdx") || entry.name.endsWith(".md")) {
        const pageName = entry.name.replace(/\.(mdx?|md)$/, "");
        // Skip index files for cleaner refs
        if (pageName === "index") {
          refs.push(prefix.replace(/\/$/, "") || "/");
        } else {
          refs.push(`${prefix}${pageName}`);
        }
      }
    }
  }

  scanDir(pagesDir);
  return refs;
}

/**
 * Validate a single MDX file.
 */
export function validateMdxFile(
  filePath: string,
  ctx: ValidationContext & { workbookPath: string },
): ValidationError[] {
  const content = readFileSync(filePath, "utf-8");
  const relativePath = path.relative(ctx.workbookPath, filePath);
  return validateMdxContent(content, ctx, relativePath);
}

/**
 * Validate all MDX pages in a workbook.
 */
export function validateMdxPages(
  workbookPath: string,
  schema: ValidationSchemaTable[],
): ValidationError[] {
  const pagesDir = path.join(workbookPath, "pages");
  if (!existsSync(pagesDir)) return [];

  const pageRefs = discoverPageRefs(workbookPath);
  const ctx: ValidationContext & { workbookPath: string } = { pageRefs, schema, workbookPath };

  const errors: ValidationError[] = [];

  function scanDir(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith(".mdx")) {
        errors.push(...validateMdxFile(fullPath, ctx));
      }
    }
  }

  scanDir(pagesDir);
  return errors;
}

/**
 * Load schema from .hands/schema.json or runtime.
 */
export function loadSchema(workbookPath: string): ValidationSchemaTable[] {
  // Try .hands/schema.json first
  const schemaPath = path.join(workbookPath, ".hands", "schema.json");
  if (existsSync(schemaPath)) {
    try {
      const content = readFileSync(schemaPath, "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data.tables)) {
        return data.tables.map((t: { name: string; columns?: Array<{ name: string }> }) => ({
          name: t.name,
          columns: t.columns?.map((c) => c.name) ?? [],
        }));
      }
    } catch {
      // Ignore parse errors
    }
  }

  return [];
}

/**
 * Format validation errors for console output.
 */
export function formatValidationErrors(errors: ValidationError[]): void {
  for (const err of errors) {
    const location = err.line ? `${err.file}:${err.line}` : err.file;
    const prefix = err.severity === "error" ? pc.red("✗") : pc.yellow("⚠");
    console.log(`  ${prefix} ${pc.dim(location)} [${err.component}] ${err.message}`);
  }
}
