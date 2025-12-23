/**
 * Action Routes (Dev Mode)
 *
 * HTTP endpoints for action execution during development.
 * Actions are loaded via dynamic import and executed with direct DB access.
 */

import { route } from "rwsdk/router";
import type { ActionDefinition, ActionRun, ActionTriggerType } from "../types/action";
import { buildActionContext, createRunMeta } from "./context";
import { getDb, kyselySql } from "../db/dev";

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
  const db = getDb();
  const result = await kyselySql<{ name: string }>`
    SELECT name FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE '__%'
    ORDER BY name
  `.execute(db);
  return result.rows;
}

export const actionRoutes = [
  /**
   * Execute an action by path
   * POST /actions/run
   * Body: { actionPath: string, trigger: string, input?: unknown, secrets?: Record<string, string> }
   */
  route("/actions/run", {
    post: async ({ request }) => {
      const runId = generateRunId();
      const startTime = Date.now();

      try {
        const body = (await request.json()) as {
          actionPath: string;
          trigger?: ActionTriggerType;
          input?: unknown;
          secrets?: Record<string, string>;
        };

        const { actionPath, trigger = "manual", input, secrets = {} } = body;

        if (!actionPath) {
          return new Response(
            JSON.stringify({
              id: runId,
              actionId: "unknown",
              trigger,
              status: "failed",
              input,
              error: "actionPath is required",
              startedAt: new Date().toISOString(),
              finishedAt: new Date().toISOString(),
              durationMs: 0,
            } satisfies ActionRun),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        // Dynamic import the action module
        // In dev mode, Vite handles this
        let actionModule: { default: ActionDefinition };
        try {
          // The path should be relative to the workbook, e.g., "/actions/sync-users.ts"
          // Vite will resolve this via the alias configured in vite.config
          actionModule = await import(/* @vite-ignore */ actionPath);
        } catch (err) {
          const errorMessage = err instanceof Error ? err.message : String(err);
          return new Response(
            JSON.stringify({
              id: runId,
              actionId: actionPath,
              trigger,
              status: "failed",
              input,
              error: `Failed to load action: ${errorMessage}`,
              startedAt: new Date(startTime).toISOString(),
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - startTime,
            } satisfies ActionRun),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        const action = actionModule.default;
        if (!action || typeof action.run !== "function") {
          return new Response(
            JSON.stringify({
              id: runId,
              actionId: actionPath,
              trigger,
              status: "failed",
              input,
              error: "Action must export a default defineAction() result",
              startedAt: new Date(startTime).toISOString(),
              finishedAt: new Date().toISOString(),
              durationMs: Date.now() - startTime,
            } satisfies ActionRun),
            { status: 400, headers: { "Content-Type": "application/json" } }
          );
        }

        // Validate input if schema provided
        let validatedInput = input;
        if (action.input) {
          try {
            validatedInput = action.input.parse(input);
          } catch (err) {
            const errorMessage = err instanceof Error ? err.message : String(err);
            return new Response(
              JSON.stringify({
                id: runId,
                actionId: action.name,
                trigger,
                status: "failed",
                input,
                error: `Input validation failed: ${errorMessage}`,
                startedAt: new Date(startTime).toISOString(),
                finishedAt: new Date().toISOString(),
                durationMs: Date.now() - startTime,
              } satisfies ActionRun),
              { status: 400, headers: { "Content-Type": "application/json" } }
            );
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
        });

        // Execute the action
        ctx.log.info(`Starting action: ${action.name}`);
        const output = await action.run(validatedInput, ctx);
        const endTime = Date.now();

        const completedRun: ActionRun = {
          id: runId,
          actionId: action.name,
          trigger,
          status: "success",
          input: validatedInput,
          output,
          startedAt: new Date(startTime).toISOString(),
          finishedAt: new Date(endTime).toISOString(),
          durationMs: endTime - startTime,
        };

        ctx.log.info(`Action completed successfully`, { durationMs: completedRun.durationMs });

        return new Response(JSON.stringify(completedRun), {
          headers: { "Content-Type": "application/json" },
        });
      } catch (err) {
        const endTime = Date.now();
        const errorMessage = err instanceof Error ? err.message : String(err);
        const errorStack = err instanceof Error ? err.stack : undefined;

        const failedRun: ActionRun = {
          id: runId,
          actionId: "unknown",
          trigger: "manual",
          status: "failed",
          input: undefined,
          error: errorStack || errorMessage,
          startedAt: new Date(startTime).toISOString(),
          finishedAt: new Date(endTime).toISOString(),
          durationMs: endTime - startTime,
        };

        console.error(`[action:${runId}] Action failed:`, errorMessage);

        return new Response(JSON.stringify(failedRun), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    },
  }),
];
