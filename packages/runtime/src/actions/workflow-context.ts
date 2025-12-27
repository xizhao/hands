/**
 * Workflow Context Builder (Production)
 *
 * Creates ActionContext for CF Workflow execution in production.
 * Uses D1/Hyperdrive for database access (when available).
 */

import type {
  ActionContext,
  ActionLogger,
  ActionNotify,
  ActionRunMeta,
} from "../types/action";

/**
 * Build an ActionContext for production workflow execution.
 *
 * Note: In production, database access may use D1 or Hyperdrive
 * depending on how the workbook is configured. For now, we provide
 * a stub that throws - full D1 integration is a future enhancement.
 */
export function buildWorkflowContext(env: Env, runId: string): ActionContext {
  // Build logger
  const log = buildLogger(runId);

  // Build notify (stub)
  const notify = buildNotify();

  // SQL stub - production DB access requires D1/Hyperdrive setup
  const sql = async <T = unknown>(
    _strings: TemplateStringsArray,
    ..._values: unknown[]
  ): Promise<T[]> => {
    // TODO: Implement D1 or Hyperdrive-based SQL execution
    // For now, throw to indicate this needs setup
    throw new Error(
      "Database access in production workflows requires D1 configuration. " +
        "See docs for setting up D1 binding."
    );
  };

  // Sources stub
  const sources = new Proxy(
    {},
    {
      get: () => {
        throw new Error("Sources not available in production workflows");
      },
    }
  ) as ActionContext["sources"];

  return {
    sources,
    sql,
    log,
    notify,
    secrets: {}, // Secrets should be in env.* bindings in production
    run: {
      id: runId,
      trigger: "manual", // CF Workflows are triggered via API
      startedAt: new Date(),
      input: undefined,
    },
  };
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
