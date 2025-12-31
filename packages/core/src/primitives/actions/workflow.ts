/**
 * Workflow Types for CF Workers Compatibility
 *
 * These types ensure that action workflows can be compiled to valid
 * Cloudflare Worker Workflow scripts with compile-time type safety.
 */

// =============================================================================
// Serializable Type (CF RpcSerializable compatible)
// =============================================================================

/**
 * Types that can be serialized/persisted by CF Workflows.
 * Mirrors cloudflare:workers RpcSerializable.
 */
export type Serializable =
  | string
  | number
  | boolean
  | null
  | undefined
  | Serializable[]
  | { [key: string]: Serializable }
  | Date
  | ArrayBuffer
  | Map<Serializable, Serializable>
  | Set<Serializable>;

// =============================================================================
// Duration Types (CF-compatible template literals)
// =============================================================================

type TimeUnit = "second" | "seconds" | "minute" | "minutes" | "hour" | "hours" | "day" | "days";

/**
 * CF-compatible duration string.
 * Examples: "5 seconds", "1 minute", "24 hours"
 */
export type WorkflowDuration = `${number} ${TimeUnit}`;

// =============================================================================
// Step Configuration (matches CF Workflows API)
// =============================================================================

type RetryDelayUnit = "second" | "seconds" | "minute" | "minutes" | "hour" | "hours";

/**
 * Backoff strategy for retries.
 * Matches CF WorkflowBackoff exactly.
 */
export type WorkflowBackoff = "constant" | "linear" | "exponential";

/**
 * Configuration for step retries and timeouts.
 * Matches CF WorkflowStepConfig exactly.
 */
export interface WorkflowStepConfig {
  retries?: {
    /** Maximum number of retry attempts */
    limit: number;
    /** Delay between retries (duration string or milliseconds) - REQUIRED by CF */
    delay: `${number} ${RetryDelayUnit}` | number;
    /** Backoff strategy */
    backoff?: WorkflowBackoff;
  };
  /** Maximum time for step execution (duration string or milliseconds) */
  timeout?: `${number} ${RetryDelayUnit}` | number;
}

// =============================================================================
// WorkflowStep Interface (matches CF Workflows API)
// =============================================================================

/**
 * Step primitives for workflow execution.
 * API matches CF Workflows WorkflowStep exactly.
 */
export interface WorkflowStep {
  /**
   * Execute retriable async work, returns persisted state.
   *
   * @example
   * ```typescript
   * const { orders } = await step.do("fetch-orders", async () => {
   *   return { orders: await fetchOrders() };
   * });
   * ```
   */
  do<T extends Serializable>(name: string, callback: () => Promise<T> | T): Promise<T>;
  do<T extends Serializable>(
    name: string,
    config: WorkflowStepConfig,
    callback: () => Promise<T> | T,
  ): Promise<T>;

  /**
   * Pause execution for specified duration.
   *
   * @example
   * ```typescript
   * await step.sleep("rate-limit", "5 seconds");
   * ```
   */
  sleep(name: string, duration: WorkflowDuration): Promise<void>;

  /**
   * Pause execution until specific timestamp.
   *
   * @example
   * ```typescript
   * await step.sleepUntil("scheduled", new Date("2024-01-01"));
   * ```
   */
  sleepUntil(name: string, timestamp: Date | number): Promise<void>;

  /**
   * Wait for external event. In dev mode, shows UI prompt.
   *
   * @example
   * ```typescript
   * const approval = await step.waitForEvent<{ approved: boolean }>("approval", {
   *   type: "human-approval",
   *   timeout: "24 hours",
   * });
   * ```
   */
  waitForEvent<T extends Serializable = Serializable>(
    name: string,
    opts: { type: string; timeout?: WorkflowDuration },
  ): Promise<T>;
}

// =============================================================================
// Step Recording (for visualization)
// =============================================================================

export type StepStatus = "pending" | "running" | "success" | "failed" | "waiting";

export type StepType = "do" | "sleep" | "sleepUntil" | "waitForEvent";

/**
 * Record of a step execution for visualization.
 */
export interface StepRecord {
  /** Step name (unique within workflow run) */
  name: string;
  /** Step type */
  type: StepType;
  /** When step started (ISO string) */
  startedAt?: string;
  /** When step finished (ISO string) */
  finishedAt?: string;
  /** Current status */
  status: StepStatus;
  /** Step result (if success) */
  result?: Serializable;
  /** Error message (if failed) */
  error?: string;
  /** Nested steps (for parallel execution) */
  children?: StepRecord[];
  /** Step configuration (retries, timeout) */
  config?: WorkflowStepConfig;
}

// =============================================================================
// Workflow Function Type
// =============================================================================

import type { ActionContext } from "./types.js";

/**
 * Workflow function signature - matches CF WorkflowEntrypoint.run().
 * Input and Output must be serializable for CF compatibility.
 */
export type WorkflowFn<
  TInput extends Serializable = Serializable,
  TOutput extends Serializable = Serializable,
> = (step: WorkflowStep, ctx: ActionContext, input: TInput) => Promise<TOutput>;

// =============================================================================
// Type Helpers
// =============================================================================

/**
 * Helper type to validate workflow can compile to CF Worker.
 * Returns the workflow type if valid, `never` if invalid.
 */
export type ValidCFWorkflow<T> =
  T extends WorkflowFn<infer I, infer O>
    ? I extends Serializable
      ? O extends Serializable
        ? T
        : never // Output not serializable
      : never // Input not serializable
    : never; // Not a workflow function

/**
 * Extract input type from a workflow function.
 */
export type WorkflowInput<T> = T extends WorkflowFn<infer I, Serializable> ? I : never;

/**
 * Extract output type from a workflow function.
 */
export type WorkflowOutput<T> = T extends WorkflowFn<Serializable, infer O> ? O : never;

// =============================================================================
// Workflow Run Result
// =============================================================================

/**
 * Result from executing a workflow, includes step records for visualization.
 */
export interface WorkflowRunResult<T extends Serializable = Serializable> {
  /** Workflow output */
  result: T;
  /** All steps executed (for visualization) */
  steps: StepRecord[];
  /** Total duration in milliseconds */
  durationMs: number;
}
