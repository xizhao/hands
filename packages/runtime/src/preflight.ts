/**
 * Preflight checks - verify and prepare environment before starting runtime
 *
 * Performs comprehensive validation:
 * - System dependencies (bun, node)
 * - Workbook structure (hands.json, directories)
 * - Port availability
 * - Dependencies installation
 * - Symlinks and file layout
 *
 * Auto-fixes issues where possible (install deps, create dirs, fix symlinks).
 */

import { existsSync, mkdirSync, readFileSync, rmSync, symlinkSync, statSync } from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import { PORTS, waitForPortFree, killProcessOnPort } from "./ports.js";
import { ensureStdlibSymlink, ensureWorkbookStdlibSymlink, getStdlibSourcePath } from "./config/index.js";

// ============================================================================
// Types
// ============================================================================

export interface PreflightResult {
  ok: boolean;
  checks: PreflightCheck[];
  /** Time taken in ms */
  duration: number;
}

export interface PreflightCheck {
  name: string;
  ok: boolean;
  message: string;
  required: boolean;
  /** Whether this check auto-fixed an issue */
  fixed?: boolean;
}

export interface PreflightOptions {
  /** Workbook directory to validate */
  workbookDir: string;
  /** Port the runtime will use */
  port?: number;
  /** Whether to auto-fix issues (default: true) */
  autoFix?: boolean;
  /** Whether to print results to console (default: true) */
  verbose?: boolean;
}

// ============================================================================
// Main Entry Point
// ============================================================================

/**
 * Run all preflight checks and prepare environment for runtime
 *
 * This is the single entry point that validates everything needed
 * before starting the runtime server.
 *
 * @example
 * ```ts
 * const result = await runPreflight({
 *   workbookDir: "/path/to/workbook",
 *   port: 55000,
 * });
 *
 * if (!result.ok) {
 *   printPreflightResults(result);
 *   process.exit(1);
 * }
 * ```
 */
export async function runPreflight(options: PreflightOptions): Promise<PreflightResult> {
  const startTime = Date.now();
  const { workbookDir, port = PORTS.RUNTIME, autoFix = true, verbose = false } = options;
  const checks: PreflightCheck[] = [];

  if (verbose) {
    console.log("[preflight] Starting environment validation...");
  }

  // 1. System dependencies
  checks.push(await checkBun());
  checks.push(await checkNode());

  // 2. Workbook structure
  checks.push(await checkWorkbookDir(workbookDir));
  checks.push(await checkHandsJson(workbookDir));
  checks.push(await checkBlocksDir(workbookDir, autoFix));
  checks.push(await checkSourcesDir(workbookDir, autoFix));

  // 3. Symlinks and stdlib
  checks.push(await checkStdlibSymlink(autoFix));
  checks.push(await checkWorkbookStdlib(workbookDir, autoFix));

  // 4. Port availability (clean up stale processes)
  checks.push(await checkPortAvailable(port, autoFix));
  // Also check Vite/worker port - critical for RSC to work
  checks.push(await checkPortAvailable(PORTS.WORKER, autoFix));

  // 5. Build output directory
  checks.push(await checkHandsOutputDir(workbookDir, autoFix));

  // 6. Dependencies in .hands directory
  checks.push(await checkHandsDependencies(workbookDir, autoFix));

  const ok = checks.filter((c) => c.required).every((c) => c.ok);
  const duration = Date.now() - startTime;

  if (verbose) {
    console.log(`[preflight] Completed in ${duration}ms - ${ok ? "PASS" : "FAIL"}`);
  }

  return { ok, checks, duration };
}

/**
 * Print preflight results to console with colors
 */
