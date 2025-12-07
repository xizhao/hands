/**
 * Wrangler dev server management
 */

import { spawn, type Subprocess } from "bun";
import { existsSync, mkdirSync, symlinkSync, unlinkSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import type { ServiceStatus } from "../types";
import { validateWranglerConfig } from "./parser";

// Get the runtime's wrangler binary path
function getWranglerBinPath(): string {
  // import.meta.dir is packages/runtime/src/wrangler
  // We need packages/runtime/node_modules/.bin/wrangler
  const runtimeDir = dirname(dirname(import.meta.dir));
  return join(runtimeDir, "node_modules", ".bin", "wrangler");
}

interface WranglerManagerConfig {
  workbookDir: string;
  port: number;
}

// Find the monorepo root by looking for the root package.json with workspaces
function findMonorepoRoot(): string | null {
  // Start from runtime package and walk up
  let current = dirname(dirname(dirname(import.meta.dir)));

  for (let i = 0; i < 10; i++) {
    const pkgPath = join(current, "package.json");
    if (existsSync(pkgPath)) {
      try {
        const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
        if (pkg.workspaces) {
          return current;
        }
      } catch {}
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export class WranglerManager {
  private config: WranglerManagerConfig;
  private process: Subprocess | null = null;
  private ready = false;
  private output: string[] = [];
  private errors: string[] = [];

  constructor(config: WranglerManagerConfig) {
    this.config = config;
  }

  get status(): ServiceStatus {
    return {
      up: this.ready && this.process !== null,
      port: this.config.port,
      pid: this.process?.pid,
      error: this.errors.length > 0 ? this.errors[this.errors.length - 1] : undefined,
    };
  }

  get recentOutput(): string[] {
    return this.output.slice(-100); // Last 100 lines
  }

  get recentErrors(): string[] {
    return this.errors;
  }

  /**
   * Patch package.json to use file: reference for @hands/stdlib in dev mode
   */
  private patchPackageJson(): void {
    const monorepoRoot = findMonorepoRoot();
    if (!monorepoRoot) {
      console.log("Not in monorepo, skipping stdlib patch");
      return;
    }

    const stdlibPath = join(monorepoRoot, "packages", "stdlib");
    if (!existsSync(stdlibPath)) {
      console.log("stdlib not found at", stdlibPath);
      return;
    }

    const pkgPath = join(this.config.workbookDir, "package.json");
    if (!existsSync(pkgPath)) {
      return;
    }

    try {
      const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
      if (pkg.dependencies?.["@hands/stdlib"]?.startsWith("workspace:")) {
        pkg.dependencies["@hands/stdlib"] = `file:${stdlibPath}`;
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2));
        console.log(`Patched @hands/stdlib -> file:${stdlibPath}`);
      }
    } catch (err) {
      console.log("Failed to patch package.json:", err);
    }
  }

  /**
   * Check if dependencies are installed
   */
  private async ensureDependencies(): Promise<void> {
    const nodeModules = join(this.config.workbookDir, "node_modules");

    if (existsSync(join(nodeModules, "hono"))) {
      // Already installed (check for a key dependency)
      return;
    }

    // Patch package.json for dev mode before install
    this.patchPackageJson();

    console.log("Installing workbook dependencies...");

    const proc = spawn(["bun", "install"], {
      cwd: this.config.workbookDir,
      stdout: "inherit",
      stderr: "inherit",
    });

    const exitCode = await proc.exited;
    if (exitCode !== 0) {
      throw new Error("Failed to install dependencies");
    }
  }

  /**
   * Start the wrangler dev server
   */
  async start(): Promise<void> {
    if (this.process) {
      console.log("Wrangler already running");
      return;
    }

    // Validate wrangler.toml first
    const configErrors = await validateWranglerConfig(this.config.workbookDir);
    if (configErrors.length > 0) {
      this.errors = configErrors;
      throw new Error(`Invalid wrangler.toml: ${configErrors.join(", ")}`);
    }

    await this.ensureDependencies();

    console.log(`Starting wrangler dev on port ${this.config.port}...`);

    this.output = [];
    this.errors = [];

    const wranglerBin = getWranglerBinPath();
    console.log(`Using wrangler at: ${wranglerBin}`);

    this.process = spawn(
      [wranglerBin, "dev", "--local", "--port", String(this.config.port)],
      {
        cwd: this.config.workbookDir,
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          // Disable update check to reduce noise
          WRANGLER_DISABLE_UPDATE_CHECK: "1",
        },
      }
    );

    // Stream stdout
    const stdout = this.process.stdout;
    const stderr = this.process.stderr;
    if (stdout && typeof stdout !== "number") {
      this.streamOutput(stdout, false);
    }
    if (stderr && typeof stderr !== "number") {
      this.streamOutput(stderr, true);
    }

    // Wait for ready signal
    await this.waitForReady();
  }

  private async streamOutput(
    stream: ReadableStream<Uint8Array>,
    isError: boolean
  ): Promise<void> {
    const reader = stream.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n").filter(Boolean);

        for (const line of lines) {
          if (isError) {
            this.errors.push(line);
            console.error(`[wrangler] ${line}`);
          } else {
            this.output.push(line);
            console.log(`[wrangler] ${line}`);
          }

          // Check for ready signal
          if (line.includes("Ready on") || line.includes("Listening on")) {
            this.ready = true;
          }
        }
      }
    } catch {
      // Stream closed
    }
  }

  private async waitForReady(maxAttempts = 60): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      if (this.ready) {
        console.log(`Wrangler ready on port ${this.config.port}`);
        return;
      }

      // Check if process died
      if (this.process && this.process.exitCode !== null) {
        throw new Error(`Wrangler exited with code ${this.process.exitCode}`);
      }

      await Bun.sleep(500);
    }

    throw new Error("Wrangler failed to start within timeout");
  }

  /**
   * Stop the wrangler dev server
   */
  async stop(): Promise<void> {
    if (!this.process) {
      return;
    }

    console.log("Stopping wrangler...");
    this.ready = false;

    this.process.kill("SIGTERM");

    const timeout = setTimeout(() => {
      this.process?.kill("SIGKILL");
    }, 5000);

    await this.process.exited;
    clearTimeout(timeout);

    this.process = null;
    console.log("Wrangler stopped");
  }

  /**
   * Restart the wrangler dev server
   */
  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }
}
