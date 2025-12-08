/**
 * Worker dev server management using wrangler's unstable_dev API
 *
 * Uses wrangler's programmatic API instead of spawning a subprocess,
 * giving us native error handling and better control.
 */

import { unstable_dev, type Unstable_DevWorker } from "wrangler";
import { existsSync, readFileSync } from "fs";
import { join } from "path";
import type { ServiceStatus, ServiceState, BuildError } from "../types";

interface WorkerManagerConfig {
  workbookDir: string;
  port: number;
}

/**
 * Parse build/startup errors into structured format
 */
function parseError(error: unknown): BuildError[] {
  const errorStr = error instanceof Error ? error.message : String(error);
  const errors: BuildError[] = [];

  // Check for esbuild "Could not resolve" errors
  const resolveMatch = errorStr.match(/Could not resolve ["']([^"']+)["']/g);
  if (resolveMatch) {
    for (const match of resolveMatch) {
      const moduleMatch = match.match(/["']([^"']+)["']/);
      if (moduleMatch) {
        errors.push({
          type: "resolve",
          module: moduleMatch[1],
          message: `Could not resolve "${moduleMatch[1]}"`,
          suggestion: `Install the missing module or mark it as external`,
        });
      }
    }
  }

  // Check for syntax errors
  if (errorStr.includes("SyntaxError") || errorStr.includes("Parse error")) {
    const lineMatch = errorStr.match(/:(\d+):(\d+)/);
    errors.push({
      type: "syntax",
      line: lineMatch ? parseInt(lineMatch[1], 10) : undefined,
      column: lineMatch ? parseInt(lineMatch[2], 10) : undefined,
      message: errorStr.split("\n")[0],
    });
  }

  // Check for type errors
  if (errorStr.includes("TypeError") || errorStr.includes("type error")) {
    errors.push({
      type: "type",
      message: errorStr.split("\n")[0],
    });
  }

  // If no specific errors matched, add a generic one
  if (errors.length === 0) {
    errors.push({
      type: "other",
      message: errorStr.slice(0, 500), // Truncate long errors
    });
  }

  return errors;
}

/**
 * Find the entry point for the worker
 */
function findEntryPoint(workbookDir: string): string | null {
  const candidates = [
    "src/index.ts",
    "src/index.js",
    "src/worker.ts",
    "src/worker.js",
    "index.ts",
    "index.js",
  ];

  for (const candidate of candidates) {
    const path = join(workbookDir, candidate);
    if (existsSync(path)) {
      return path;
    }
  }

  // Check wrangler.toml for main entry
  const wranglerPath = join(workbookDir, "wrangler.toml");
  if (existsSync(wranglerPath)) {
    const content = readFileSync(wranglerPath, "utf-8");
    const mainMatch = content.match(/main\s*=\s*["']([^"']+)["']/);
    if (mainMatch) {
      const path = join(workbookDir, mainMatch[1]);
      if (existsSync(path)) {
        return path;
      }
    }
  }

  return null;
}

export class WorkerManager {
  private config: WorkerManagerConfig;
  private worker: Unstable_DevWorker | null = null;
  private _state: ServiceState = "stopped";
  private _port: number;
  private _lastError?: string;
  private _startedAt?: number;
  private _restartCount = 0;
  private _buildErrors: BuildError[] = [];

  constructor(config: WorkerManagerConfig) {
    this.config = config;
    this._port = config.port;
  }

  get status(): ServiceStatus {
    return {
      state: this._state,
      up: this._state === "running",
      port: this._port,
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

  /**
   * Start the worker dev server
   */
  async start(): Promise<void> {
    if (this.worker && this._state === "running") {
      console.log("Worker already running");
      return;
    }

    this._state = "starting";
    this._buildErrors = [];

    try {
      // Find entry point
      const entryPoint = findEntryPoint(this.config.workbookDir);
      if (!entryPoint) {
        throw new Error(
          `No entry point found in ${this.config.workbookDir}. Expected src/index.ts or similar.`
        );
      }

      console.log(`Starting worker from ${entryPoint} on port ${this._port}...`);

      // Check if wrangler.toml exists
      const wranglerConfig = join(this.config.workbookDir, "wrangler.toml");
      const hasWranglerConfig = existsSync(wranglerConfig);

      // Start using unstable_dev
      this.worker = await unstable_dev(entryPoint, {
        port: this._port,
        local: true,
        config: hasWranglerConfig ? wranglerConfig : undefined,
        // Suppress wrangler's own console output since we handle it
        logLevel: "warn",
        experimental: {
          disableExperimentalWarning: true,
        },
      });

      this._port = this.worker.port; // Get actual port (may differ if original was busy)
      this._state = "running";
      this._startedAt = Date.now();
      this._buildErrors = [];

      console.log(`Worker ready on port ${this._port}`);
    } catch (error) {
      this._state = "failed";
      this._lastError = error instanceof Error ? error.message : String(error);
      this._buildErrors = parseError(error);

      console.error("Worker failed to start:", this._lastError);
      throw error;
    }
  }

  /**
   * Stop the worker dev server
   */
  async stop(): Promise<void> {
    if (!this.worker) {
      this._state = "stopped";
      return;
    }

    console.log("Stopping worker...");

    try {
      await this.worker.stop();
    } catch (error) {
      console.error("Error stopping worker:", error);
    }

    this.worker = null;
    this._state = "stopped";
    console.log("Worker stopped");
  }

  /**
   * Restart the worker dev server
   */
  async restart(): Promise<void> {
    this._state = "restarting";
    this._restartCount++;
    await this.stop();
    await this.start();
  }

  /**
   * Switch to a different workbook
   */
  async switchWorkbook(newWorkbookDir: string): Promise<void> {
    console.log(`Switching worker to workbook: ${newWorkbookDir}`);
    await this.stop();
    this.config.workbookDir = newWorkbookDir;
    this._port = this.config.port; // Reset to original port
    this._restartCount = 0;
    this._buildErrors = [];
    await this.start();
  }

  /**
   * Make a request to the running worker
   * Note: Types are cast due to undici/Bun incompatibilities
   */
  async fetch(url: string, init?: Record<string, unknown>): Promise<Response> {
    if (!this.worker || this._state !== "running") {
      throw new Error("Worker is not running");
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (this.worker as any).fetch(url, init) as Response;
  }

  /**
   * Get the worker's address
   */
  get address(): string | undefined {
    return this.worker?.address;
  }
}
