/**
 * Action Routes
 *
 * HTTP endpoints for action execution in CF Workers.
 * Actions are statically bundled via vite-plugin-workbook.
 * Uses same @hands/db as blocks (Durable Objects SQLite).
 */

import { route } from "rwsdk/router";
import type { ActionDefinition, ActionRun, ActionTriggerType } from "../types/action";
import { buildActionContext, createRunMeta } from "./context";
import { getUserTables } from "../db/dev";
import { actions, listActions } from "@hands/actions";

/** Cloud API URL from environment */
const cloudUrl = process.env.HANDS_CLOUD_URL ?? "https://api.hands.app";

/**
 * Generate a unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}

/**
 * Get all tables in the database (for building context)
 */
async function getTables(): Promise<Array<{ name: string }>> {
  const userTables = await getUserTables();
  return userTables.map((t) => ({ name: t.name }));
}

/**
 * Execute an action by ID
 */
async function executeAction(
  actionId: string,
  action: ActionDefinition,
  trigger: ActionTriggerType,
  input: unknown,
  secrets: Record<string, string>,
  authToken?: string
): Promise<ActionRun> {
  const runId = generateRunId();
  const startTime = Date.now();

  try {
    // Validate input if schema provided
    let validatedInput = input;
    if (action.input) {
      try {
        validatedInput = action.input.parse(input);
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        return {
          id: runId,
          actionId,
          trigger,
          status: "failed",
          input,
          error: `Input validation failed: ${errorMessage}`,
          startedAt: new Date(startTime).toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: Date.now() - startTime,
        };
      }
    }

    // Get all tables for building context
    const tables = await getTables();

    // Build context with direct DB access
    const runMeta = createRunMeta(runId, trigger, validatedInput);
    const ctx = buildActionContext({
      tables,
      secrets,
      runMeta,
      cloud: authToken ? { cloudUrl, authToken } : undefined,
    });

    // Inject secrets into process.env for action code that uses process.env directly
    const originalEnv: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(secrets)) {
      originalEnv[key] = process.env[key];
      process.env[key] = value;
    }

    let output: unknown;
    try {
      // Execute the action
      ctx.log.info(`Starting action: ${action.name}`);
      output = await action.run(validatedInput, ctx);
    } finally {
      // Restore original process.env values
      for (const key of Object.keys(secrets)) {
        if (originalEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = originalEnv[key];
        }
      }
    }
    const endTime = Date.now();

    ctx.log.info(`Action completed successfully`, { durationMs: endTime - startTime });

    return {
      id: runId,
      actionId,
      trigger,
      status: "success",
      input: validatedInput,
      output,
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date(endTime).toISOString(),
      durationMs: endTime - startTime,
    };
  } catch (err) {
    const endTime = Date.now();
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    console.error(`[action:${runId}] Action failed:`, errorMessage);

    return {
      id: runId,
      actionId,
      trigger,
      status: "failed",
      input,
      error: errorStack || errorMessage,
      startedAt: new Date(startTime).toISOString(),
      finishedAt: new Date(endTime).toISOString(),
      durationMs: endTime - startTime,
    };
  }
}

export const actionRoutes = [
  /**
   * List all actions
   * GET /actions
   */
  route("/actions", {
    get: async () => {
      const actionList = listActions().map(({ id, definition }) => ({
        id,
        name: definition.name,
        description: definition.description,
        triggers: definition.triggers ?? ["manual"],
        schedule: definition.schedule,
        secrets: definition.secrets,
      }));

      return new Response(JSON.stringify(actionList), {
        headers: { "Content-Type": "application/json" },
      });
    },
  }),

  /**
   * Execute an action by ID
   * POST /actions/:actionId/run
   * Body: { trigger?: string, input?: unknown, secrets?: Record<string, string>, authToken?: string }
   */
  route("/actions/:actionId/run", {
    post: async ({ request, params }) => {
      const actionId = params.actionId;
      const action = actions[actionId];

      if (!action) {
        const failedRun: ActionRun = {
          id: generateRunId(),
          actionId,
          trigger: "manual",
          status: "failed",
          input: undefined,
          error: `Action not found: ${actionId}`,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
        };
        return new Response(JSON.stringify(failedRun), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const body = (await request.json()) as {
        trigger?: ActionTriggerType;
        input?: unknown;
        secrets?: Record<string, string>;
        authToken?: string;
      };

      const { trigger = "manual", input, secrets = {}, authToken } = body;

      const result = await executeAction(actionId, action, trigger, input, secrets, authToken);
      const status = result.status === "success" ? 200 : 500;

      return new Response(JSON.stringify(result), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  }),

  /**
   * Legacy endpoint for backwards compatibility
   * POST /actions/run
   * Body: { actionId: string, trigger?: string, input?: unknown, secrets?: Record<string, string> }
   */
  route("/actions/run", {
    post: async ({ request }) => {
      const body = (await request.json()) as {
        actionId?: string;
        actionPath?: string; // Legacy field
        trigger?: ActionTriggerType;
        input?: unknown;
        secrets?: Record<string, string>;
        authToken?: string;
      };

      // Support both actionId and legacy actionPath
      let actionId = body.actionId;
      if (!actionId && body.actionPath) {
        // Extract action ID from path like "actions/my-action.ts"
        const match = body.actionPath.match(/actions\/(.+)\.ts$/);
        actionId = match?.[1];
      }

      if (!actionId) {
        const failedRun: ActionRun = {
          id: generateRunId(),
          actionId: "unknown",
          trigger: body.trigger ?? "manual",
          status: "failed",
          input: body.input,
          error: "actionId is required",
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
        };
        return new Response(JSON.stringify(failedRun), {
          status: 400,
          headers: { "Content-Type": "application/json" },
        });
      }

      const action = actions[actionId];
      if (!action) {
        const failedRun: ActionRun = {
          id: generateRunId(),
          actionId,
          trigger: body.trigger ?? "manual",
          status: "failed",
          input: body.input,
          error: `Action not found: ${actionId}`,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
        };
        return new Response(JSON.stringify(failedRun), {
          status: 404,
          headers: { "Content-Type": "application/json" },
        });
      }

      const { trigger = "manual", input, secrets = {}, authToken } = body;
      const result = await executeAction(actionId, action, trigger, input, secrets, authToken);
      const status = result.status === "success" ? 200 : 500;

      return new Response(JSON.stringify(result), {
        status,
        headers: { "Content-Type": "application/json" },
      });
    },
  }),
];
