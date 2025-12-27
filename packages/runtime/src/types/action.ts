/**
 * Actions - Serverless Compute Primitives
 *
 * Re-exports core action types and adds runtime-specific types.
 */

import type {
  ActionContext as CoreActionContext,
  ActionLogger,
  ActionNotify,
  ActionRunMeta,
} from "@hands/core/primitives";
import type { Services } from "@hands/core/services";

// Re-export core action types
export type {
  ActionTriggerType,
  ActionTrigger,
  ActionRunStatus,
  ActionRun,
  ActionChain,
  ActionResult,
  ActionLogger,
  ActionNotify,
  ActionRunMeta,
  InputValidator,
  ActionDefinition,
  RunActionDefinition,
  WorkflowActionDefinition,
  DiscoveredAction,
  ValidAction,
  InvalidAction,
  // Workflow types
  Serializable,
  WorkflowDuration,
  WorkflowStepConfig,
  WorkflowStep,
  StepStatus,
  StepType,
  StepRecord,
  WorkflowFn,
  WorkflowRunResult,
} from "@hands/core/primitives";

export { defineAction, isWorkflowAction, isRunAction } from "@hands/core/primitives";

// =============================================================================
// Runtime-Specific Types
// =============================================================================

/**
 * Options for table select queries
 */
export interface SelectOptions {
  where?: string;
  limit?: number;
  offset?: number;
  orderBy?: string;
}

/**
 * Client for interacting with a database table.
 * Used in ctx.sources for direct table access.
 */
export interface TableClient<T = Record<string, unknown>> {
  select(opts?: SelectOptions): Promise<T[]>;
  selectOne(opts?: SelectOptions): Promise<T | null>;
  insert(rows: T | T[]): Promise<T[]>;
  update(where: string, data: Partial<T>): Promise<T[]>;
  delete(where: string): Promise<number>;
  upsert(rows: T | T[], conflictKeys: string[]): Promise<T[]>;
  count(where?: string): Promise<number>;
}

/**
 * Runtime ActionContext with sources and services.
 * Used in the runtime for direct database access and cloud services.
 */
export interface ActionContext {
  /** Access to source tables: ctx.sources.mySource.myTable.select() */
  sources: Record<string, Record<string, TableClient>>;

  /** Raw SQL tagged template: ctx.sql`SELECT * FROM users` */
  sql: <T = unknown>(
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => Promise<T[]>;

  /** Structured logging */
  log: ActionLogger;

  /** Notification integrations (legacy - prefer services) */
  notify: ActionNotify;

  /** Resolved secrets from .env.local */
  secrets: Record<string, string>;

  /** Current run metadata */
  run: ActionRunMeta;

  /**
   * Cloud services client.
   * Access external services like email, Slack, GitHub via OAuth.
   */
  services?: Services;
}
