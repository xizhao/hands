/**
 * Runtime state management
 *
 * Extracted from server.ts to enable proper DI and testing
 */

import type { EvalResult } from "./types";
import type { RuntimeLock } from "./lockfile";
import type { DatabaseChange, SyncProgress } from "./db";
import type { PostgresManager, PostgresPool, PostgresListener, SyncManager } from "./db";
import type { WorkerManager } from "./worker";

// Forward declaration for WorkbookManifest (defined in routes/workbook.ts)
export interface WorkbookManifest {
  workbookId: string;
  workbookDir: string;
  pages: Array<{ id: string; route: string; title: string; path: string }>;
  sources: Array<{ name: string; enabled: boolean; schedule?: string }>;
  tables: string[];
  isEmpty: boolean;
}

export interface RuntimeState {
  workbookId: string;
  workbookDir: string;
  postgres: PostgresManager;
  pool: PostgresPool;
  listener: PostgresListener;
  worker: WorkerManager;
  sync: SyncManager;
  startedAt: number;
  evalListeners: Set<(result: EvalResult) => void>;
  changeListeners: Set<(change: DatabaseChange) => void>;
  syncProgressListeners: Set<(progress: SyncProgress) => void>;
  manifestListeners: Set<(manifest: WorkbookManifest) => void>;
  lock: RuntimeLock;
}

// Global state - will be replaced with proper DI in future
let globalState: RuntimeState | null = null;

export function getState(): RuntimeState | null {
  return globalState;
}

export function setState(state: RuntimeState | null): void {
  globalState = state;
}
