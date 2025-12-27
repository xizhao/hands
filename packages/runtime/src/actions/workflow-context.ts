/**
 * Workflow Context Builder (Production)
 *
 * Creates ActionContext for CF Workflow execution in production.
 * Uses the Database Durable Object for SQL access (same as dev).
 */

import type {
  ActionContext,
  ActionLogger,
  ActionNotify,
} from "../types/action";
import { sql as kyselySql } from "kysely";
import { createDb } from "rwsdk/db";
import type { DB } from "@hands/db/types";

/**
 * Escape a SQL value for safe interpolation
 */
function escapeValue(value: unknown): string {
  if (value === null || value === undefined) {
    return "NULL";
  }
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "boolean") {
    return value ? "1" : "0";
  }
  if (value instanceof Date) {
    return `'${value.toISOString()}'`;
  }
  if (typeof value === "object") {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'`;
  }
  // String - escape single quotes
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Build an ActionContext for production workflow execution.
 *
 * Uses the DATABASE Durable Object binding for SQL access.
 * Secrets are extracted from env bindings (HANDS_SECRET_*).
 */
export function buildWorkflowContext(env: Env, runId: string): ActionContext {
  // Build logger
  const log = buildLogger(runId);

  // Build notify
  const notify = buildNotify();

  // Get Kysely instance via DATABASE Durable Object
  const db = createDb<DB>(env.DATABASE, "hands-db");

  // SQL tagged template using Kysely raw queries
  // Matches the dev context pattern: escape values inline, use .execute()
  const sql = async <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ): Promise<T[]> => {
    // Build query with escaped values (same as dev context)
    let query = strings[0];
    for (let i = 0; i < values.length; i++) {
      query += escapeValue(values[i]) + strings[i + 1];
    }

    const result = await kyselySql.raw<T>(query).execute(db);
    return result.rows as T[];
  };

  // Sources proxy - provides table access via sql
  // In production, we recommend using ctx.sql directly for type safety
  const sources = new Proxy({} as ActionContext["sources"], {
    get: () => {
      return new Proxy({}, {
        get: () => ({
          select: async () => {
            throw new Error("Use ctx.sql`SELECT...` in production workflows for better type safety");
          },
          insert: async () => {
            throw new Error("Use ctx.sql`INSERT...` in production workflows for better type safety");
          },
          update: async () => {
            throw new Error("Use ctx.sql`UPDATE...` in production workflows for better type safety");
          },
          delete: async () => {
            throw new Error("Use ctx.sql`DELETE...` in production workflows for better type safety");
          },
        }),
      });
    },
  });

  // Extract secrets from env (HANDS_SECRET_* pattern)
  const secrets = extractSecrets(env);

  return {
    sources,
    sql,
    log,
    notify,
    secrets,
    run: {
      id: runId,
      trigger: "manual", // CF Workflows are triggered via API
      startedAt: new Date(),
      input: undefined,
    },
  };
}

/**
 * Extract secrets from env bindings.
 * Looks for HANDS_SECRET_* pattern and strips prefix.
 */
function extractSecrets(env: Env): Record<string, string> {
  const secrets: Record<string, string> = {};
  const envRecord = env as unknown as Record<string, unknown>;

  for (const [key, value] of Object.entries(envRecord)) {
    if (key.startsWith("HANDS_SECRET_") && typeof value === "string") {
      // HANDS_SECRET_MY_API_KEY -> MY_API_KEY
      const secretName = key.replace("HANDS_SECRET_", "");
      secrets[secretName] = value;
    }
  }

  return secrets;
}

function buildLogger(runId: string): ActionLogger {
  const prefix = `[workflow:${runId}]`;

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

function buildNotify(): ActionNotify {
  return {
    slack: async () => {
      console.warn("Slack notifications not configured in production");
    },
    email: async () => {
      console.warn("Email notifications not configured in production");
    },
    webhook: async (url: string, payload: unknown) => {
      return fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    },
  };
}
