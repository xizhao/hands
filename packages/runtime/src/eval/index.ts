/**
 * Eval loop orchestrator
 *
 * Runs all code quality checks and returns structured results.
 * Uses @hands/stdlib for the core check implementations.
 */

import type { EvalResult, ServiceStatus } from "../types";
import { parseWranglerConfig } from "../wrangler/parser";
import {
  checkTypescript,
  formatCode,
  checkFormat,
  findUnused,
} from "@hands/stdlib";

export interface EvalOptions {
  workbookDir: string;
  services: {
    postgres: ServiceStatus;
    worker: ServiceStatus;
  };
  autoFormat?: boolean;
}

/**
 * Run the full eval loop
 */
export async function runEval(options: EvalOptions): Promise<EvalResult> {
  const start = Date.now();
  const { workbookDir, services, autoFormat = true } = options;

  // Run checks in parallel where possible
  const [wrangler, typescript, format, unused] = await Promise.all([
    parseWranglerConfig(workbookDir),
    checkTypescript(workbookDir),
    autoFormat ? formatCode(workbookDir) : { fixed: [], errors: [] },
    findUnused(workbookDir),
  ]);

  const duration = Date.now() - start;

  return {
    timestamp: Date.now(),
    duration,
    wrangler,
    typescript,
    format,
    unused,
    services,
  };
}

// Re-export from stdlib for backwards compatibility
export { checkTypescript, formatCode, checkFormat, findUnused } from "@hands/stdlib";
