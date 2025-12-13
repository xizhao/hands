/**
 * Actions Module
 *
 * Exports all action-related functionality for the runtime.
 */

// Discovery
export { discoverActions, reloadAction } from "./discovery.js";

// Context builder
export { buildActionContext, createRunMeta } from "./context.js";

// Executor
export { executeAction, executeActionById, type ExecuteActionOptions } from "./executor.js";

// History
export {
  cleanupOldRuns,
  getActionRun,
  getActionRunStats,
  getLastActionRun,
  initActionRunsTable,
  queryActionRuns,
  type QueryRunsOptions,
  saveActionRun,
  updateActionRun,
  type ActionRunStats,
} from "./history.js";

// Scheduler
export {
  getNextRunTime,
  getSchedulerStatus,
  startScheduler,
  stopScheduler,
  type SchedulerConfig,
} from "./scheduler.js";

// Webhooks
export {
  getWebhookUrl,
  registerWebhookRoutes,
  type WebhookConfig,
} from "./webhooks.js";

// tRPC router
export { actionsRouter, type ActionsContext, type ActionsRouter } from "./trpc.js";
