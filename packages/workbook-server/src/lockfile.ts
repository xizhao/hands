/**
 * Process lockfile management for Hands runtime
 *
 * Handles:
 * - Single instance guarantee (only one runtime per workbook)
 * - Process ownership tracking
 * - Orphan cleanup on startup (kill stale processes from crashes)
 */

import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { killProcessOnPort } from "./ports.js";

export interface RuntimeLock {
  pid: number;
  runtimePort: number;
  rscPort: number;
  rscPid?: number;
  workbookId: string;
  workbookDir: string;
  startedAt: number;
}

// Lockfile location - platform specific
function getLockDir(): string {
  const home = process.env.HOME || "~";
  if (process.platform === "darwin") {
    return join(home, "Library", "Application Support", "Hands");
  } else if (process.platform === "win32") {
    return join(process.env.LOCALAPPDATA || join(home, "AppData", "Local"), "Hands");
  } else {
    return join(process.env.XDG_STATE_HOME || join(home, ".local", "state"), "hands");
  }
}

const LOCK_FILE = join(getLockDir(), "runtime.lock");

/**
 * Check if a process is still running
 */
function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Kill a process if it exists
 */
function killProcess(pid: number, signal: NodeJS.Signals = "SIGTERM"): boolean {
  try {
    process.kill(pid, signal);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the current lockfile
 */
export async function readLockfile(): Promise<RuntimeLock | null> {
  if (!existsSync(LOCK_FILE)) {
    return null;
  }

  try {
    const content = await Bun.file(LOCK_FILE).text();
    return JSON.parse(content) as RuntimeLock;
  } catch {
    return null;
  }
}

/**
 * Write the lockfile
 */
export async function writeLockfile(lock: RuntimeLock): Promise<void> {
  const dir = dirname(LOCK_FILE);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  await Bun.write(LOCK_FILE, JSON.stringify(lock, null, 2));
}

/**
 * Update specific fields in the lockfile
 */
export async function updateLockfile(updates: Partial<RuntimeLock>): Promise<void> {
  const current = await readLockfile();
  if (!current) {
    throw new Error("No lockfile to update");
  }
  await writeLockfile({ ...current, ...updates });
}

/**
 * Remove the lockfile
 */
export function removeLockfile(): void {
  try {
    if (existsSync(LOCK_FILE)) {
      unlinkSync(LOCK_FILE);
    }
  } catch {
    // Ignore errors
  }
}

/**
 * Check if another runtime is already running
 */
export async function checkExistingRuntime(): Promise<RuntimeLock | null> {
  const lock = await readLockfile();
  if (!lock) {
    return null;
  }

  if (isProcessRunning(lock.pid)) {
    return lock;
  }

  // Parent is dead - orphaned lockfile
  return null;
}

/**
 * Cleanup orphaned processes from a crashed runtime
 */
export async function cleanupOrphanedProcesses(): Promise<{
  cleaned: boolean;
  orphanedLock: RuntimeLock | null;
  killedPids: number[];
}> {
  const lock = await readLockfile();
  if (!lock) {
    return { cleaned: false, orphanedLock: null, killedPids: [] };
  }

  if (isProcessRunning(lock.pid)) {
    return { cleaned: false, orphanedLock: null, killedPids: [] };
  }

  console.log(`Found orphaned runtime lock from PID ${lock.pid}`);
  const killedPids: number[] = [];

  // Kill RSC runtime if still running
  if (lock.rscPid && isProcessRunning(lock.rscPid)) {
    console.log(`Killing orphaned RSC runtime (PID ${lock.rscPid})`);
    killProcess(lock.rscPid, "SIGTERM");
    killedPids.push(lock.rscPid);
  }

  // Also try to kill processes on the port
  await killProcessOnPort(lock.rscPort);

  if (killedPids.length > 0) {
    await Bun.sleep(1000);

    for (const pid of killedPids) {
      if (isProcessRunning(pid)) {
        console.log(`Force killing PID ${pid}`);
        killProcess(pid, "SIGKILL");
      }
    }
    await Bun.sleep(500);
  }

  removeLockfile();
  console.log("Cleaned up orphaned lockfile");

  return { cleaned: true, orphanedLock: lock, killedPids };
}

// killProcessOnPort is now imported from "./ports.js"

/**
 * Acquire the runtime lock
 */
export async function acquireLock(config: {
  runtimePort: number;
  rscPort: number;
  workbookId: string;
  workbookDir: string;
}): Promise<RuntimeLock> {
  const cleanup = await cleanupOrphanedProcesses();
  if (cleanup.cleaned) {
    console.log(`Cleaned up ${cleanup.killedPids.length} orphaned processes`);
  }

  const existing = await checkExistingRuntime();
  if (existing) {
    throw new Error(
      `Another Hands runtime is already running (PID ${existing.pid} on port ${existing.runtimePort})`,
    );
  }

  const lock: RuntimeLock = {
    pid: process.pid,
    runtimePort: config.runtimePort,
    rscPort: config.rscPort,
    workbookId: config.workbookId,
    workbookDir: config.workbookDir,
    startedAt: Date.now(),
  };

  await writeLockfile(lock);
  console.log(`Acquired runtime lock (PID ${process.pid})`);

  return lock;
}

/**
 * Release the runtime lock
 */
export async function releaseLock(): Promise<void> {
  const lock = await readLockfile();

  if (lock && lock.pid === process.pid) {
    removeLockfile();
    console.log("Released runtime lock");
  }
}

/**
 * Get the lockfile path (for debugging)
 */
export function getLockfilePath(): string {
  return LOCK_FILE;
}
