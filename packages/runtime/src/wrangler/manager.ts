/**
 * Wrangler dev server management
 *
 * @deprecated Use MiniflareServer instead for better control and consistency.
 * This file is kept for backwards compatibility but will be removed in a future version.
 */

import type { ServiceStatus, ServiceState, BuildError } from "../types";

interface WranglerManagerConfig {
  workbookDir: string;
  port: number;
  databaseUrl?: string;
  autoBuild?: boolean;
}

/**
 * @deprecated Use MiniflareServer instead
 */
export class WranglerManager {
  private config: WranglerManagerConfig;
  private _state: ServiceState = "stopped";
  private _port: number;
  private _lastError?: string;
  private _startedAt?: number;
  private _restartCount = 0;
  private _buildErrors: BuildError[] = [];

  constructor(config: WranglerManagerConfig) {
    this.config = config;
    this._port = config.port;
    console.warn(
      "[DEPRECATED] WranglerManager is deprecated. Use MiniflareServer instead.\n" +
      "Import { MiniflareServer as WorkerManager } from '@hands/runtime/worker'"
    );
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

  async start(): Promise<void> {
    this._state = "failed";
    this._lastError = "WranglerManager is deprecated. Use MiniflareServer instead.";
    throw new Error(this._lastError);
  }

  async stop(): Promise<void> {
    this._state = "stopped";
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async switchWorkbook(_newWorkbookDir: string): Promise<void> {
    throw new Error("WranglerManager is deprecated. Use MiniflareServer instead.");
  }

  async fetch(_url: string, _init?: Record<string, unknown>): Promise<Response> {
    throw new Error("WranglerManager is deprecated. Use MiniflareServer instead.");
  }

  get address(): string | undefined {
    return undefined;
  }
}