export function printPreflightResults(result: PreflightResult): void {
  console.log("\n=== Preflight Checks ===\n");

  for (const check of result.checks) {
    const status = check.ok
      ? "\x1b[32m✓\x1b[0m"
      : check.required
        ? "\x1b[31m✗\x1b[0m"
        : "\x1b[33m○\x1b[0m";
    const reqLabel = check.required ? "" : " (optional)";
    const fixedLabel = check.fixed ? " \x1b[36m(auto-fixed)\x1b[0m" : "";
    console.log(`${status} ${check.name}${reqLabel}: ${check.message}${fixedLabel}`);
  }

  console.log(`\nCompleted in ${result.duration}ms`);

  if (!result.ok) {
    console.error("\n\x1b[31mPreflight checks failed. Please fix the issues above.\x1b[0m\n");
  } else {
    console.log("\n\x1b[32mAll checks passed.\x1b[0m\n");
  }
}

// ============================================================================
// Legacy exports for backward compatibility
// ============================================================================

/**
 * @deprecated Use runPreflight() instead
 */
export async function runPreflightChecks(): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];
  checks.push(await checkBun());
  checks.push(await checkNode());
  const ok = checks.filter((c) => c.required).every((c) => c.ok);
  return { ok, checks, duration: 0 };
}

// ============================================================================
// Individual Checks
// ============================================================================

async function checkBun(): Promise<PreflightCheck> {
  try {
    const result = await $`bun --version`.quiet();
    const version = result.text().trim();
    return {
      name: "Bun",
      ok: true,
      message: `v${version}`,
      required: true,
    };
  } catch {
    return {
      name: "Bun",
      ok: false,
      message: "Not found. Install from https://bun.sh",
      required: true,
    };
  }
}

async function checkNode(): Promise<PreflightCheck> {
  try {
    const result = await $`node --version`.quiet();
    const version = result.text().trim();
    const major = parseInt(version.replace("v", "").split(".")[0], 10);

    if (major < 18) {
      return {
        name: "Node.js",
        ok: false,
        message: `${version} (requires v18+)`,
        required: true,
      };
    }

    return {
      name: "Node.js",
      ok: true,
      message: version,
      required: true,
    };
  } catch {
    return {
      name: "Node.js",
      ok: false,
      message: "Not found. Required for Vite. Install from https://nodejs.org",
      required: true,
    };
  }
}

async function checkWorkbookDir(workbookDir: string): Promise<PreflightCheck> {
  if (!existsSync(workbookDir)) {
    return {
      name: "Workbook directory",
      ok: false,
      message: `Not found: ${workbookDir}`,
      required: true,
    };
  }

  try {
    const stat = statSync(workbookDir);
    if (!stat.isDirectory()) {
      return {
        name: "Workbook directory",
        ok: false,
        message: `Not a directory: ${workbookDir}`,
        required: true,
      };
    }
  } catch {
    return {
      name: "Workbook directory",
      ok: false,
      message: `Cannot access: ${workbookDir}`,
      required: true,
    };
  }

  return {
    name: "Workbook directory",
    ok: true,
    message: workbookDir,
    required: true,
  };
}

async function checkHandsJson(workbookDir: string): Promise<PreflightCheck> {
  const handsJsonPath = join(workbookDir, "hands.json");

  if (!existsSync(handsJsonPath)) {
    return {
      name: "hands.json",
      ok: false,
      message: `Not found. Create ${handsJsonPath} with workbook config.`,
      required: true,
    };
  }

  try {
    const content = readFileSync(handsJsonPath, "utf-8");
    const config = JSON.parse(content);

    if (!config.name) {
      return {
        name: "hands.json",
        ok: false,
        message: 'Missing required "name" field',
        required: true,
      };
    }

    return {
      name: "hands.json",
      ok: true,
      message: `name: "${config.name}"`,
      required: true,
    };
  } catch (err) {
    return {
      name: "hands.json",
      ok: false,
      message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      required: true,
    };
  }
}

