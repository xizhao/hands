/**
 * Actions Module
 *
 * Exports all action-related functionality for the runtime.
 */

// Context builder
export { buildActionContext, createRunMeta } from "./context.js";
// Discovery
export { discoverActions, reloadAction } from "./discovery.js";

// Executor
export { type ExecuteActionOptions, executeAction, executeActionById } from "./executor.js";

// History
export {
  type ActionRunStats,
  cleanupOldRuns,
  getActionRun,
  getActionRunStats,
  getLastActionRun,
  initActionRunsTable,
  type QueryRunsOptions,
  queryActionRuns,
  saveActionRun,
  updateActionRun,
} from "./history.js";

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
