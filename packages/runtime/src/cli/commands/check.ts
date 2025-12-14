/**
 * hands check - Run preflight checks on the workbook
 *
 * Validates the workbook environment and configuration.
 */

import { join } from "node:path";
import { printPreflightResults, runPreflight } from "../../preflight.js";

interface CheckOptions {
  fix?: boolean;
  json?: boolean;
}

export async function checkCommand(options: CheckOptions) {
  const workbookDir = process.cwd();
  const autoFix = options.fix ?? true;
  const jsonOutput = options.json ?? false;

  // Run preflight checks
  const result = await runPreflight({
    workbookDir,
    autoFix,
    verbose: !jsonOutput,
  });

  if (jsonOutput) {
    // JSON output for scripting
    console.log(
      JSON.stringify(
        {
          success: result.ok,
          workbookDir,
          duration: result.duration,
          checks: result.checks.map((c) => ({
            name: c.name,
            ok: c.ok,
            message: c.message,
            required: c.required,
            fixed: c.fixed ?? false,
          })),
        },
        null,
        2,
      ),
    );
  } else {
    // Human-readable output
    printPreflightResults(result);
  }

  process.exit(result.ok ? 0 : 1);
}
