/**
 * Core types for the Hands runtime
 */

export interface Diagnostic {
  file: string;
  line: number;
  column: number;
  message: string;
  code?: string;
  severity: "error" | "warning";
}

export interface WranglerConfig {
  name: string;
  routes: { method: string; path: string }[];
  crons: { schedule: string; handler?: string }[];
  vars: Record<string, string>;
}

export type ServiceState = "stopped" | "starting" | "running" | "failed" | "restarting";

export interface BuildError {
  type: "resolve" | "syntax" | "type" | "other";
  module?: string;       // e.g., "d3-array"
  file?: string;         // e.g., "node_modules/d3-scale/src/band.js"
  line?: number;
  column?: number;
  message: string;       // Full error message
  suggestion?: string;   // e.g., "mark as external"
}

export interface ServiceStatus {
  state: ServiceState;
  up: boolean; // Convenience: state === "running"
  port: number;
  pid?: number;
  error?: string;
  lastError?: string;
  startedAt?: number;
  restartCount: number;
  buildErrors?: BuildError[];  // Parsed build errors for wrangler
}

export interface BlockRefError {
  page: string;
  src: string;
  available: string[];
}

export interface EvalResult {
  timestamp: number;
  duration: number;

  // Parsed from wrangler.toml
  wrangler: WranglerConfig | null;

  // Code quality
  typescript: {
    errors: Diagnostic[];
    warnings: Diagnostic[];
  };
  format: {
    fixed: string[];
    errors: string[];
  };
  unused: {
    exports: string[];
    files: string[];
  };
  blockRefs: {
    errors: BlockRefError[];
    availableBlocks: string[];
  };

  // Environment status
  services: {
    postgres: ServiceStatus;
    worker: ServiceStatus;
  };
}

export interface RuntimeStatus {
  workbookId: string;
  workbookDir: string;
  runtimePort: number;
  startedAt: number;
  services: {
    postgres: ServiceStatus;
    worker: ServiceStatus;
  };
}

export interface RuntimeConfig {
  workbookId: string;
  workbookDir: string;
  postgresDataDir: string;
  port?: number; // If not provided, find free port
}

export interface QueryResult {
  rows: Record<string, unknown>[];
  rowCount: number;
  command: string;
}
