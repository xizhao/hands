/**
 * Preflight checks - verify all dependencies before starting runtime
 */

import { existsSync } from "fs";
import { join, dirname } from "path";
import { $ } from "bun";

interface PreflightResult {
  ok: boolean;
  checks: PreflightCheck[];
}

interface PreflightCheck {
  name: string;
  ok: boolean;
  message: string;
  required: boolean;
}

/**
 * Run all preflight checks
 */
export async function runPreflightChecks(): Promise<PreflightResult> {
  const checks: PreflightCheck[] = [];

  // Check Bun
  checks.push(await checkBun());

  // Check Node (needed by wrangler)
  checks.push(await checkNode());

  // Check wrangler binary
  checks.push(checkWrangler());

  // Check postgres binaries (optional - will be downloaded if missing)
  checks.push(await checkPostgresBinaries());

  const ok = checks.filter((c) => c.required).every((c) => c.ok);

  return { ok, checks };
}

/**
 * Print preflight results to console
 */
export function printPreflightResults(result: PreflightResult): void {
  console.log("\n=== Preflight Checks ===\n");

  for (const check of result.checks) {
    const status = check.ok ? "\x1b[32m✓\x1b[0m" : check.required ? "\x1b[31m✗\x1b[0m" : "\x1b[33m○\x1b[0m";
    const reqLabel = check.required ? "" : " (optional)";
    console.log(`${status} ${check.name}${reqLabel}: ${check.message}`);
  }

  console.log("");

  if (!result.ok) {
    console.error("\x1b[31mPreflight checks failed. Please install missing dependencies.\x1b[0m\n");
  }
}

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
      message: "Not found. Required for wrangler. Install from https://nodejs.org",
      required: true,
    };
  }
}

function checkWrangler(): PreflightCheck {
  // import.meta.dir is packages/runtime/src
  const runtimeDir = dirname(import.meta.dir);
  const wranglerBin = join(runtimeDir, "node_modules", ".bin", "wrangler");

  if (existsSync(wranglerBin)) {
    return {
      name: "Wrangler",
      ok: true,
      message: `Found at ${wranglerBin}`,
      required: true,
    };
  }

  return {
    name: "Wrangler",
    ok: false,
    message: "Not found in runtime node_modules. Run 'bun install' in packages/runtime",
    required: true,
  };
}

async function checkPostgresBinaries(): Promise<PreflightCheck> {
  const home = process.env.HOME || "~";
  let cacheDir: string;

  if (process.platform === "darwin") {
    cacheDir = join(home, "Library", "Caches", "Hands");
  } else if (process.platform === "win32") {
    cacheDir = join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "Hands", "Cache");
  } else {
    cacheDir = join(process.env.XDG_CACHE_HOME || join(home, ".cache"), "hands");
  }

  const pgDir = join(cacheDir, "postgres");

  if (existsSync(pgDir)) {
    return {
      name: "PostgreSQL binaries",
      ok: true,
      message: `Found at ${pgDir}`,
      required: false,
    };
  }

  return {
    name: "PostgreSQL binaries",
    ok: false,
    message: "Not found (will be downloaded on first use)",
    required: false,
  };
}
