/**
 * Preflight checks - verify and prepare environment before starting runtime
 *
 * Performs comprehensive validation:
 * - System dependencies (bun, node)
 * - Workbook structure (package.json with hands config, directories)
 * - Port availability
 * - Dependencies installation
 * - Symlinks and file layout
 *
 * Auto-fixes issues where possible (install deps, create dirs, fix symlinks).
 */

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { $ } from "bun";
import {
  generateClientEntry,
  generateTsConfig,
  generateWranglerConfig,
  type HandsConfig,
} from "./build/index.js";
import { ensureStdlibSymlink, generateWorkbookTsConfig, getStdlibSourcePath } from "./config/index.js";
import { killProcessOnPort, PORTS, waitForPortFree } from "./ports.js";

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
  checks.push(await checkWorkbookConfig(workbookDir));
  checks.push(await checkBlocksDir(workbookDir, autoFix));

  // 3. Global stdlib symlink (for development)
  checks.push(await checkStdlibSymlink(autoFix));

  // 4. Port availability (clean up stale processes)
  checks.push(await checkPortAvailable(port, autoFix));
  // Also check Vite/worker port - critical for RSC to work
  checks.push(await checkPortAvailable(PORTS.WORKER, autoFix));

  // 5. Scaffold .hands directory with config files (vite.config.mts, wrangler.jsonc, etc.)
  // .hands/ is a build directory - node_modules is symlinked to ../node_modules
  // A minimal package.json is created for rwsdk compatibility
  checks.push(await scaffoldHandsDir(workbookDir, autoFix));

  // 7. Clear Vite cache to prevent stale dependency issues
  checks.push(await clearViteCache(workbookDir));

  // 8. Ensure workbook tsconfig.json has proper paths to runtime
  checks.push(await checkWorkbookTsConfig(workbookDir, autoFix));

  // 9. Ensure workbook has required dependencies in package.json
  checks.push(await checkWorkbookDependencies(workbookDir, autoFix));

  // 10. Apply rwsdk patch (fixes deadlock in directiveModulesDevPlugin)
  checks.push(await patchRwsdk(workbookDir));

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

