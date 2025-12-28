/**
 * Action Webhooks
 *
 * HTTP webhook handlers for actions that support webhook triggers.
 * Queries runtime for action metadata and delegates execution via HTTP.
 */

import type { Hono } from "hono";
import { executeActionHttp } from "./executor-http.js";
import { fetchActionsFromRuntime } from "./runtime-client.js";

export interface WebhookConfig {
  workbookDir: string;
  /** Runtime URL for action execution (e.g., http://localhost:55200) */
  getRuntimeUrl: () => string | null;
  isRuntimeReady: () => boolean;
}

/**
 * Register webhook routes on a Hono app
 */
export function registerWebhookRoutes(app: Hono, config: WebhookConfig): void {
  const { workbookDir, getRuntimeUrl, isRuntimeReady } = config;

  // POST /webhook/:actionId - Execute action via webhook
  app.post("/webhook/:actionId", async (c) => {
    const actionId = c.req.param("actionId");

    // Check runtime is ready
    if (!isRuntimeReady()) {
      return c.json({ error: "Runtime not ready", code: "RUNTIME_NOT_READY" }, 503);
    }

    const runtimeUrl = getRuntimeUrl();
    if (!runtimeUrl) {
      return c.json({ error: "Runtime not available", code: "RUNTIME_NOT_AVAILABLE" }, 503);
    }

    // Fetch action metadata from runtime
    const actions = await fetchActionsFromRuntime(runtimeUrl);
    const action = actions.find((a) => a.id === actionId);

    if (!action) {
      return c.json({ error: `Action not found: ${actionId}`, code: "ACTION_NOT_FOUND" }, 404);
    }

    // Check if action is valid
    if (!action.valid) {
      return c.json(
        {
          error: `Action ${actionId} is invalid: ${action.error || "Unknown error"}`,
          code: "ACTION_INVALID",
        },
        400,
      );
    }

    // Check if action supports webhook trigger
    const triggers = action.triggers ?? ["manual"];
    if (!triggers.includes("webhook")) {
      return c.json(
        {
          error: `Action ${actionId} does not support webhook triggers`,
          code: "WEBHOOK_NOT_SUPPORTED",
        },
        400,
      );
    }

    // Check for missing secrets
    if (action.missingSecrets?.length) {
      return c.json(
        {
          error: `Missing required secrets: ${action.missingSecrets.join(", ")}`,
          code: "MISSING_SECRETS",
        },
        400,
      );
    }

    // Parse request body as input
    let input: unknown;
    try {
      const contentType = c.req.header("content-type") || "";
      if (contentType.includes("application/json")) {
        input = await c.req.json();
      } else if (contentType.includes("text/")) {
        input = await c.req.text();
      } else {
        // Try JSON first, fall back to text
        try {
          input = await c.req.json();
        } catch {
          input = await c.req.text();
        }
      }
    } catch {
      input = undefined;
    }

    // Execute the action via HTTP to runtime
    const run = await executeActionHttp({
      action,
      trigger: "webhook",
      input,
      runtimeUrl,
      workbookDir,
    });

    // Return run result
    return c.json({
      runId: run.id,
      actionId: run.actionId,
      status: run.status,
      output: run.output,
      error: run.error,
      durationMs: run.durationMs,
    });
  });

  // POST /webhook/:actionId/:customPath - Execute action with custom path
  app.post("/webhook/:actionId/*", async (c) => {
    const actionId = c.req.param("actionId");
    const customPath = c.req.path.replace(`/webhook/${actionId}/`, "");

    // Check runtime is ready
    if (!isRuntimeReady()) {
      return c.json({ error: "Runtime not ready", code: "RUNTIME_NOT_READY" }, 503);
    }

    const runtimeUrl = getRuntimeUrl();
    if (!runtimeUrl) {
      return c.json({ error: "Runtime not available", code: "RUNTIME_NOT_AVAILABLE" }, 503);
    }

    // Fetch action metadata from runtime
    const actions = await fetchActionsFromRuntime(runtimeUrl);

    // First try exact action ID match with custom path (only valid actions)
    let action = actions.find(
      (a) =>
        a.id === actionId &&
        a.valid &&
        a.webhookPath === customPath &&
        (a.triggers ?? ["manual"]).includes("webhook"),
    );

    // Fall back to just action ID (only valid actions)
    if (!action) {
      action = actions.find(
        (a) =>
          a.id === actionId &&
          a.valid &&
          (a.triggers ?? ["manual"]).includes("webhook"),
      );
    }

    if (!action) {
      return c.json(
        {
          error: `Action not found or webhook not supported: ${actionId}`,
          code: "ACTION_NOT_FOUND",
        },
        404,
      );
    }

    // Check for missing secrets
    if (action.missingSecrets?.length) {
      return c.json(
        {
          error: `Missing required secrets: ${action.missingSecrets.join(", ")}`,
          code: "MISSING_SECRETS",
        },
        400,
      );
    }

    // Parse request body as input, include custom path
    let bodyInput: unknown;
    try {
      const contentType = c.req.header("content-type") || "";
      if (contentType.includes("application/json")) {
        bodyInput = await c.req.json();
      } else if (contentType.includes("text/")) {
        bodyInput = await c.req.text();
      } else {
        try {
          bodyInput = await c.req.json();
        } catch {
          bodyInput = await c.req.text();
        }
      }
    } catch {
      bodyInput = undefined;
    }

    // Combine body with webhook metadata
    const input = {
      body: bodyInput,
      path: customPath,
      method: c.req.method,
      headers: Object.fromEntries(c.req.raw.headers.entries()),
    };

    // Execute the action via HTTP to runtime
    const run = await executeActionHttp({
      action,
      trigger: "webhook",
      input,
      runtimeUrl,
      workbookDir,
    });

    // Return run result
    return c.json({
      runId: run.id,
      actionId: run.actionId,
      status: run.status,
      output: run.output,
      error: run.error,
      durationMs: run.durationMs,
    });
  });
}

/**
 * Get webhook URL for an action
 */
export function getWebhookUrl(baseUrl: string, actionId: string, customPath?: string): string {
  if (customPath) {
    return `${baseUrl}/webhook/${actionId}/${customPath}`;
  }
  return `${baseUrl}/webhook/${actionId}`;
}
