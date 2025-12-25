/**
 * Action Executor (Delegates to Runtime)
 *
 * Workbook-server discovers actions and delegates execution to runtime.
 * Runtime has direct DB access for efficient execution.
 */

import type { ActionRun, ActionTriggerType } from "@hands/core/primitives";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { DiscoveredAction } from "../workbook/types.js";

/**
 * Read secrets from .env.local file
 */
function readEnvFile(workbookDir: string): Map<string, string> {
  const envPath = join(workbookDir, ".env.local");

  if (!existsSync(envPath)) {
    return new Map();
  }

  try {
    const content = readFileSync(envPath, "utf-8");
    const env = new Map<string, string>();

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) continue;

      const eqIndex = trimmed.indexOf("=");
      if (eqIndex === -1) continue;

      const key = trimmed.slice(0, eqIndex).trim();
      let value = trimmed.slice(eqIndex + 1).trim();

      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      if (key) {
        env.set(key, value);
      }
    }

    return env;
  } catch {
    return new Map();
  }
}

/**
 * Generate a unique run ID (fallback for error cases)
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}

export interface ExecuteActionHttpOptions {
  action: DiscoveredAction;
  trigger: ActionTriggerType;
  input: unknown;
  runtimeUrl: string;
  workbookDir: string;
}

/**
 * Execute an action by delegating to runtime
 *
 * Workbook-server handles:
 * - Discovery (finding action files)
 * - Loading secrets (filesystem access)
 * - Delegating to runtime
 *
 * Runtime handles:
 * - Loading action module
 * - Building context with direct DB access
 * - Executing the action
 */
export async function executeActionHttp(
  options: ExecuteActionHttpOptions
): Promise<ActionRun> {
  const { action, trigger, input, runtimeUrl, workbookDir } = options;

  // Check for missing secrets before delegating
  if (action.missingSecrets?.length) {
    return {
      id: generateRunId(),
      actionId: action.id,
      trigger,
      status: "failed",
      input,
      error: `Missing required secrets: ${action.missingSecrets.join(", ")}`,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  // Load secrets (workbook-server has filesystem access)
  const secretsMap = readEnvFile(workbookDir);
  const secrets = Object.fromEntries(secretsMap);

  try {
    // Delegate to runtime's /actions/:actionId/run endpoint
    const response = await fetch(`${runtimeUrl}/actions/${action.id}/run`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        trigger,
        input,
        secrets,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      // Try to parse as ActionRun (runtime returns structured errors)
      try {
        return JSON.parse(errorText) as ActionRun;
      } catch {
        return {
          id: generateRunId(),
          actionId: action.id,
          trigger,
          status: "failed",
          input,
          error: `Runtime error: ${errorText}`,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
        };
      }
    }

    const result = (await response.json()) as ActionRun;
    return result;
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    return {
      id: generateRunId(),
      actionId: action.id,
      trigger,
      status: "failed",
      input,
      error: `Failed to execute action via runtime: ${errorMessage}`,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }
}

/**
 * Execute an action by ID (convenience wrapper)
 */
export async function executeActionByIdHttp(
  actionId: string,
  actions: DiscoveredAction[],
  trigger: ActionTriggerType,
  input: unknown,
  runtimeUrl: string,
  workbookDir: string
): Promise<ActionRun> {
  const action = actions.find((a) => a.id === actionId);

  if (!action) {
    return {
      id: generateRunId(),
      actionId,
      trigger,
      status: "failed",
      input,
      error: `Action not found: ${actionId}`,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
    };
  }

  return executeActionHttp({
    action,
    trigger,
    input,
    runtimeUrl,
    workbookDir,
  });
}