async function checkWorkbookConfig(workbookDir: string): Promise<PreflightCheck> {
  const pkgJsonPath = join(workbookDir, "package.json");

  if (!existsSync(pkgJsonPath)) {
    return {
      name: "package.json",
      ok: false,
      message: `Not found at ${pkgJsonPath}`,
      required: true,
    };
  }

  try {
    const content = readFileSync(pkgJsonPath, "utf-8");
    const pkg = JSON.parse(content);

    // Get name from package.json name field
    const name = pkg.name?.replace(/^@hands\//, "") || "workbook";

    return {
      name: "package.json",
      ok: true,
      message: `name: "${name}"`,
      required: true,
    };
  } catch (err) {
    return {
      name: "package.json",
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

/**
 * Expected tsconfig.json content for .hands directory
 * Must match generateTsConfig() in build/rsc.ts
 */
const EXPECTED_HANDS_TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "jsxImportSource": "react",
    "types": ["@cloudflare/workers-types"]
  },
  "include": ["src/**/*", "../blocks/**/*"],
  "exclude": ["node_modules"]
}
`;

async function checkHandsTsConfig(workbookDir: string, autoFix: boolean): Promise<PreflightCheck> {
  const handsDir = join(workbookDir, ".hands");
  const tsconfigPath = join(handsDir, "tsconfig.json");

  // If .hands doesn't exist yet, skip - it will be created on first build
  if (!existsSync(handsDir)) {
    return {
      name: ".hands/tsconfig.json",
      ok: true,
      message: "Will be created on first build",
      required: false,
    };
  }

  // Check if tsconfig exists and matches expected content
  if (existsSync(tsconfigPath)) {
    try {
      const current = readFileSync(tsconfigPath, "utf-8");
      // Normalize whitespace for comparison
      const currentNorm = JSON.stringify(JSON.parse(current));
      const expectedNorm = JSON.stringify(JSON.parse(EXPECTED_HANDS_TSCONFIG));

      if (currentNorm === expectedNorm) {
        return {
          name: ".hands/tsconfig.json",
          ok: true,
          message: "Up to date",
          required: false,
        };
      }
    } catch {
      // JSON parse failed, needs fixing
    }
  }

  // Needs fixing
  if (autoFix) {
    try {
      writeFileSync(tsconfigPath, EXPECTED_HANDS_TSCONFIG);
      return {
        name: ".hands/tsconfig.json",
        ok: true,
        message: "Updated",
        required: false,
        fixed: true,
      };
    } catch (err) {
      return {
        name: ".hands/tsconfig.json",
        ok: false,
        message: `Could not update: ${err instanceof Error ? err.message : String(err)}`,
        required: false,
      };
    }
  }

  return {
    name: ".hands/tsconfig.json",
    ok: false,
    message: "Outdated - run with --fix to update",
    required: false,
  };
}

/**
 * Required dependencies for workbook package.json
 */
// Base deps - @hands/stdlib is added dynamically with file: path
const REQUIRED_WORKBOOK_DEPS_BASE = {
  dependencies: {
    // React (required for RSC)
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "react-server-dom-webpack": "^19.0.0",
    // Runtime deps for Vite worker
    "rwsdk": "1.0.0-beta.39",
    "hono": "^4.7.0",
    "@electric-sql/pglite": "^0.2.17",
    "@trpc/client": "^11.0.0",
  },
  devDependencies: {
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "@cloudflare/vite-plugin": "^1.16.1",
    "@cloudflare/workers-types": "^4.20251202.0",
    "typescript": "^5.8.0",
    "vite": "^7.2.0",
  },
};

/**
 * Get required deps including stdlib with file: path
 * bun install with file: copies the package (not symlink)
 */
function getRequiredWorkbookDeps() {
  const stdlibPath = getStdlibSourcePath();
  return {
    dependencies: {
      ...REQUIRED_WORKBOOK_DEPS_BASE.dependencies,
      // file: protocol causes bun to copy the package, not symlink
      // This is required because rwsdk's "use client" scan doesn't follow symlinks
      "@hands/stdlib": `file:${stdlibPath}`,
    },
    devDependencies: REQUIRED_WORKBOOK_DEPS_BASE.devDependencies,
  };
}

async function checkWorkbookDependencies(workbookDir: string, autoFix: boolean): Promise<PreflightCheck> {
  const packageJsonPath = join(workbookDir, "package.json");

  if (!existsSync(packageJsonPath)) {
    return {
      name: "Workbook dependencies",
      ok: false,
      message: "package.json not found",
      required: true,
    };
  }

  try {
    const content = readFileSync(packageJsonPath, "utf-8");
    const pkg = JSON.parse(content);
    const requiredDeps = getRequiredWorkbookDeps();

    const missingDeps: string[] = [];
    const missingDevDeps: string[] = [];

    // Check dependencies
    for (const [name, version] of Object.entries(requiredDeps.dependencies)) {
      if (!pkg.dependencies?.[name]) {
        missingDeps.push(`${name}@${version}`);
      }
    }

    // Check devDependencies
    for (const [name, version] of Object.entries(requiredDeps.devDependencies)) {
      if (!pkg.devDependencies?.[name]) {
        missingDevDeps.push(`${name}@${version}`);
      }
    }

    if (missingDeps.length === 0 && missingDevDeps.length === 0) {
      return {
        name: "Workbook dependencies",
        ok: true,
        message: "All required dependencies present",
        required: true,
      };
    }

    // Auto-fix: add missing dependencies
    if (autoFix) {
      pkg.dependencies = pkg.dependencies || {};
      pkg.devDependencies = pkg.devDependencies || {};

      let added = false;
      for (const [name, version] of Object.entries(requiredDeps.dependencies)) {
        if (!pkg.dependencies[name]) {
          pkg.dependencies[name] = version;
          added = true;
        }
      }

      for (const [name, version] of Object.entries(requiredDeps.devDependencies)) {
        if (!pkg.devDependencies[name]) {
          pkg.devDependencies[name] = version;
          added = true;
        }
      }

      if (added) {
        writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
      }

      // Run bun install to ensure node_modules is up to date
      try {
        console.log("[preflight] Installing workbook dependencies...");
        const result = await $`cd ${workbookDir} && bun install`.quiet();
        if (result.exitCode !== 0) {
          return {
            name: "Workbook dependencies",
            ok: false,
            message: `bun install failed: ${result.stderr.toString()}`,
            required: true,
          };
        }
      } catch (err: any) {
        const stderr = err?.stderr?.toString?.()?.trim();
        const errMsg = stderr || (err instanceof Error ? err.message : String(err));
        return {
          name: "Workbook dependencies",
          ok: false,
          message: `Install failed: ${errMsg}`,
          required: true,
        };
      }

      return {
        name: "Workbook dependencies",
        ok: true,
        message: added ? "Added deps and installed" : "Installed",
        required: true,
        fixed: added,
      };
    }

    const allMissing = [...missingDeps, ...missingDevDeps];
    return {
      name: "Workbook dependencies",
      ok: false,
      message: `Missing: ${allMissing.join(", ")}`,
      required: true,
    };
  } catch (err) {
    return {
      name: "Workbook dependencies",
      ok: false,
      message: `Error reading package.json: ${err instanceof Error ? err.message : String(err)}`,
      required: true,
    };
  }
}

/**
 * Patch rwsdk to fix deadlock in directiveModulesDevPlugin.
 *
 * The bug: esbuild plugin awaits scanPromise in onResolve, but scanPromise
 * only resolves in configureServer. Vite runs dep optimization BEFORE
 * configureServer, causing a deadlock.
 *
 * The fix: Use separate optimizePromise that resolves at end of configResolved.
 *
 * TODO: Remove this patch when rwsdk merges the fix upstream.
 * Tracking: https://github.com/xizhao/sdk (forked with fix)
 */
async function patchRwsdk(workbookDir: string): Promise<PreflightCheck> {
  const targetPath = join(workbookDir, "node_modules/rwsdk/dist/vite/directiveModulesDevPlugin.mjs");

  // Check if rwsdk is installed
  if (!existsSync(targetPath)) {
    return {
      name: "rwsdk patch",
      ok: true,
      message: "rwsdk not installed, skipping patch",
      required: false,
    };
  }

  try {
    const currentContent = readFileSync(targetPath, "utf-8");

    // Check if already patched (look for optimizePromise)
    if (currentContent.includes("optimizePromise")) {
      return {
        name: "rwsdk patch",
        ok: true,
        message: "Already patched",
        required: false,
      };
    }

    // Read the patched version from our patches directory
    const patchPath = join(import.meta.dirname, "patches/rwsdk-directiveModulesDevPlugin.mjs");
    if (!existsSync(patchPath)) {
      return {
        name: "rwsdk patch",
        ok: false,
        message: "Patch file not found",
        required: true,
      };
    }

    const patchedContent = readFileSync(patchPath, "utf-8");
    writeFileSync(targetPath, patchedContent);

    return {
      name: "rwsdk patch",
      ok: true,
      message: "Applied deadlock fix",
      required: false,
      fixed: true,
    };
  } catch (err) {
    return {
      name: "rwsdk patch",
      ok: false,
      message: `Failed to patch: ${err instanceof Error ? err.message : String(err)}`,
      required: true,
    };
  }
}

/**
 * Clear Vite's dependency optimization cache on startup.
 * This prevents "new version of pre-bundle" race condition errors
 * that occur when Vite discovers new dependencies mid-session.
 */
async function clearViteCache(workbookDir: string): Promise<PreflightCheck> {
  const handsDir = join(workbookDir, ".hands");
  const viteCacheDir = join(handsDir, ".vite");

  // If cache doesn't exist, nothing to do
  if (!existsSync(viteCacheDir)) {
    return {
      name: "Vite cache",
      ok: true,
      message: "No cache to clear",
      required: false,
    };
  }

  try {
    rmSync(viteCacheDir, { recursive: true, force: true });
    return {
      name: "Vite cache",
      ok: true,
      message: "Cleared",
      required: false,
      fixed: true,
    };
  } catch (err) {
    // Non-fatal - Vite will work, just might have stale cache
    return {
      name: "Vite cache",
      ok: true,
      message: `Could not clear: ${err instanceof Error ? err.message : String(err)}`,
      required: false,
    };
  }
}

/**
 * Ensure workbook's tsconfig.json has proper paths to the runtime.
 * This is required for TypeScript diagnostics to work correctly.
 */
async function checkWorkbookTsConfig(workbookDir: string, autoFix: boolean): Promise<PreflightCheck> {
  const tsconfigPath = join(workbookDir, "tsconfig.json");

  // Generate expected tsconfig content
  const expectedContent = generateWorkbookTsConfig(workbookDir);
  const expectedConfig = JSON.parse(expectedContent);

  // If tsconfig doesn't exist, create it
  if (!existsSync(tsconfigPath)) {
    if (autoFix) {
      try {
        writeFileSync(tsconfigPath, `${expectedContent}\n`);
        return {
          name: "Workbook tsconfig.json",
          ok: true,
          message: "Created with runtime paths",
          required: false,
          fixed: true,
        };
      } catch (err) {
        return {
          name: "Workbook tsconfig.json",
          ok: false,
          message: `Could not create: ${err instanceof Error ? err.message : String(err)}`,
          required: false,
        };
      }
    }
    return {
      name: "Workbook tsconfig.json",
      ok: false,
      message: "Missing (run with --fix to create)",
      required: false,
    };
  }

  // Check if existing tsconfig has the required paths
  try {
    const currentContent = readFileSync(tsconfigPath, "utf-8");
    const currentConfig = JSON.parse(currentContent);

    // Check if paths are present and include @hands/db, @hands/runtime, @ui/*
    const currentPaths = currentConfig.compilerOptions?.paths || {};
    const expectedPaths = expectedConfig.compilerOptions?.paths || {};

    const missingPaths: string[] = [];
    for (const key of Object.keys(expectedPaths)) {
      if (!currentPaths[key]) {
        missingPaths.push(key);
      }
    }

    if (missingPaths.length === 0) {
      return {
        name: "Workbook tsconfig.json",
        ok: true,
        message: "Has runtime paths",
        required: false,
      };
    }

    // Auto-fix: merge paths into existing config
    if (autoFix) {
      currentConfig.compilerOptions = currentConfig.compilerOptions || {};
      currentConfig.compilerOptions.baseUrl = currentConfig.compilerOptions.baseUrl || ".";
      currentConfig.compilerOptions.paths = {
        ...currentConfig.compilerOptions.paths,
        ...expectedPaths,
      };

      writeFileSync(tsconfigPath, `${JSON.stringify(currentConfig, null, 2)}\n`);
      return {
        name: "Workbook tsconfig.json",
        ok: true,
        message: `Added paths: ${missingPaths.join(", ")}`,
        required: false,
        fixed: true,
      };
    }

    return {
      name: "Workbook tsconfig.json",
      ok: false,
      message: `Missing paths: ${missingPaths.join(", ")}`,
      required: false,
    };
  } catch (err) {
    return {
      name: "Workbook tsconfig.json",
      ok: false,
      message: `Invalid JSON: ${err instanceof Error ? err.message : String(err)}`,
      required: false,
    };
  }
}

/**
 * Write a file only if its content has changed.
 * This prevents unnecessary mtime updates that would trigger Vite re-optimization.
 */
function writeFileIfChanged(filePath: string, content: string): boolean {
  if (existsSync(filePath)) {
    const existing = readFileSync(filePath, "utf-8");
    if (existing === content) {
      return false; // No change
    }
  }
  writeFileSync(filePath, content);
  return true; // Written
}

/**
 * Scaffold .hands directory with required config files.
 *
 * Note: vite.config.mts is NOT scaffolded here - it lives in @hands/runtime.
 * The runtime package has its own vite.config.mts and uses HANDS_WORKBOOK_PATH env var.
 *
 * Files are only written if their content has changed.
 */
export async function scaffoldHandsDir(workbookDir: string, autoFix: boolean): Promise<PreflightCheck> {
  const handsDir = join(workbookDir, ".hands");
  const srcDir = join(handsDir, "src");
  const pkgJsonPath = join(workbookDir, "package.json");

  // Must have package.json to scaffold
  if (!existsSync(pkgJsonPath)) {
    return {
      name: ".hands scaffold",
      ok: false,
      message: "No package.json found",
      required: true,
    };
  }

  if (!autoFix) {
    // Check if scaffold is needed
    const requiredFiles = [
      join(handsDir, "wrangler.jsonc"),
      join(handsDir, "tsconfig.json"),
      join(srcDir, "client.tsx"),
    ];
    const missing = requiredFiles.filter((f) => !existsSync(f));
    if (missing.length > 0) {
      return {
        name: ".hands scaffold",
        ok: false,
        message: `Missing files: ${missing.map((f) => f.replace(handsDir + "/", "")).join(", ")}`,
        required: true,
      };
    }
    return {
      name: ".hands scaffold",
      ok: true,
      message: "All config files present",
      required: true,
    };
  }

  try {
    const pkg = JSON.parse(readFileSync(pkgJsonPath, "utf-8"));
    const config: HandsConfig = pkg.hands || {};
    const filesWritten: string[] = [];

    // Ensure directories exist
    if (!existsSync(handsDir)) {
      mkdirSync(handsDir, { recursive: true });
    }
    if (!existsSync(srcDir)) {
      mkdirSync(srcDir, { recursive: true });
    }

    // Symlink .hands/node_modules -> ../node_modules
    // This allows vite.config.mts to import from workbook's deps
    const handsNodeModules = join(handsDir, "node_modules");
    try {
      const stat = lstatSync(handsNodeModules);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(handsNodeModules);
        if (target !== "../node_modules") {
          unlinkSync(handsNodeModules);
          symlinkSync("../node_modules", handsNodeModules);
          filesWritten.push("node_modules symlink");
        }
      } else {
        // It's a real directory, remove it and symlink
        rmSync(handsNodeModules, { recursive: true, force: true });
        symlinkSync("../node_modules", handsNodeModules);
        filesWritten.push("node_modules symlink");
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        symlinkSync("../node_modules", handsNodeModules);
        filesWritten.push("node_modules symlink");
      }
    }

    // Symlink workbook/src -> .hands/src
    // rwsdk scans root/src for "use client"/"use server" directives
    // This makes our worker.tsx visible to the scan
    const workbookSrc = join(workbookDir, "src");
    try {
      const stat = lstatSync(workbookSrc);
      if (stat.isSymbolicLink()) {
        const target = readlinkSync(workbookSrc);
        if (target !== ".hands/src") {
          unlinkSync(workbookSrc);
          symlinkSync(".hands/src", workbookSrc);
          filesWritten.push("src symlink");
        }
      } else {
        // It's a real directory - don't touch it, user might have their own src/
      }
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        symlinkSync(".hands/src", workbookSrc);
        filesWritten.push("src symlink");
      }
    }

    // Generate and write config files (only if changed)
    // Note: vite.config.mts is NOT generated here - it lives in @hands/runtime
    const handsPackageJson = JSON.stringify({
      name: `${config.name}-hands`,
      private: true,
      type: "module",
    }, null, 2);
    if (writeFileIfChanged(join(handsDir, "package.json"), handsPackageJson)) {
      filesWritten.push("package.json");
    }
    if (writeFileIfChanged(join(handsDir, "wrangler.jsonc"), generateWranglerConfig(config))) {
      filesWritten.push("wrangler.jsonc");
    }
    if (writeFileIfChanged(join(handsDir, "tsconfig.json"), generateTsConfig())) {
      filesWritten.push("tsconfig.json");
    }
    if (writeFileIfChanged(join(srcDir, "client.tsx"), generateClientEntry())) {
      filesWritten.push("src/client.tsx");
    }
    if (writeFileIfChanged(join(handsDir, ".gitignore"), "node_modules/\ndist/\n.wrangler/\n")) {
      filesWritten.push(".gitignore");
    }
    // Create empty types.ts if it doesn't exist (pgtyped will populate it)
    const typesPath = join(handsDir, "types.ts");
    if (!existsSync(typesPath)) {
      writeFileSync(typesPath, "// Auto-generated by pgtyped. Will be populated on first run.\nexport {};\n");
      filesWritten.push("types.ts");
    }

    // Create components.json for shadcn if it doesn't exist
    const componentsJsonPath = join(workbookDir, "components.json");
    if (!existsSync(componentsJsonPath)) {
      const componentsJson = JSON.stringify({
        "$schema": "https://ui.shadcn.com/schema.json",
        "style": "new-york",
        "rsc": true,
        "tsx": true,
        "tailwind": {
          "config": "",
          "css": "styles.css",
          "baseColor": "neutral",
          "cssVariables": true,
          "prefix": ""
        },
        "iconLibrary": "lucide",
        "aliases": {
          "components": "@ui",
          "utils": "@ui/lib/utils",
          "ui": "@ui",
          "lib": "@ui/lib",
          "hooks": "@ui/hooks"
        }
      }, null, 2);
      writeFileSync(componentsJsonPath, componentsJson);
      filesWritten.push("components.json");
    }

    return {
      name: ".hands scaffold",
      ok: true,
      message: filesWritten.length > 0 ? `Updated: ${filesWritten.join(", ")}` : "Up to date",
      required: true,
      fixed: filesWritten.length > 0,
    };
  } catch (err) {
    return {
      name: ".hands scaffold",
      ok: false,
      message: `Scaffold failed: ${err instanceof Error ? err.message : String(err)}`,
      required: true,
    };
  }
}
