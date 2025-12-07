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

export interface ServiceStatus {
  up: boolean;
  port: number;
  pid?: number;
  error?: string;
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

  // Environment status
  services: {
    postgres: ServiceStatus;
    wrangler: ServiceStatus;
  };
}

export interface RuntimeStatus {
  workbookId: string;
  workbookDir: string;
  runtimePort: number;
  startedAt: number;
  services: {
    postgres: ServiceStatus;
    wrangler: ServiceStatus;
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
