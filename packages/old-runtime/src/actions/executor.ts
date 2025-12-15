/**
 * Action Executor
 *
 * Executes actions with proper context, error handling, and run tracking.
 */

import type { PGlite } from "@electric-sql/pglite";
import type { ActionRun, ActionTriggerType, DiscoveredAction } from "@hands/stdlib";
import { readEnvFile } from "../sources/secrets.js";
import type { DiscoveredSource } from "../sources/types.js";
import { buildActionContext, createRunMeta } from "./context.js";
import { saveActionRun, updateActionRun } from "./history.js";

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}

export interface ExecuteActionOptions {
  action: DiscoveredAction;
  trigger: ActionTriggerType;
  input: unknown;
  db: PGlite;
  sources: DiscoveredSource[];
  workbookDir: string;
}

/**
 * Execute an action
 */
export async function executeAction(options: ExecuteActionOptions): Promise<ActionRun> {
  const { action, trigger, input, db, sources, workbookDir } = options;
  const runId = generateRunId();
  const startTime = Date.now();

  // Load secrets
  const secretsMap = readEnvFile(workbookDir);
  const secrets = Object.fromEntries(secretsMap);

  // Check for missing secrets
  if (action.missingSecrets?.length) {
    const run: ActionRun = {
      id: runId,
      actionId: action.id,
      trigger,
      status: "failed",
      input,
      error: `Missing required secrets: ${action.missingSecrets.join(", ")}`,
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      durationMs: 0,
    };
    await saveActionRun(db, run);
    return run;
  }

  // Validate input if schema provided
  let validatedInput = input;
  if (action.definition.input) {
    try {
      validatedInput = action.definition.input.parse(input);
    } catch (err) {
      const run: ActionRun = {
        id: runId,
        actionId: action.id,
        trigger,
        status: "failed",
        input,
        error: `Input validation failed: ${err instanceof Error ? err.message : String(err)}`,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
      };
      await saveActionRun(db, run);
      return run;
    }
  }

  // Create initial run record
  const run: ActionRun = {
    id: runId,
    actionId: action.id,
    trigger,
    status: "running",
    input: validatedInput,
    startedAt: new Date().toISOString(),
  };
  await saveActionRun(db, run);

  // Build context
  const runMeta = createRunMeta(runId, trigger, validatedInput);
  const ctx = buildActionContext({
    db,
    sources,
    secrets,
    runMeta,
  });

  // Execute the action
  try {
    ctx.log.info(`Starting action: ${action.definition.name}`);

    const output = await action.definition.run(validatedInput, ctx);

    const endTime = Date.now();
    const completedRun: ActionRun = {
      ...run,
      status: "success",
      output,
      finishedAt: new Date().toISOString(),
      durationMs: endTime - startTime,
    };

    await updateActionRun(db, completedRun);
    ctx.log.info(`Action completed successfully`, { durationMs: completedRun.durationMs });

    return completedRun;
  } catch (err) {
    const endTime = Date.now();
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    const failedRun: ActionRun = {
      ...run,
      status: "failed",
      error: errorStack || errorMessage,
      finishedAt: new Date().toISOString(),
      durationMs: endTime - startTime,
    };

    await updateActionRun(db, failedRun);
    ctx.log.error(`Action failed: ${errorMessage}`);

    return failedRun;
  }
}

/**
 * Execute an action by ID (convenience wrapper)
 */
export async function executeActionById(
  actionId: string,
  actions: DiscoveredAction[],
  trigger: ActionTriggerType,
  input: unknown,
  db: PGlite,
  sources: DiscoveredSource[],
  workbookDir: string,
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

  return executeAction({
    action,
    trigger,
    input,
    db,
    sources,
    workbookDir,
  });
}