async function checkBlocksDir(workbookDir: string, autoFix: boolean): Promise<PreflightCheck> {
  const blocksDir = join(workbookDir, "blocks");

  if (!existsSync(blocksDir)) {
    if (autoFix) {
      try {
        mkdirSync(blocksDir, { recursive: true });
        return {
          name: "blocks/ directory",
          ok: true,
          message: "Created",
          required: false,
          fixed: true,
        };
      } catch {
        return {
          name: "blocks/ directory",
          ok: false,
          message: "Missing and could not create",
          required: false,
        };
      }
    }
    return {
      name: "blocks/ directory",
      ok: true, // Not required if missing
      message: "Not present (no blocks)",
      required: false,
    };
  }

  return {
    name: "blocks/ directory",
    ok: true,
    message: "Present",
    required: false,
  };
}

async function checkSourcesDir(workbookDir: string, autoFix: boolean): Promise<PreflightCheck> {
  const sourcesDir = join(workbookDir, "sources");

  if (!existsSync(sourcesDir)) {
    if (autoFix) {
      try {
        mkdirSync(sourcesDir, { recursive: true });
        return {
          name: "sources/ directory",
          ok: true,
          message: "Created",
          required: false,
          fixed: true,
        };
      } catch {
        return {
          name: "sources/ directory",
          ok: false,
          message: "Missing and could not create",
          required: false,
        };
      }
    }
    return {
      name: "sources/ directory",
      ok: true,
      message: "Not present (no sources)",
      required: false,
    };
  }

  return {
    name: "sources/ directory",
    ok: true,
    message: "Present",
    required: false,
  };
}

async function checkStdlibSymlink(autoFix: boolean): Promise<PreflightCheck> {
  const stdlibPath = getStdlibSourcePath();

  if (!existsSync(stdlibPath)) {
    return {
      name: "@hands/stdlib",
      ok: false,
      message: `Source not found at ${stdlibPath}`,
      required: true,
    };
  }

  if (autoFix) {
    try {
      ensureStdlibSymlink();
      return {
        name: "@hands/stdlib",
        ok: true,
        message: "Symlink verified",
        required: true,
        fixed: true,
      };
    } catch (err) {
      return {
        name: "@hands/stdlib",
        ok: false,
        message: `Symlink failed: ${err instanceof Error ? err.message : String(err)}`,
        required: true,
      };
    }
  }

  return {
    name: "@hands/stdlib",
    ok: true,
    message: stdlibPath,
    required: true,
  };
}

async function checkWorkbookStdlib(workbookDir: string, autoFix: boolean): Promise<PreflightCheck> {
  const nodeModulesPath = join(workbookDir, "node_modules", "@hands", "stdlib");

  if (autoFix) {
    try {
      ensureWorkbookStdlibSymlink(workbookDir);
      return {
        name: "Workbook @hands/stdlib",
        ok: true,
        message: "Symlink verified",
        required: true,
        fixed: !existsSync(nodeModulesPath),
      };
    } catch (err) {
      return {
        name: "Workbook @hands/stdlib",
        ok: false,
        message: `Symlink failed: ${err instanceof Error ? err.message : String(err)}`,
        required: true,
      };
    }
  }

  if (!existsSync(nodeModulesPath)) {
    return {
      name: "Workbook @hands/stdlib",
      ok: false,
      message: "Symlink missing in workbook node_modules",
      required: true,
    };
  }

  return {
    name: "Workbook @hands/stdlib",
    ok: true,
    message: "Present",
    required: true,
  };
}

async function checkPortAvailable(port: number, autoFix: boolean): Promise<PreflightCheck> {
  const portFree = await waitForPortFree(port, autoFix ? 3000 : 100, autoFix);

  if (!portFree) {
    return {
      name: `Port ${port}`,
      ok: false,
      message: "In use and could not be freed",
      required: true,
    };
  }

  return {
    name: `Port ${port}`,
    ok: true,
    message: "Available",
    required: true,
    fixed: autoFix, // If autoFix was true, we may have killed a process
  };
}

