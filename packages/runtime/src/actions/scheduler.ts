/**
 * Action Scheduler
 *
 * Handles cron-based scheduling for actions.
 * Uses a simple interval-based approach that checks every minute.
 */

import type { PGlite } from "@electric-sql/pglite";
import type { DiscoveredAction } from "@hands/stdlib";
import type { DiscoveredSource } from "../sources/types.js";
import { discoverActions } from "./discovery.js";
import { executeAction } from "./executor.js";

/**
 * Parse a cron expression into its parts
 * Format: minute hour day-of-month month day-of-week
 * Supports: asterisk, numbers, ranges (1-5), steps (star/5), lists (1,2,3)
 */
interface CronParts {
  minute: number[];
  hour: number[];
  dayOfMonth: number[];
  month: number[];
  dayOfWeek: number[];
}

function expandCronPart(
  part: string,
  min: number,
  max: number,
): number[] {
  const values: number[] = [];

  // Handle wildcard
  if (part === "*") {
    for (let i = min; i <= max; i++) values.push(i);
    return values;
  }

  // Handle list (1,2,3)
  const listParts = part.split(",");
  for (const listPart of listParts) {
    // Handle range with optional step (1-5 or 1-5/2)
    if (listPart.includes("-") || listPart.includes("/")) {
      let range: string;
      let step = 1;

      if (listPart.includes("/")) {
        const [rangePart, stepPart] = listPart.split("/");
        range = rangePart === "*" ? `${min}-${max}` : rangePart;
        step = parseInt(stepPart, 10);
      } else {
        range = listPart;
      }

      if (range.includes("-")) {
        const [start, end] = range.split("-").map((n) => parseInt(n, 10));
        for (let i = start; i <= end; i += step) {
          if (i >= min && i <= max) values.push(i);
        }
      } else {
        // Just a step like */5
        for (let i = min; i <= max; i += step) {
          values.push(i);
        }
      }
    } else {
      // Single number
      const num = parseInt(listPart, 10);
      if (num >= min && num <= max) values.push(num);
    }
  }

  return [...new Set(values)].sort((a, b) => a - b);
}

function parseCron(expression: string): CronParts | null {
  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    console.warn(`[scheduler] Invalid cron expression: ${expression}`);
    return null;
  }

  return {
    minute: expandCronPart(parts[0], 0, 59),
    hour: expandCronPart(parts[1], 0, 23),
    dayOfMonth: expandCronPart(parts[2], 1, 31),
    month: expandCronPart(parts[3], 1, 12),
    dayOfWeek: expandCronPart(parts[4], 0, 6), // 0 = Sunday
  };
}

/**
 * Check if current time matches cron expression
 */
function matchesCron(cron: CronParts, date: Date): boolean {
  const minute = date.getMinutes();
  const hour = date.getHours();
  const dayOfMonth = date.getDate();
  const month = date.getMonth() + 1; // JS months are 0-indexed
  const dayOfWeek = date.getDay(); // 0 = Sunday

  return (
    cron.minute.includes(minute) &&
    cron.hour.includes(hour) &&
    cron.dayOfMonth.includes(dayOfMonth) &&
    cron.month.includes(month) &&
    cron.dayOfWeek.includes(dayOfWeek)
  );
}

/**
 * Calculate the next run time for a cron expression
 */
export function getNextRunTime(
  expression: string,
  from: Date = new Date(),
): Date | null {
  const cron = parseCron(expression);
  if (!cron) return null;

  // Start from the next minute
  const next = new Date(from);
  next.setSeconds(0);
  next.setMilliseconds(0);
  next.setMinutes(next.getMinutes() + 1);

  // Check up to 1 year ahead
  const maxDate = new Date(from);
  maxDate.setFullYear(maxDate.getFullYear() + 1);

  while (next < maxDate) {
    if (matchesCron(cron, next)) {
      return next;
    }
    next.setMinutes(next.getMinutes() + 1);
  }

  return null;
}

/**
 * Scheduler state
 */
interface SchedulerState {
  running: boolean;
  intervalId: ReturnType<typeof setInterval> | null;
  lastCheck: Date | null;
}

const state: SchedulerState = {
  running: false,
  intervalId: null,
  lastCheck: null,
};

export interface SchedulerConfig {
  workbookDir: string;
  getDb: () => PGlite | null;
  getSources: () => DiscoveredSource[];
  checkIntervalMs?: number; // Default: 60000 (1 minute)
}

/**
 * Start the scheduler
 */
export function startScheduler(config: SchedulerConfig): void {
  if (state.running) {
    console.warn("[scheduler] Scheduler already running");
    return;
  }

  const { workbookDir, getDb, getSources, checkIntervalMs = 60000 } = config;

  state.running = true;
  state.lastCheck = new Date();

  console.log("[scheduler] Starting action scheduler");

  // Check immediately, then on interval
  checkScheduledActions(workbookDir, getDb, getSources);

  state.intervalId = setInterval(() => {
    checkScheduledActions(workbookDir, getDb, getSources);
  }, checkIntervalMs);
}

/**
 * Stop the scheduler
 */
export function stopScheduler(): void {
  if (!state.running) return;

  if (state.intervalId) {
    clearInterval(state.intervalId);
    state.intervalId = null;
  }

  state.running = false;
  console.log("[scheduler] Scheduler stopped");
}

/**
 * Check for scheduled actions that need to run
 */
async function checkScheduledActions(
  workbookDir: string,
  getDb: () => PGlite | null,
  getSources: () => DiscoveredSource[],
): Promise<void> {
  const now = new Date();
  state.lastCheck = now;

  const db = getDb();
  if (!db) {
    return; // DB not ready yet
  }

  try {
    const actions = await discoverActions(workbookDir);
    const scheduledActions = actions.filter((a) => a.definition.schedule);

    for (const action of scheduledActions) {
      const cron = parseCron(action.definition.schedule!);
      if (!cron) continue;

      // Check if this minute matches the schedule
      // We check at the start of each minute
      const checkTime = new Date(now);
      checkTime.setSeconds(0);
      checkTime.setMilliseconds(0);

      if (matchesCron(cron, checkTime)) {
        console.log(`[scheduler] Running scheduled action: ${action.id}`);

        // Run async - don't await to avoid blocking other scheduled actions
        runScheduledAction(action, db, getSources(), workbookDir).catch(
          (err) => {
            console.error(
              `[scheduler] Failed to run action ${action.id}:`,
              err,
            );
          },
        );
      }
    }
  } catch (err) {
    console.error("[scheduler] Error checking scheduled actions:", err);
  }
}

/**
 * Run a scheduled action
 */
async function runScheduledAction(
  action: DiscoveredAction,
  db: PGlite,
  sources: DiscoveredSource[],
  workbookDir: string,
): Promise<void> {
  try {
    await executeAction({
      action,
      trigger: "cron",
      input: undefined,
      db,
      sources,
      workbookDir,
    });
  } catch (err) {
    console.error(`[scheduler] Action ${action.id} failed:`, err);
  }
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): {
  running: boolean;
  lastCheck: Date | null;
} {
  return {
    running: state.running,
    lastCheck: state.lastCheck,
  };
}
