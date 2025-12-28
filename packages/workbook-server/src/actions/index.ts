/**
 * Actions Module
 *
 * Exports all action-related functionality for the workbook-server.
 *
 * Discovery Architecture:
 * - Filesystem: discoverActions() lists action files (no module loading)
 * - Runtime API: fetchActionsFromRuntime() gets full metadata via HTTP
 *
 * The runtime loads actions through Vite which handles TypeScript,
 * alias resolution (@hands/db, etc.), and validation.
 */

// Filesystem discovery (lists action files, no module loading)
export { discoverActions } from "../workbook/discovery.js";

// Runtime client (fetches metadata from runtime's /actions endpoint)
export { fetchActionsFromRuntime, isRuntimeReady } from "./runtime-client.js";

// Executor (HTTP - delegates to runtime)
export {
  type ExecuteActionHttpOptions,
  executeActionHttp,
  executeActionByIdHttp,
} from "./executor-http.js";

// Scheduler
export {
  getNextRunTime,
  getSchedulerStatus,
  type SchedulerConfig,
  startScheduler,
  stopScheduler,
} from "./scheduler.js";

// tRPC router
export { type ActionsContext, type ActionsRouter, actionsRouter } from "./trpc.js";

// Webhooks
export {
  getWebhookUrl,
  registerWebhookRoutes,
  type WebhookConfig,
} from "./webhooks.js";
