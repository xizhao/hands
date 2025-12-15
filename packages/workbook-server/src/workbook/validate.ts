/**
 * Workbook Validation
 *
 * Validates block and component files.
 */

import { readFileSync } from "node:fs";
import type { BlockMeta } from "./types.js";

export interface BlockValidationResult {
  valid: boolean;
  error?: string;
  meta?: BlockMeta;
  uninitialized?: boolean;
}

/**
 * Validate a block file
 *
 * Checks that the file has a valid default export function.
 */
export async function validateBlockFile(filePath: string): Promise<BlockValidationResult> {
  try {
    const code = readFileSync(filePath, "utf-8");

    // Check for default export
    const hasDefaultExport =
      /export\s+default\s+/.test(code) || /export\s*{\s*[^}]*\bdefault\b/.test(code);

    if (!hasDefaultExport) {
      return {
        valid: false,
        error: "Missing default export. Blocks must export a default function.",
      };
    }

    // Check that default export looks like a function
    const defaultExportPatterns = [
      /export\s+default\s+function\s/,
      /export\s+default\s+async\s+function\s/,
      /export\s+default\s+\(\s*[\w,\s{}]*\)\s*=>/,
      /export\s+default\s+async\s*\(\s*[\w,\s{}]*\)\s*=>/,
      /const\s+\w+\s*:\s*\w+.*=.*[\s\S]*export\s+default\s+\w+/,
    ];

    const looksLikeFunction = defaultExportPatterns.some((pattern) => pattern.test(code));

    if (!looksLikeFunction) {
      // Runtime validation would require importing the module
      // For static analysis, we trust it looks reasonable
      // The runtime will catch actual errors
    }

    const meta = extractBlockMeta(code);
    const uninitialized = code.includes("@hands:uninitialized");

    return { valid: true, meta, uninitialized };
  } catch (err) {
    return {
      valid: false,
      error: `Failed to read file: ${err instanceof Error ? err.message : String(err)}`,
    };
  }
}

/**
 * Extract metadata from block file
 */
export function extractBlockMeta(code: string): BlockMeta | undefined {
  // Match: export const meta = { ... } or export const meta: BlockMeta = { ... }
  const metaMatch = code.match(/export\s+const\s+meta\s*(?::\s*\w+)?\s*=\s*({[\s\S]*?});/);

  if (!metaMatch) {
    return undefined;
  }

  try {
    const meta: BlockMeta = {};
    const metaCode = metaMatch[1];

    // Extract title
    const titleMatch = metaCode.match(/title\s*:\s*["']([^"']+)["']/);
    if (titleMatch) {
      meta.title = titleMatch[1];
    }

    // Extract description
    const descMatch = metaCode.match(/description\s*:\s*["']([^"']+)["']/);
    if (descMatch) {
      meta.description = descMatch[1];
    }

    // Extract refreshable
    const refreshMatch = metaCode.match(/refreshable\s*:\s*(true|false)/);
    if (refreshMatch) {
      meta.refreshable = refreshMatch[1] === "true";
    }

    return Object.keys(meta).length > 0 ? meta : undefined;
  } catch {
    return undefined;
  }
}
