/**
 * Wrangler dev server management
 */

import { spawn, type Subprocess } from "bun";
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join, dirname } from "path";
import type { ServiceStatus, ServiceState, BuildError } from "../types";
import { validateWranglerConfig } from "./parser";
import { build, needsBuild } from "@hands/stdlib";

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
  maxRetries?: number;
  portRetryRange?: number;
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

/**
 * Check if a port is available
 */
async function isPortAvailable(port: number): Promise<boolean> {
  try {
    const server = Bun.serve({
      port,
      fetch() {
        return new Response();
      },
    });
    server.stop();
    return true;
  } catch {
    return false;
  }
}

/**
 * Find a free port starting from the given port
 */
async function findFreePort(start: number, range: number = 100): Promise<number> {
  for (let port = start; port < start + range; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No free port found in range ${start}-${start + range}`);
}

/**
 * Kill any process using a specific port
 */
async function killProcessOnPort(port: number): Promise<boolean> {
  try {
    // Try to find and kill the process using the port
    const result = Bun.spawnSync(["lsof", "-ti", `:${port}`]);
    const pids = new TextDecoder().decode(result.stdout).trim().split("\n").filter(Boolean);

    if (pids.length > 0) {
      for (const pid of pids) {
        try {
          process.kill(parseInt(pid, 10), "SIGTERM");
        } catch {
          // Process might already be dead
        }
      }
      // Wait a bit for processes to die
      await Bun.sleep(500);
      return true;
    }
  } catch {
    // lsof not available or failed
  }
  return false;
}

/**
 * Parse wrangler build errors from stderr output
 */
function parseBuildErrors(errorLines: string[]): BuildError[] {
  const errors: BuildError[] = [];
  const fullText = errorLines.join("\n");

  // Pattern for "Could not resolve" errors
  // ✘ [ERROR] Could not resolve "d3-array"
  //     node_modules/d3-scale/src/band.js:1:32:
  const resolvePattern = /✘ \[ERROR\] Could not resolve "([^"]+)"\s*\n\s*([^\n:]+):(\d+):(\d+):/g;
  let match;

  while ((match = resolvePattern.exec(fullText)) !== null) {
    errors.push({
      type: "resolve",
      module: match[1],
      file: match[2].trim(),
      line: parseInt(match[3], 10),
      column: parseInt(match[4], 10),
      message: `Could not resolve "${match[1]}"`,
      suggestion: `Mark "${match[1]}" as external in wrangler.toml`,
    });
  }

  // Pattern for generic [ERROR] messages
  const genericPattern = /✘ \[ERROR\] ([^\n]+)/g;
  while ((match = genericPattern.exec(fullText)) !== null) {
    const msg = match[1].trim();
    // Skip if already captured as resolve error
    if (msg.startsWith("Could not resolve")) continue;
    // Skip the "Build failed with X errors" summary
    if (msg.startsWith("Build failed with")) continue;

    errors.push({
      type: "other",
      message: msg,
    });
  }

  // Deduplicate by module for resolve errors
  const seen = new Set<string>();
  return errors.filter(e => {
    if (e.type === "resolve" && e.module) {
      if (seen.has(e.module)) return false;
      seen.add(e.module);
    }
    return true;
  });
}

export class WranglerManager {
  private config: WranglerManagerConfig;
  private process: Subprocess | null = null;
  private _state: ServiceState = "stopped";
  private _port: number;
  private output: string[] = [];
  private errors: string[] = [];
  private _lastError?: string;
  private _startedAt?: number;
  private _restartCount = 0;
  private _buildErrors: BuildError[] = [];

  constructor(config: WranglerManagerConfig) {
    this.config = {
      maxRetries: 3,
      portRetryRange: 100,
      ...config,
    };
    this._port = config.port;
  }

  get status(): ServiceStatus {
    return {
      state: this._state,
      up: this._state === "running",
      port: this._port,
      pid: this.process?.pid,
      error: this._state === "failed" ? this._lastError : undefined,
      lastError: this._lastError,
      startedAt: this._startedAt,
      restartCount: this._restartCount,
      buildErrors: this._buildErrors.length > 0 ? this._buildErrors : undefined,
    };
  }

  get buildErrors(): BuildError[] {
    return this._buildErrors;
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
   * Detect if an error is a port conflict
   */
  private isPortConflictError(errorText: string): boolean {
    return (
      errorText.includes("Address already in use") ||
      errorText.includes("EADDRINUSE") ||
      errorText.includes("port is already in use")
    );
  }

  /**
   * Start the wrangler dev server with smart retry logic
   */
  async start(): Promise<void> {
    if (this.process && this._state === "running") {
      console.log("Wrangler already running");
      return;
    }

    const maxRetries = this.config.maxRetries!;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        await this.startOnce();
        return; // Success!
      } catch (error) {
        lastError = error as Error;
        const errorMessage = lastError.message || String(error);

        // Check if it's a port conflict
        if (this.isPortConflictError(errorMessage) || this.errors.some(e => this.isPortConflictError(e))) {
          console.log(`Port ${this._port} is in use (attempt ${attempt + 1}/${maxRetries + 1})`);

          // First try: kill the process on that port
          if (attempt === 0) {
            console.log(`Attempting to kill process on port ${this._port}...`);
            const killed = await killProcessOnPort(this._port);
            if (killed) {
              console.log("Killed stale process, retrying...");
              continue;
            }
          }

          // Subsequent tries: find a new port
          try {
            const newPort = await findFreePort(this._port + 1, this.config.portRetryRange!);
            console.log(`Switching to port ${newPort}`);
            this._port = newPort;
            continue;
          } catch (portError) {
            console.error("Failed to find free port:", portError);
          }
        }

        // Non-port error or exhausted retries
        if (attempt < maxRetries) {
          console.log(`Wrangler start failed (attempt ${attempt + 1}/${maxRetries + 1}): ${errorMessage}`);
          await Bun.sleep(1000 * (attempt + 1)); // Exponential backoff
        }
      }
    }

    // All retries exhausted
    this._state = "failed";
    this._lastError = lastError?.message || "Unknown error";
    throw lastError || new Error("Failed to start wrangler after retries");
  }

  /**
   * Run build if hands.json exists, otherwise check for wrangler.toml directly
   */
  private async ensureBuild(): Promise<string> {
    const handsJsonPath = join(this.config.workbookDir, "hands.json");
    const handsDir = join(this.config.workbookDir, ".hands");

    // Check if this is a hands.json-based workbook
    if (existsSync(handsJsonPath)) {
      console.log("Building workbook from hands.json...");

      const result = await build(this.config.workbookDir, { dev: true });

      if (!result.success) {
        throw new Error(`Build failed: ${result.errors.join(", ")}`);
      }

      console.log(`Build complete: ${result.files.length} files in ${result.outputDir}`);
      return handsDir;
    }

    // Legacy: check for wrangler.toml in root
    const rootWrangler = join(this.config.workbookDir, "wrangler.toml");
    if (existsSync(rootWrangler)) {
      console.log("Using legacy wrangler.toml from workbook root");
      return this.config.workbookDir;
    }

    throw new Error("No hands.json or wrangler.toml found in workbook");
  }

  /**
   * Single attempt to start wrangler
   */
  private async startOnce(): Promise<void> {
    this._state = "starting";
    this.output = [];
    this.errors = [];

    // Run build (or use legacy wrangler.toml)
    const wranglerDir = await this.ensureBuild();

    // Validate wrangler.toml
    const configErrors = await validateWranglerConfig(wranglerDir);
    if (configErrors.length > 0) {
      this.errors = configErrors;
      this._state = "failed";
      this._lastError = `Invalid wrangler.toml: ${configErrors.join(", ")}`;
      throw new Error(this._lastError);
    }

    await this.ensureDependencies();

    console.log(`Starting wrangler dev on port ${this._port}...`);

    const wranglerBin = getWranglerBinPath();
    console.log(`Using wrangler at: ${wranglerBin}`);

    // Run wrangler from the directory containing wrangler.toml
    this.process = spawn(
      [wranglerBin, "dev", "--local", "--port", String(this._port)],
      {
        cwd: wranglerDir,
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

    this._state = "running";
    this._startedAt = Date.now();
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

            // Capture meaningful errors
            if (this.isPortConflictError(line) || line.includes("ERROR")) {
              this._lastError = line;
            }
          } else {
            this.output.push(line);
            console.log(`[wrangler] ${line}`);
          }
        }
      }
    } catch {
      // Stream closed
    }
  }

  private async waitForReady(maxAttempts = 60): Promise<void> {
    for (let i = 0; i < maxAttempts; i++) {
      // Check stdout for ready signal
      const hasReadySignal = this.output.some(
        line => line.includes("Ready on") || line.includes("Listening on")
      );

      if (hasReadySignal) {
        console.log(`Wrangler ready on port ${this._port}`);
        this._buildErrors = []; // Clear any previous build errors
        return;
      }

      // Check if process died
      if (this.process && this.process.exitCode !== null) {
        const exitCode = this.process.exitCode;
        this.process = null;

        // Parse build errors from stderr
        this._buildErrors = parseBuildErrors(this.errors);

        const errorSummary = this._buildErrors.length > 0
          ? `${this._buildErrors.length} build error(s): ${this._buildErrors.slice(0, 3).map(e => e.message).join("; ")}`
          : this._lastError || this.errors.slice(-3).join("; ");

        throw new Error(`Wrangler exited with code ${exitCode}: ${errorSummary}`);
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
      this._state = "stopped";
      return;
    }

    console.log("Stopping wrangler...");
    this._state = "stopped";

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
    this._state = "restarting";
    this._restartCount++;
    await this.stop();
    await this.start();
  }

  /**
   * Change workbook directory and restart
   */
  async switchWorkbook(newWorkbookDir: string): Promise<void> {
    console.log(`Switching wrangler to workbook: ${newWorkbookDir}`);
    await this.stop();
    this.config.workbookDir = newWorkbookDir;
    // Reset port to original on workbook switch
    this._port = this.config.port;
    this._restartCount = 0;
    await this.start();
  }
}
