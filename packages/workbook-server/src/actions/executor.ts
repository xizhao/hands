/**
 * Action Executor
 *
 * Executes actions with proper context, error handling, run tracking, and chaining.
 */

import type { PGlite } from "@electric-sql/pglite";
import type {
  ActionRun,
  ActionTriggerType,
  ActionResult,
  ActionChain,
  DbSchema,
  DiscoveredAction,
} from "@hands/core/primitives";
import { validateSchema } from "@hands/core/primitives";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildActionContext, createRunMeta } from "./context.js";

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
 * Generate a unique run ID
 */
function generateRunId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `run_${timestamp}_${random}`;
}

/**
 * Get database schema from PGlite for validation
 */
async function getDbSchema(db: PGlite): Promise<DbSchema> {
  // Query columns from information_schema
  const result = await db.query<{
    table_name: string;
    column_name: string;
    data_type: string;
    is_nullable: string;
  }>(`
    SELECT
      c.table_name,
      c.column_name,
      c.data_type,
      c.is_nullable
    FROM information_schema.columns c
    JOIN information_schema.tables t ON c.table_name = t.table_name
    WHERE t.table_schema = 'public'
      AND t.table_type = 'BASE TABLE'
    ORDER BY c.table_name, c.ordinal_position
  `);

  // Get primary keys
  const pkResult = await db.query<{
    table_name: string;
    column_name: string;
  }>(`
    SELECT
      tc.table_name,
      kcu.column_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu
      ON tc.constraint_name = kcu.constraint_name
      AND tc.table_schema = kcu.table_schema
    WHERE tc.constraint_type = 'PRIMARY KEY'
      AND tc.table_schema = 'public'
  `);

  const primaryKeys = new Map<string, Set<string>>();
  for (const row of pkResult.rows) {
    if (!primaryKeys.has(row.table_name)) {
      primaryKeys.set(row.table_name, new Set());
    }
    primaryKeys.get(row.table_name)?.add(row.column_name);
  }

  // Group columns by table
  const tableMap = new Map<
    string,
    Array<{ name: string; type: string; nullable: boolean; isPrimary: boolean }>
  >();

  for (const row of result.rows) {
    if (!tableMap.has(row.table_name)) {
      tableMap.set(row.table_name, []);
    }
    const isPK = primaryKeys.get(row.table_name)?.has(row.column_name) ?? false;
    tableMap.get(row.table_name)?.push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === "YES",
      isPrimary: isPK,
    });
  }

  const tables: DbSchema["tables"] = [];
  for (const [name, columns] of tableMap) {
    tables.push({ name, columns });
  }

  return { tables };
}

export interface ExecuteActionOptions {
  action: DiscoveredAction;
  trigger: ActionTriggerType;
  input: unknown;
  db: PGlite;
  workbookDir: string;
  /** Cloud API configuration (optional) */
  cloudConfig?: {
    baseUrl: string;
    token: string;
  };
  /** All discovered actions (for chaining) */
  allActions?: DiscoveredAction[];
}

/**
 * Sleep helper for chain delays
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Check if a value is an ActionResult (has data property)
 */
function isActionResult(value: unknown): value is ActionResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "data" in value
  );
}

/**
 * Execute an action
 */
