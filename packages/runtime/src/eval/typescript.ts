/**
 * TypeScript type checking wrapper
 */

import { spawn } from "bun";
import { existsSync } from "fs";
import { join } from "path";
import type { Diagnostic } from "../types";

/**
 * Run tsc --noEmit and parse diagnostics
 */
export async function checkTypescript(workbookDir: string): Promise<{
  errors: Diagnostic[];
  warnings: Diagnostic[];
}> {
  const tsconfigPath = join(workbookDir, "tsconfig.json");

  if (!existsSync(tsconfigPath)) {
    return {
      errors: [{
        file: "tsconfig.json",
        line: 0,
        column: 0,
        message: "tsconfig.json not found",
        severity: "error",
      }],
      warnings: [],
    };
  }

  const proc = spawn(["bunx", "tsc", "--noEmit", "--pretty", "false"], {
    cwd: workbookDir,
    stdout: "pipe",
    stderr: "pipe",
  });

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  await proc.exited;

  const output = stdout + stderr;
  const errors: Diagnostic[] = [];
  const warnings: Diagnostic[] = [];

  // Parse tsc output
  // Format: src/index.ts(10,5): error TS2322: Type 'string' is not assignable...
  const diagnosticPattern = /^(.+?)\((\d+),(\d+)\):\s*(error|warning)\s*(TS\d+):\s*(.+)$/gm;

  let match;
  while ((match = diagnosticPattern.exec(output)) !== null) {
    const [, file, line, column, severity, code, message] = match;
    const diagnostic: Diagnostic = {
      file,
      line: parseInt(line, 10),
      column: parseInt(column, 10),
      message,
      code,
      severity: severity as "error" | "warning",
    };

    if (severity === "error") {
      errors.push(diagnostic);
    } else {
      warnings.push(diagnostic);
    }
  }

  return { errors, warnings };
}
