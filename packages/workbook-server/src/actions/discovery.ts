/**
 * Action Discovery
 *
 * Discovers actions in a workbook directory.
 *
 * Directory structure:
 * - actions/<name>.ts (single file actions)
 * - actions/<name>/action.ts (folder-based actions)
 */

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join } from "node:path";
import type { ActionDefinition, DiscoveredAction } from "@hands/core/primitives";

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
 * Discover all actions in a workbook
 */
export async function discoverActions(workbookDir: string): Promise<DiscoveredAction[]> {
  const actionsDir = join(workbookDir, "actions");

  if (!existsSync(actionsDir)) {
    return [];
  }

  const actions: DiscoveredAction[] = [];
  const entries = readdirSync(actionsDir);
  const secretsMap = readEnvFile(workbookDir);
  const secrets = Object.fromEntries(secretsMap);

  for (const entry of entries) {
    const entryPath = join(actionsDir, entry);

    // Skip hidden files/folders
    if (entry.startsWith(".") || entry.startsWith("_")) {
      continue;
    }

    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      // Folder-based action: actions/<name>/action.ts
      const action = await discoverAction(join(entryPath, "action.ts"), entry, secrets);
      if (action) {
        actions.push(action);
      }
    } else if (entry.endsWith(".ts") && !entry.endsWith(".d.ts")) {
      // Single file action: actions/<name>.ts
      const actionId = basename(entry, ".ts");
      const action = await discoverAction(entryPath, actionId, secrets);
      if (action) {
        actions.push(action);
      }
    }
  }

  return actions;
}

/**
 * Discover a single action
 */
async function discoverAction(
  actionPath: string,
  actionId: string,
  secrets: Record<string, string>,
): Promise<DiscoveredAction | null> {
  if (!existsSync(actionPath)) {
    return null;
  }

  try {
    const mod = await import(actionPath);
    const definition = mod.default as ActionDefinition | undefined;

    if (!definition?.name || !definition?.run) {
      console.warn(`[actions] Invalid action ${actionId}: missing name or run function`);
      return null;
    }

    // Check for missing secrets
    const missingSecrets = definition.secrets?.filter((secret) => !secrets[secret]);

    // Calculate next run if scheduled
    const nextRun = definition.schedule ? calculateNextRun(definition.schedule) : undefined;

    return {
      id: actionId,
      path: actionPath,
      definition,
      nextRun,
      missingSecrets: missingSecrets?.length ? missingSecrets : undefined,
    };
  } catch (err) {
    console.error(`[actions] Failed to load action ${actionId}:`, err);
    return null;
  }
}

/**
 * Calculate the next run time from a cron schedule
 */
function calculateNextRun(schedule: string): string | undefined {
  try {
    // Simple cron parsing - for production use a library like cron-parser
    // For now, return undefined (scheduler will handle this properly)
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Reload a single action (for hot reload)
 */
export async function reloadAction(
  workbookDir: string,
  actionId: string,
): Promise<DiscoveredAction | null> {
  const secretsMap = readEnvFile(workbookDir);
  const secrets = Object.fromEntries(secretsMap);
  const actionsDir = join(workbookDir, "actions");

  // Try single file first
  const singlePath = join(actionsDir, `${actionId}.ts`);
  if (existsSync(singlePath)) {
    // Clear module cache for hot reload
    delete require.cache[singlePath];
    return discoverAction(singlePath, actionId, secrets);
  }

  // Try folder-based
  const folderPath = join(actionsDir, actionId, "action.ts");
  if (existsSync(folderPath)) {
    delete require.cache[folderPath];
    return discoverAction(folderPath, actionId, secrets);
  }

  return null;
}
