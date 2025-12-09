/**
 * Service lifecycle management
 *
 * Handles starting, stopping, and health of postgres/worker services.
 *
 * RESPONSIBILITIES:
 * - Orchestrating service startup order
 * - Running build before starting worker
 * - Managing service health and restarts
 *
 * The services layer owns the build→start flow, not individual managers.
 */

import { getState, setState } from "./state";
import type { RuntimeState } from "./state";
import {
  PostgresManager,
  PostgresPool,
  PostgresListener,
  SyncManager,
} from "./db";
import { WorkerManager } from "./worker";
import { acquireLock, updateLockfile, releaseLock, type RuntimeLock } from "./lockfile";
import { getEventBus } from "./events";
import { build } from "./build";

interface InitConfig {
  workbookId: string;
  workbookDir: string;
  postgresPort: number;
  wranglerPort: number;
  runtimePort: number;
}

/**
 * Initialize the runtime state
 */
export async function initRuntime(config: InitConfig): Promise<void> {
  const { workbookId, workbookDir, postgresPort, wranglerPort, runtimePort } = config;

  // Acquire lock (also cleans up orphans)
  const lock = await acquireLock({
    runtimePort,
    postgresPort,
    wranglerPort,
    workbookId,
    workbookDir,
  });

  const postgres = new PostgresManager({
    dataDir: `${workbookDir}/db`,
    port: postgresPort,
    user: "hands_admin",
    password: "hands_admin",
    database: `hands_${workbookId.replace(/-/g, "_")}`,
    clientUser: "hands",
    clientPassword: "hands",
  });

  const pool = new PostgresPool(postgres.connectionString);
  const listener = new PostgresListener(postgres.connectionString);

  const worker = new WorkerManager({
    workbookDir,
    port: wranglerPort,
    databaseUrl: postgres.connectionString,
  });

  const sync = new SyncManager(pool);

  setState({
    workbookId,
    workbookDir,
    postgres,
    pool,
    listener,
    worker,
    sync,
    startedAt: Date.now(),
    evalListeners: new Set(),
    changeListeners: new Set(),
    syncProgressListeners: new Set(),
    manifestListeners: new Set(),
    lock,
  });

  // Wire up manifest:updated event to push to all manifest listeners
  const bus = getEventBus();
  bus.on("manifest:updated", ({ manifest }) => {
    const state = getState();
    if (!state) return;
    for (const listener of state.manifestListeners) {
      listener(manifest);
    }
  });
}

/**
 * Start postgres and essential services (called before HTTP server)
 */
export async function startPostgres(): Promise<void> {
  const state = getState();
  if (!state) throw new Error("Runtime not initialized");

  const bus = getEventBus();
  bus.emit("service:postgres:starting");

  // Start postgres first and wait for it to be fully ready
  await state.postgres.start();
  state.pool.connect();

  // Verify postgres is accepting connections before proceeding
  let connected = false;
  for (let i = 0; i < 10; i++) {
    try {
      await state.pool.ping();
      connected = true;
      break;
    } catch {
      await new Promise(r => setTimeout(r, 200));
    }
  }
  if (!connected) {
    console.error("[runtime] Warning: Could not verify postgres connection");
  }

  // Update lockfile with postgres PID
  if (state.postgres.status.pid) {
    await updateLockfile({ postgresPid: state.postgres.status.pid });
  }

  // Emit ready event
  bus.emit("service:postgres:ready", {
    port: state.postgres.status.port,
    pid: state.postgres.status.pid,
  });
  bus.emit("db:connected");

  // Now start change listener (after postgres is confirmed ready)
  try {
    await state.listener.start();
    state.listener.subscribe((change) => {
      for (const listener of state.changeListeners) {
        listener(change);
      }
    });
  } catch (err) {
    console.error("[runtime] Failed to start change listener:", err);
  }

  // Initialize sync manager tables and start scheduler
  try {
    await state.sync.init();
    state.sync.onProgress((progress) => {
      for (const listener of state.syncProgressListeners) {
        listener(progress);
      }
    });
    state.sync.startScheduler();
    console.log("[runtime] Sync manager initialized");
  } catch (err) {
    console.error("[runtime] Failed to initialize sync manager:", err);
  }
}

/**
 * Build the workbook (generates .hands/ files)
 *
 * Uses esbuild directly (not Bun.build()) to avoid Bun 1.3.3 segfault.
 *
 * This should be called before starting the worker.
 */
export async function buildWorkbook(): Promise<void> {
  const state = getState();
  if (!state) throw new Error("Runtime not initialized");

  const bus = getEventBus();
  bus.emit("build:started", { workbookDir: state.workbookDir });

  console.log("Building workbook...");

  const result = await build(state.workbookDir, { dev: true });

  if (!result.success) {
    bus.emit("build:failed", { errors: result.errors });
    console.error("Build failed:", result.errors.join(", "));
    throw new Error(`Build failed: ${result.errors.join(", ")}`);
  }

  bus.emit("build:completed", { outputDir: result.outputDir, files: result.files });
  console.log(`Build complete: ${result.files.join(", ")}`);
}

/**
 * Start worker dev server (can be called after HTTP server is up)
 *
 * Automatically runs build before starting.
 */
export async function startWorker(): Promise<void> {
  const state = getState();
  if (!state) throw new Error("Runtime not initialized");

  const bus = getEventBus();
  bus.emit("service:worker:starting");

  try {
    // Build first - services layer owns this responsibility
    await buildWorkbook();

    // Then start worker (autoBuild=false since we just built)
    await state.worker.start();
    await updateLockfile({ wranglerPort: state.worker.status.port });

    bus.emit("service:worker:ready", { port: state.worker.status.port });
  } catch (error) {
    bus.emit("service:worker:error", { error: error instanceof Error ? error : new Error(String(error)) });
    console.error("Worker failed to start:", error);
  }
}

/**
 * Stop all services
 */
export async function stopServices(): Promise<void> {
  const state = getState();
  if (!state) return;

  const bus = getEventBus();
  bus.emit("runtime:shutdown");

  state.sync.stopScheduler();
  await state.listener.stop();
  await state.pool.close();
  await state.worker.stop();
  await state.postgres.stop();

  bus.emit("service:postgres:stopped");
  bus.emit("service:worker:stopped");
  bus.emit("db:disconnected");

  await releaseLock();
}

/**
 * Start all services (backwards compat)
 */
export async function startServices(): Promise<void> {
  await startPostgres();
  await startWorker();
}
