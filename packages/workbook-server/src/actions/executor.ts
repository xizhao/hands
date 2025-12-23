/**
 * Action Executor
 *
 * Executes actions with proper context, error handling, and run tracking.
 */

import type { PGlite } from "@electric-sql/pglite";
import type {
  ActionRun,
  ActionTriggerType,
  DbSchema,
  DiscoveredAction,
} from "@hands/core/primitives";
import { validateSchema } from "@hands/core/primitives";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { buildActionContext, createRunMeta } from "./context.js";
import { saveActionRun, updateActionRun } from "./history.js";

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
}

/**
 * Execute an action
 */
export async function executeAction(options: ExecuteActionOptions): Promise<ActionRun> {
  const { action, trigger, input, db, workbookDir } = options;
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

  // Validate schema requirements if specified
  if (action.definition.schema) {
    try {
      const dbSchema = await getDbSchema(db);
      const schemaResult = validateSchema(action.definition.schema, dbSchema);

      if (!schemaResult.valid) {
        const run: ActionRun = {
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
        await saveActionRun(db, run);
        return run;
      }
    } catch (err) {
      const run: ActionRun = {
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
    workbookDir,
  });
}