async function checkHandsOutputDir(workbookDir: string, autoFix: boolean): Promise<PreflightCheck> {
  const handsDir = join(workbookDir, ".hands");

  if (!existsSync(handsDir)) {
    // This is fine - it will be created during build
    return {
      name: ".hands/ build directory",
      ok: true,
      message: "Will be created on first build",
      required: false,
    };
  }

  // Check for corrupted state (e.g., missing package.json but has node_modules)
  const packageJson = join(handsDir, "package.json");
  const nodeModules = join(handsDir, "node_modules");

  if (existsSync(nodeModules) && !existsSync(packageJson)) {
    if (autoFix) {
      try {
        rmSync(handsDir, { recursive: true, force: true });
        return {
          name: ".hands/ build directory",
          ok: true,
          message: "Corrupted state cleared - will rebuild",
          required: false,
          fixed: true,
        };
      } catch {
        return {
          name: ".hands/ build directory",
          ok: false,
          message: "Corrupted state, could not clear",
          required: false,
        };
      }
    }
    return {
      name: ".hands/ build directory",
      ok: false,
      message: "Corrupted state (has node_modules but no package.json)",
      required: false,
    };
  }

  return {
    name: ".hands/ build directory",
    ok: true,
    message: "Present",
    required: false,
  };
}

async function checkHandsDependencies(workbookDir: string, autoFix: boolean): Promise<PreflightCheck> {
  const handsDir = join(workbookDir, ".hands");
  const packageJson = join(handsDir, "package.json");
  const nodeModules = join(handsDir, "node_modules");

  // If .hands doesn't exist yet, skip this check
  if (!existsSync(handsDir) || !existsSync(packageJson)) {
    return {
      name: ".hands/ dependencies",
      ok: true,
      message: "Will be installed on first build",
      required: false,
    };
  }

  // Check if node_modules exists
  if (!existsSync(nodeModules)) {
    if (autoFix) {
      try {
        console.log("[preflight] Installing .hands dependencies...");
        const result = await $`cd ${handsDir} && bun install`.quiet();
        if (result.exitCode === 0) {
          return {
            name: ".hands/ dependencies",
            ok: true,
            message: "Installed",
            required: true,
            fixed: true,
          };
        }
        return {
          name: ".hands/ dependencies",
          ok: false,
          message: `npm install failed: ${result.stderr.toString()}`,
          required: true,
        };
      } catch (err: any) {
        // Bun shell errors have stderr on the error object
        const stderr = err?.stderr?.toString?.()?.trim();
        const errMsg = stderr || (err instanceof Error ? err.message : String(err));
        return {
          name: ".hands/ dependencies",
          ok: false,
          message: `Install failed: ${errMsg}`,
          required: true,
        };
      }
    }
    return {
      name: ".hands/ dependencies",
      ok: false,
      message: "node_modules missing - run bun install in .hands/",
      required: true,
    };
  }

  // Check for critical dependencies
  const criticalDeps = ["vite", "rwsdk", "react"];
  const missingDeps: string[] = [];

  for (const dep of criticalDeps) {
    if (!existsSync(join(nodeModules, dep))) {
      missingDeps.push(dep);
    }
  }

  // Also verify critical subpath exports are present (rwsdk/vite is required for Vite to start)
  const criticalSubpaths = [
    { pkg: "rwsdk", subpath: "dist/vite", display: "rwsdk/vite" },
  ];

  for (const { pkg, subpath, display } of criticalSubpaths) {
    const subpathDir = join(nodeModules, pkg, subpath);
    if (existsSync(join(nodeModules, pkg)) && !existsSync(subpathDir)) {
      missingDeps.push(`${display} (incomplete install)`);
    }
  }

  if (missingDeps.length > 0) {
    if (autoFix) {
      try {
        console.log("[preflight] Reinstalling .hands dependencies...");
        const result = await $`cd ${handsDir} && bun install`.quiet();
        if (result.exitCode === 0) {
          return {
            name: ".hands/ dependencies",
            ok: true,
            message: "Reinstalled",
            required: true,
            fixed: true,
          };
        }
      } catch {}
    }
    return {
      name: ".hands/ dependencies",
      ok: false,
      message: `Missing: ${missingDeps.join(", ")}`,
      required: true,
    };
  }

  return {
    name: ".hands/ dependencies",
    ok: true,
    message: "All present",
    required: true,
  };
}
