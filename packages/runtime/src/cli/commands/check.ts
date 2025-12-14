/**
 * hands check - Run code quality checks on the workbook
 *
 * Checks include:
 * - Preflight/environment validation
 * - TypeScript type checking
 * - Biome linting and formatting
 */

import { existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { printPreflightResults, runPreflight } from "../../preflight.js";

interface CheckOptions {
  fix?: boolean;
  json?: boolean;
  strict?: boolean;
}

interface CheckResult {
  name: string;
  ok: boolean;
  message: string;
  output?: string;
  fixed?: boolean;
}

export async function checkCommand(options: CheckOptions) {
  const workbookDir = process.cwd();
  const autoFix = options.fix ?? true;
  const jsonOutput = options.json ?? false;
  const strict = options.strict ?? false;

  const results: CheckResult[] = [];
  let hasErrors = false;

  // 1. Run preflight checks (environment validation)
  if (!jsonOutput) {
    console.log("Running preflight checks...");
  }

  const preflightResult = await runPreflight({
    workbookDir,
    autoFix,
    verbose: false,
  });

  results.push({
    name: "Preflight",
    ok: preflightResult.ok,
    message: preflightResult.ok
      ? `All ${preflightResult.checks.length} checks passed`
      : `${preflightResult.checks.filter(c => !c.ok).length} checks failed`,
  });

  if (!preflightResult.ok) {
    hasErrors = true;
    if (!jsonOutput) {
      printPreflightResults(preflightResult);
    }
  }

  // 2. TypeScript type checking
  if (!jsonOutput) {
    console.log("Running TypeScript checks...");
  }

  const tsconfigPath = join(workbookDir, "tsconfig.json");
  if (existsSync(tsconfigPath)) {
    const tscResult = spawnSync("bun", ["x", "tsc", "--noEmit"], {
      cwd: workbookDir,
      encoding: "utf-8",
    });

    const tscOutput = [tscResult.stdout, tscResult.stderr].filter(Boolean).join("\n").trim();
    const tscOk = tscResult.status === 0;

    results.push({
      name: "TypeScript",
      ok: tscOk,
      message: tscOk ? "No type errors" : "Type errors found",
      output: tscOk ? undefined : tscOutput,
    });

    if (!tscOk) {
      hasErrors = true;
    }
  } else {
    results.push({
      name: "TypeScript",
      ok: true,
      message: "Skipped (no tsconfig.json)",
    });
  }

  // 3. Biome linting and formatting
  if (!jsonOutput) {
    console.log("Running Biome checks...");
  }

  const biomeArgs = autoFix ? ["check", "--write", "."] : ["check", "."];
  const biomeResult = spawnSync("bun", ["x", "biome", ...biomeArgs], {
    cwd: workbookDir,
    encoding: "utf-8",
  });

  const biomeOutput = [biomeResult.stdout, biomeResult.stderr].filter(Boolean).join("\n").trim();
  const biomeOk = biomeResult.status === 0;

  results.push({
    name: "Biome",
    ok: biomeOk,
    message: biomeOk
      ? (autoFix ? "All issues fixed" : "No issues")
      : "Issues found",
    output: biomeOk ? undefined : biomeOutput,
    fixed: autoFix && biomeOk,
  });

  if (!biomeOk && strict) {
    hasErrors = true;
  }

  // Output results
  if (jsonOutput) {
    console.log(
      JSON.stringify(
        {
          success: !hasErrors,
          workbookDir,
          checks: results,
        },
        null,
        2,
      ),
    );
  } else {
    console.log("\n=== Code Quality Checks ===\n");

    for (const result of results) {
      const status = result.ok
        ? "\x1b[32m✓\x1b[0m"
        : "\x1b[31m✗\x1b[0m";
      const fixedLabel = result.fixed ? " \x1b[36m(auto-fixed)\x1b[0m" : "";

      console.log(`${status} ${result.name}: ${result.message}${fixedLabel}`);

      if (result.output) {
        console.log();
        console.log(result.output);
        console.log();
      }
    }

    if (hasErrors) {
      console.log("\n\x1b[31mChecks failed.\x1b[0m\n");
    } else {
      console.log("\n\x1b[32mAll checks passed.\x1b[0m\n");
    }
  }

  process.exit(hasErrors ? 1 : 0);
}
