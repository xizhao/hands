/**
 * Architecture linter for Hands blocks
 *
 * Checks blocks for common issues and provides guidance.
 * All issues are WARNINGS - we guide, not block.
 */

import { existsSync, readFileSync } from "node:fs";
import { basename } from "node:path";

export interface LintResult {
  file: string;
  warnings: LintIssue[];
}

export interface LintIssue {
  line: number;
  column: number;
  message: string;
  rule: string;
  snippet?: string;
}

interface Rule {
  id: string;
  pattern: RegExp;
  message: string;
}

const RULES: Rule[] = [
  // Write operations in blocks - this is the main architectural rule
  {
    id: "block-writes-data",
    pattern:
      /\b(INSERT\s+INTO|UPDATE\s+\w+\s+SET|DELETE\s+FROM|CREATE\s+TABLE|DROP\s+TABLE|ALTER\s+TABLE)\b/gi,
    message: "Blocks should be read-only. Consider using an Action for write operations.",
  },

  // Deprecated imports
  {
    id: "deprecated-runtime-context",
    pattern: /from\s+["']@hands\/runtime\/context["']/,
    message: "Use `import { sql } from '@hands/db'` instead of @hands/runtime/context.",
  },
  {
    id: "deprecated-ctx-sql",
    pattern: /\bctx\.sql\b/,
    message: "ctx.sql is deprecated. Use `import { sql } from '@hands/db'`.",
  },

  // Hints about @ui components (not errors, just suggestions)
  {
    id: "consider-ui-components",
    pattern: /import\s+.*from\s+["']\.\/.*\.client["']/,
    message: "Consider using @ui components (shadcn) instead of custom client components.",
  },
];

/**
 * Lint a single block file
 */
export function lintBlock(filePath: string): LintResult {
  const warnings: LintIssue[] = [];

  if (!existsSync(filePath)) {
    return {
      file: filePath,
      warnings: [{ line: 0, column: 0, message: "File not found", rule: "file-exists" }],
    };
  }

  const content = readFileSync(filePath, "utf-8");
  const lines = content.split("\n");

  for (const rule of RULES) {
    // Check each line for pattern matches
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const match = line.match(rule.pattern);

      if (match) {
        warnings.push({
          line: i + 1,
          column: match.index ? match.index + 1 : 1,
          message: rule.message,
          rule: rule.id,
          snippet: line.trim().slice(0, 60) + (line.trim().length > 60 ? "..." : ""),
        });
      }
    }
  }

  return {
    file: basename(filePath),
    warnings,
  };
}

/**
 * Format lint results for display
 */
export function formatLintResult(result: LintResult): string {
  if (result.warnings.length === 0) {
    return `✓ ${result.file}`;
  }

  const lines: string[] = [`\n${result.file}:`];

  for (const warning of result.warnings) {
    lines.push(`  ⚠ ${warning.line}:${warning.column} ${warning.message} (${warning.rule})`);
    if (warning.snippet) {
      lines.push(`    > ${warning.snippet}`);
    }
  }

  return lines.join("\n");
}

/**
 * CLI entry point
 */
if (import.meta.main) {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log("Usage: bun run lint-block.ts <file.tsx> [file2.tsx ...]");
    process.exit(0);
  }

  for (const file of args) {
    const result = lintBlock(file);
    console.log(formatLintResult(result));
  }
}
