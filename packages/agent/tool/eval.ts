/**
 * Runtime eval tool for OpenCode
 *
 * Calls the runtime's /eval endpoint to run code quality checks
 * and returns structured results for the agent to act on.
 */

import { tool } from "@opencode-ai/plugin";

// Port configuration - matches runtime/src/ports.ts
const PORT_PREFIX = parseInt(process.env.HANDS_PORT_PREFIX || "55", 10);
const RUNTIME_PORT = PORT_PREFIX * 1000; // 55000

// Get runtime URL from environment or use default
const RUNTIME_URL = process.env.HANDS_RUNTIME_URL || `http://localhost:${RUNTIME_PORT}`;

interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
  severity: "error" | "warning";
}

interface EvalResult {
  timestamp: number;
  duration: number;
  wrangler: {
    name: string;
    routes: { method: string; path: string }[];
    crons: { schedule: string; handler?: string }[];
    vars: Record<string, string>;
  } | null;
  typescript: {
    errors: Diagnostic[];
    warnings: Diagnostic[];
  };
  format: {
    fixed: string[];
    errors: string[];
  };
  unused: {
    exports: string[];
    files: string[];
  };
  services: {
    postgres: { up: boolean; port: number; error?: string };
    wrangler: { up: boolean; port: number; error?: string };
  };
}

function formatDiagnostics(diagnostics: Diagnostic[]): string {
  if (diagnostics.length === 0) return "  (none)";

  return diagnostics
    .map((d) => `  ${d.file}:${d.line}:${d.column} - ${d.message}`)
    .join("\n");
}

function formatEvalResult(result: EvalResult): string {
  const lines: string[] = [];

  // Services status
  lines.push("## Services");
  lines.push(`- Postgres: ${result.services.postgres.up ? "✓ running" : "✗ stopped"} (port ${result.services.postgres.port})`);
  lines.push(`- Wrangler: ${result.services.wrangler.up ? "✓ running" : "✗ stopped"} (port ${result.services.wrangler.port})`);

  // TypeScript errors
  if (result.typescript.errors.length > 0) {
    lines.push("");
    lines.push(`## TypeScript Errors (${result.typescript.errors.length})`);
    lines.push(formatDiagnostics(result.typescript.errors));
  }

  // TypeScript warnings
  if (result.typescript.warnings.length > 0) {
    lines.push("");
    lines.push(`## TypeScript Warnings (${result.typescript.warnings.length})`);
    lines.push(formatDiagnostics(result.typescript.warnings));
  }

  // Format changes
  if (result.format.fixed.length > 0) {
    lines.push("");
    lines.push(`## Files Formatted (${result.format.fixed.length})`);
    for (const file of result.format.fixed) {
      lines.push(`  - ${file}`);
    }
  }

  // Unused exports
  if (result.unused.exports.length > 0 || result.unused.files.length > 0) {
    lines.push("");
    lines.push("## Unused Code");
    if (result.unused.files.length > 0) {
      lines.push("Unused files:");
      for (const file of result.unused.files) {
        lines.push(`  - ${file}`);
      }
    }
    if (result.unused.exports.length > 0) {
      lines.push("Unused exports:");
      for (const exp of result.unused.exports) {
        lines.push(`  - ${exp}`);
      }
    }
  }

  // Wrangler config summary
  if (result.wrangler) {
    lines.push("");
    lines.push("## Wrangler Config");
    lines.push(`- Name: ${result.wrangler.name}`);
    lines.push(`- Routes: ${result.wrangler.routes.length}`);
    if (result.wrangler.crons.length > 0) {
      lines.push(`- Crons: ${result.wrangler.crons.map((c) => c.schedule).join(", ")}`);
    }
  }

  // Summary
  lines.push("");
  lines.push(`---`);
  lines.push(`Eval completed in ${result.duration}ms`);

  const hasErrors =
    result.typescript.errors.length > 0 ||
    result.format.errors.length > 0 ||
    !result.services.postgres.up;

  if (hasErrors) {
    lines.push("⚠️ Issues found - please fix before publishing");
  } else {
    lines.push("✓ All checks passed");
  }

  return lines.join("\n");
}

export const evalTool = tool({
  description: `Run code quality checks on the workbook.

This tool:
- Checks TypeScript for type errors
- Auto-formats code with Biome
- Detects unused exports with knip
- Validates wrangler.toml configuration
- Checks if services (postgres, wrangler) are running

Use this tool:
- After completing a task to verify code quality
- Before publishing to catch issues
- When the user asks to check for errors`,

  args: {
    autoFormat: tool.schema
      .boolean()
      .optional()
      .describe("Auto-fix formatting issues. Defaults to true."),
  },

  async execute(args) {
    const { autoFormat = true } = args;

    try {
      const response = await fetch(`${RUNTIME_URL}/eval`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ autoFormat }),
      });

      if (!response.ok) {
        const error = await response.text();
        return `❌ Eval failed: ${error}

The runtime server may not be running. Start it with:
  cd ~/.hands/<workbook-id>
  bun run @hands/runtime --workbook-id=<id> --workbook-dir=.`;
      }

      const result = (await response.json()) as EvalResult;
      return formatEvalResult(result);
    } catch (error) {
      return `❌ Could not connect to runtime server at ${RUNTIME_URL}

Error: ${error instanceof Error ? error.message : String(error)}

The runtime server may not be running.`;
    }
  },
});

export default evalTool;