export async function executeAction(options: ExecuteActionOptions): Promise<ActionRun> {
  const { action, trigger, input, db, workbookDir, cloudConfig, allActions } = options;
  const runId = generateRunId();
  const startTime = Date.now();

  // Load secrets
  const secretsMap = readEnvFile(workbookDir);
  const secrets = Object.fromEntries(secretsMap);

  // Check for missing secrets
  if (action.missingSecrets?.length) {
    return {
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
  }

  // Validate input if schema provided
  let validatedInput = input;
  if (action.definition.input) {
    try {
      validatedInput = action.definition.input.parse(input);
    } catch (err) {
      return {
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
    }
  }

  // Validate schema requirements if specified
  if (action.definition.schema) {
    try {
      const dbSchema = await getDbSchema(db);
      const schemaResult = validateSchema(action.definition.schema, dbSchema);

      if (!schemaResult.valid) {
        return {
          id: runId,
          actionId: action.id,
          trigger,
          status: "failed",
          input: validatedInput,
          error: `Schema validation failed:\n${schemaResult.errors.join("\n")}`,
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          durationMs: 0,
        };
      }
    } catch (err) {
      return {
        id: runId,
        actionId: action.id,
        trigger,
        status: "failed",
        input: validatedInput,
        error: `Schema introspection failed: ${err instanceof Error ? err.message : String(err)}`,
        startedAt: new Date().toISOString(),
        finishedAt: new Date().toISOString(),
        durationMs: 0,
      };
    }
  }

  const startedAt = new Date().toISOString();

  // Create action runner for ctx.actions.run()
  const actionRunner = allActions
    ? async (actionId: string, actionInput?: unknown): Promise<unknown> => {
        const targetAction = allActions.find((a) => a.id === actionId);
        if (!targetAction) {
          throw new Error(`Action not found: ${actionId}`);
        }
        const result = await executeAction({
          action: targetAction,
          trigger: "manual", // Chained actions are triggered manually
          input: actionInput,
          db,
          workbookDir,
          cloudConfig,
          allActions,
        });
        if (result.status === "failed") {
          throw new Error(result.error || `Action ${actionId} failed`);
        }
        return result.output;
      }
    : undefined;

  // Build context
  const runMeta = createRunMeta(runId, trigger, validatedInput);
  const ctx = buildActionContext({
    db,
    secrets,
    runMeta,
    cloudConfig,
    actionRunner,
  });

  // Execute the action
  try {
    ctx.log.info(`Starting action: ${action.definition.name}`);

    const rawOutput = await action.definition.run(validatedInput, ctx);

    // Handle ActionResult format vs plain return
    let output: unknown;
    let chains: ActionChain[] | undefined;

    if (isActionResult(rawOutput)) {
      output = rawOutput.data;
      chains = rawOutput.chain;
    } else {
      output = rawOutput;
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    ctx.log.info(`Action completed successfully`, { durationMs });

    // Process chain if present and we have actions available
    if (chains?.length && allActions) {
      ctx.log.info(`Processing ${chains.length} chained action(s)`);

      for (const chain of chains) {
        // Check condition (default is "success", which we've already met)
        if (chain.condition === "always" || chain.condition === "success" || !chain.condition) {
          if (chain.delay) {
            ctx.log.info(`Waiting ${chain.delay}ms before running ${chain.action}`);
            await sleep(chain.delay);
          }

          ctx.log.info(`Running chained action: ${chain.action}`);

          try {
            const chainedAction = allActions.find((a) => a.id === chain.action);
            if (!chainedAction) {
              ctx.log.warn(`Chained action not found: ${chain.action}`);
              continue;
            }

            await executeAction({
              action: chainedAction,
              trigger: "manual",
              input: chain.input,
              db,
              workbookDir,
              cloudConfig,
              allActions,
            });
          } catch (chainErr) {
            ctx.log.error(`Chained action ${chain.action} failed: ${chainErr instanceof Error ? chainErr.message : String(chainErr)}`);
            // Continue with other chains even if one fails
          }
        }
      }
    }

    return {
      id: runId,
      actionId: action.id,
      trigger,
      status: "success" as const,
      input: validatedInput,
      output,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs,
    };
  } catch (err) {
    const endTime = Date.now();
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;

    ctx.log.error(`Action failed: ${errorMessage}`);

    return {
      id: runId,
      actionId: action.id,
      trigger,
      status: "failed" as const,
      input: validatedInput,
      error: errorStack || errorMessage,
      startedAt,
      finishedAt: new Date().toISOString(),
      durationMs: endTime - startTime,
    };
  }
}

export interface ExecuteActionByIdOptions {
  actionId: string;
  actions: DiscoveredAction[];
  trigger: ActionTriggerType;
  input: unknown;
  db: PGlite;
  workbookDir: string;
  cloudConfig?: {
    baseUrl: string;
    token: string;
  };
}

/**
 * Execute an action by ID (convenience wrapper)
 */
export async function executeActionById(options: ExecuteActionByIdOptions): Promise<ActionRun> {
  const { actionId, actions, trigger, input, db, workbookDir, cloudConfig } = options;
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
    workbookDir,
    cloudConfig,
    allActions: actions,
  });
}
