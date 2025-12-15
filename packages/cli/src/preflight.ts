import { execSync, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import pc from "picocolors";

interface PreflightCheck {
  name: string;
  /** If true, failure stops the process */
  required?: boolean;
  /** If true and check fails, auto-fix was attempted */
  autoFix?: boolean;
  check: (workbookPath: string) => Promise<boolean | string>;
}

const checks: PreflightCheck[] = [
  // System requirements
  {
    name: "bun installed",
    required: true,
    check: async () => {
      try {
        const result = spawnSync("bun", ["--version"], { encoding: "utf-8" });
        if (result.status === 0) {
          return true;
        }
        return "Bun not found. Install from https://bun.sh";
      } catch {
        return "Bun not found. Install from https://bun.sh";
      }
    },
  },
  {
    name: "node >= 18",
    required: true,
    check: async () => {
      try {
        const result = spawnSync("node", ["--version"], { encoding: "utf-8" });
        if (result.status !== 0) {
          return "Node.js not found. Install from https://nodejs.org";
        }
        const version = result.stdout.trim();
        const major = parseInt(version.replace("v", "").split(".")[0], 10);
        if (major < 18) {
          return `Node.js ${version} is too old. Requires v18+`;
        }
        return true;
      } catch {
        return "Node.js not found. Install from https://nodejs.org";
      }
    },
  },

  // Workbook structure
  {
    name: "package.json exists",
    required: true,
    check: async (workbookPath) => {
      const pkgPath = path.join(workbookPath, "package.json");
      if (!fs.existsSync(pkgPath)) {
        return "Missing package.json. Run 'hands init' to create one.";
      }
      return true;
    },
  },
  {
    name: "package.json is valid",
    required: true,
    check: async (workbookPath) => {
      const pkgPath = path.join(workbookPath, "package.json");
      try {
        const content = fs.readFileSync(pkgPath, "utf-8");
        JSON.parse(content);
        return true;
      } catch {
        return "package.json is not valid JSON";
      }
    },
  },
  {
    name: "dependencies installed",
    autoFix: true,
    check: async (workbookPath) => {
      try {
        const result = spawnSync("bun", ["install"], {
          cwd: workbookPath,
          stdio: "pipe",
          encoding: "utf-8",
        });
        if (result.status !== 0) {
          return `bun install failed: ${result.stderr || result.stdout}`;
        }
        return true;
      } catch (err) {
        return `Failed to run bun install: ${err}`;
      }
    },
  },
  {
    name: "blocks directory exists",
    autoFix: true,
    check: async (workbookPath) => {
      const blocksDir = path.join(workbookPath, "blocks");
      if (!fs.existsSync(blocksDir)) {
        fs.mkdirSync(blocksDir, { recursive: true });
        console.log(pc.dim("  Created blocks/ directory"));
      }
      return true;
    },
  },
  {
    name: ".hands directory exists",
    autoFix: true,
    check: async (workbookPath) => {
      const handsDir = path.join(workbookPath, ".hands");
      if (!fs.existsSync(handsDir)) {
        fs.mkdirSync(handsDir, { recursive: true });
        console.log(pc.dim("  Created .hands/ directory"));
      }
      return true;
    },
  },

  // Cache cleanup (prevents stale dependency issues)
  {
    name: "vite cache cleared",
    autoFix: true,
    check: async (workbookPath) => {
      const cacheDir = path.join(workbookPath, "node_modules", ".vite");
      if (fs.existsSync(cacheDir)) {
        try {
          fs.rmSync(cacheDir, { recursive: true, force: true });
          console.log(pc.dim("  Cleared .vite cache"));
        } catch {
          // Non-fatal, just log
          console.log(pc.dim("  Could not clear .vite cache"));
        }
      }
      return true;
    },
  },
];

export async function preflight(workbookPath: string): Promise<boolean> {
  console.log(pc.dim("Running preflight checks..."));

  let allPassed = true;

  for (const check of checks) {
    const result = await check.check(workbookPath);
    if (result === true) {
      console.log(pc.green(`  ✓ ${check.name}`));
    } else {
      if (check.required) {
        console.log(pc.red(`  ✗ ${check.name}`));
        console.log(pc.red(`    ${result}`));
        allPassed = false;
      } else {
        console.log(pc.yellow(`  ○ ${check.name}`));
        console.log(pc.yellow(`    ${result}`));
      }
    }
  }

  if (allPassed) {
    console.log(pc.green("Preflight checks passed\n"));
  }

  return allPassed;
}

/**
 * Check if a port is in use and optionally kill the process
 */
export async function ensurePortFree(port: number, kill = true): Promise<boolean> {
  const net = await import("net");

  const isInUse = await new Promise<boolean>((resolve) => {
    const server = net.createServer();
    server.once("error", (err: NodeJS.ErrnoException) => {
      resolve(err.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close();
      resolve(false);
    });
    server.listen(port, "127.0.0.1");
  });

  if (!isInUse) return true;

  if (kill) {
    console.log(pc.dim(`  Port ${port} in use, killing process...`));
    try {
      execSync(`lsof -ti :${port} | xargs kill -9 2>/dev/null || true`, { stdio: "ignore" });
      // Wait for port to be released
      await new Promise((r) => setTimeout(r, 500));
      return true;
    } catch {
      return false;
    }
  }

  return false;
}
