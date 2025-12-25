/**
 * Actions Module
 *
 * Exports all action-related functionality for the workbook-server.
 * Action execution is delegated to runtime via HTTP.
 */

// Discovery (from unified workbook discovery)
export { discoverActions } from "../workbook/discovery.js";

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
