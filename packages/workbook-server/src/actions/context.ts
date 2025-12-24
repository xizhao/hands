/**
 * Action Context Builder
 *
 * Creates the ActionContext that is passed to action run functions.
 * Provides access to raw SQL, logging, notifications, and cloud services.
 */

import type { PGlite } from "@electric-sql/pglite";
import type {
  ActionContext,
  ActionLogger,
  ActionNotify,
  ActionRunMeta,
  ActionTriggerType,
  ActionCloud,
  ActionRunner,
} from "@hands/core/primitives";
import { createCloudClient } from "../services/cloud.js";

interface BuildContextOptions {
  db: PGlite;
  secrets: Record<string, string>;
  runMeta: ActionRunMeta;
  /** Cloud API configuration (if available) */
  cloudConfig?: {
    baseUrl: string;
    token: string;
  };
  /** Action runner for chaining (injected by executor) */
  actionRunner?: (actionId: string, input?: unknown) => Promise<unknown>;
}

/**
 * Build an ActionContext for executing an action
 */
export function buildActionContext(options: BuildContextOptions): ActionContext {
  const { db, secrets, runMeta, cloudConfig, actionRunner } = options;

  // Build SQL tagged template
  const sql = buildSqlTemplate(db);

  // Build logger
  const log = buildLogger(runMeta.id);

  // Build notify (placeholder for now)
  const notify = buildNotify();

  // Build cloud client if config is available
  const cloud: ActionCloud | undefined = cloudConfig
    ? createCloudClient(cloudConfig)
    : undefined;

  // Build action runner if available
  const actions: ActionRunner | undefined = actionRunner
    ? { run: actionRunner as <T>(actionId: string, input?: unknown) => Promise<T> }
    : undefined;

  return {
    sql,
    log,
    notify,
    secrets,
    run: runMeta,
    cloud,
    actions,
  };
}

/**
 * Build the SQL tagged template function
 */
function buildSqlTemplate(db: PGlite) {
  return async function sql<T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> {
    // Build parameterized query
    let query = strings[0];
    for (let i = 0; i < values.length; i++) {
      query += `$${i + 1}${strings[i + 1]}`;
    }

    const result = await db.query<T>(query, values);
    return result.rows;
  };
}

/**
 * Build the logger
 */
function buildLogger(runId: string): ActionLogger {
  const prefix = `[action:${runId}]`;

  return {
    debug: (msg: string, meta?: unknown) => {
      console.debug(prefix, msg, meta !== undefined ? meta : "");
    },
    info: (msg: string, meta?: unknown) => {
      console.info(prefix, msg, meta !== undefined ? meta : "");
    },
    warn: (msg: string, meta?: unknown) => {
      console.warn(prefix, msg, meta !== undefined ? meta : "");
    },
    error: (msg: string, meta?: unknown) => {
      console.error(prefix, msg, meta !== undefined ? meta : "");
    },
  };
}

/**
 * Build the notify object (placeholder implementation)
 */
function buildNotify(): ActionNotify {
  return {
    slack: async (_channel: string, _message: string) => {
      console.warn("[notify] Slack integration not configured");
    },
    email: async (_to: string, _subject: string, _body: string) => {
      console.warn("[notify] Email integration not configured");
    },
    webhook: async (url: string, payload: unknown) => {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      return response;
    },
  };
}

/**
 * Create run metadata
 */
export function createRunMeta(
  runId: string,
  trigger: ActionTriggerType,
  input: unknown,
): ActionRunMeta {
  return {
    id: runId,
    trigger,
    startedAt: new Date(),
    input,
  };
}
