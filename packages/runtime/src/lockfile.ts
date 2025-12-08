/**
 * Process lockfile management for Hands runtime
 *
 * Handles:
 * - Single instance guarantee (only one runtime per machine)
 * - Process ownership tracking (which PIDs belong to Hands)
 * - Orphan cleanup on startup (kill stale processes from crashes)
 */

import { existsSync, mkdirSync, unlinkSync } from "fs";
import { join, dirname } from "path";

export interface RuntimeLock {
  pid: number;
  runtimePort: number;
  postgresPort: number;
  postgresPid?: number;
  wranglerPort: number;
  wranglerPid?: number;
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
    // Sending signal 0 doesn't kill, just checks if process exists
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
 * Returns the lock if running, null if not
 */
export async function checkExistingRuntime(): Promise<RuntimeLock | null> {
  const lock = await readLockfile();
  if (!lock) {
    return null;
  }

  // Check if the parent runtime process is still alive
  if (isProcessRunning(lock.pid)) {
    return lock;
  }

  // Parent is dead - this is an orphaned lockfile
  return null;
}

/**
 * Cleanup orphaned processes from a crashed runtime
 * Call this on startup before starting new services
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

  // Check if parent runtime is still alive
  if (isProcessRunning(lock.pid)) {
    // Runtime is still running - don't touch it
    return { cleaned: false, orphanedLock: null, killedPids: [] };
  }

  // Parent is dead - we have orphans to clean up
  console.log(`Found orphaned runtime lock from PID ${lock.pid}`);
  const killedPids: number[] = [];

  // Kill postgres if it's still running
  if (lock.postgresPid && isProcessRunning(lock.postgresPid)) {
    console.log(`Killing orphaned postgres (PID ${lock.postgresPid})`);
    killProcess(lock.postgresPid, "SIGTERM");
    killedPids.push(lock.postgresPid);
  }

  // Kill wrangler if it's still running
  if (lock.wranglerPid && isProcessRunning(lock.wranglerPid)) {
    console.log(`Killing orphaned wrangler (PID ${lock.wranglerPid})`);
    killProcess(lock.wranglerPid, "SIGTERM");
    killedPids.push(lock.wranglerPid);
  }

  // Also try to kill any processes on the ports (in case PIDs changed)
  await killProcessesOnPorts([lock.postgresPort, lock.wranglerPort]);

  // Wait a bit for processes to die
  if (killedPids.length > 0) {
    await Bun.sleep(1000);

    // Force kill if still alive
    for (const pid of killedPids) {
      if (isProcessRunning(pid)) {
        console.log(`Force killing PID ${pid}`);
        killProcess(pid, "SIGKILL");
      }
    }
    await Bun.sleep(500);
  }

  // Remove the stale lockfile
  removeLockfile();
  console.log("Cleaned up orphaned lockfile");

  return { cleaned: true, orphanedLock: lock, killedPids };
}

/**
 * Kill any processes listening on specific ports
 */
async function killProcessesOnPorts(ports: number[]): Promise<void> {
  for (const port of ports) {
    try {
      const result = Bun.spawnSync(["lsof", "-ti", `:${port}`]);
      const pids = new TextDecoder()
        .decode(result.stdout)
        .trim()
        .split("\n")
        .filter(Boolean)
        .map(p => parseInt(p, 10));

      for (const pid of pids) {
        // Don't kill ourselves
        if (pid === process.pid) continue;

        console.log(`Killing process ${pid} on port ${port}`);
        killProcess(pid, "SIGTERM");
      }
    } catch {
      // lsof not available or failed
    }
  }
}

/**
 * Acquire the runtime lock
 * Fails if another runtime is already running
 */
export async function acquireLock(config: {
  runtimePort: number;
  postgresPort: number;
  wranglerPort: number;
  workbookId: string;
  workbookDir: string;
}): Promise<RuntimeLock> {
  // First, check for and clean up any orphaned processes
  const cleanup = await cleanupOrphanedProcesses();
  if (cleanup.cleaned) {
    console.log(`Cleaned up ${cleanup.killedPids.length} orphaned processes`);
  }

  // Check if another runtime is running
  const existing = await checkExistingRuntime();
  if (existing) {
    throw new Error(
      `Another Hands runtime is already running (PID ${existing.pid} on port ${existing.runtimePort})`
    );
  }

  // Create our lock
  const lock: RuntimeLock = {
    pid: process.pid,
    runtimePort: config.runtimePort,
    postgresPort: config.postgresPort,
    wranglerPort: config.wranglerPort,
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
 * Call this during graceful shutdown
 */
export async function releaseLock(): Promise<void> {
  const lock = await readLockfile();

  // Only remove if we own the lock
  if (lock && lock.pid === process.pid) {
    removeLockfile();
    console.log("Released runtime lock");
  }
}

/**
 * Get the lockfile path (for debugging/testing)
 */
export function getLockfilePath(): string {
  return LOCK_FILE;
}
