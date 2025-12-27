/**
 * Workflow Executor
 *
 * Executes CF-style workflows locally with step recording.
 */

import type {
  WorkflowStep,
  WorkflowStepConfig,
  WorkflowDuration,
  Serializable,
  StepRecord,
  WorkflowRunResult,
  ActionContext,
  WorkflowActionDefinition,
} from "@hands/core/primitives";
import { StepRecorder } from "@hands/core/primitives";

// =============================================================================
// Duration Parsing
// =============================================================================

/**
 * Parse CF-style duration string or number to milliseconds.
 * Accepts: "5 seconds", "1 minute", or number (milliseconds)
 */
function parseDuration(duration: WorkflowDuration | number): number {
  // If already a number, treat as milliseconds
  if (typeof duration === "number") {
    return duration;
  }

  const match = duration.match(/^(\d+)\s+(second|seconds|minute|minutes|hour|hours|day|days)$/);
  if (!match) {
    throw new Error(`Invalid duration format: ${duration}`);
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case "second":
    case "seconds":
      return value * 1000;
    case "minute":
    case "minutes":
      return value * 60 * 1000;
    case "hour":
    case "hours":
      return value * 60 * 60 * 1000;
    case "day":
    case "days":
      return value * 24 * 60 * 60 * 1000;
    default:
      throw new Error(`Unknown duration unit: ${unit}`);
  }
}

// =============================================================================
// Wait For Event Handler
// =============================================================================

export interface WaitForEventHandler {
  /**
   * Called when a step is waiting for an event.
   * Should return a promise that resolves when the event is received.
   */
  wait<T extends Serializable>(
    runId: string,
    stepName: string,
    eventType: string,
    timeout?: number
  ): Promise<T>;

  /**
   * Send an event to a waiting step
   */
  sendEvent(runId: string, stepName: string, eventType: string, data: Serializable): void;
}

/**
 * Default handler that immediately resolves (for testing)
 */
export const autoApproveHandler: WaitForEventHandler = {
  async wait<T extends Serializable>(): Promise<T> {
    return {} as T;
  },
  sendEvent() {},
};

// =============================================================================
// Step Implementation
// =============================================================================

interface CreateWorkflowStepOptions {
  recorder: StepRecorder;
  runId: string;
  eventHandler?: WaitForEventHandler;
}

/**
 * Create a WorkflowStep implementation that records execution
 */
export function createWorkflowStep(options: CreateWorkflowStepOptions): WorkflowStep {
  const { recorder, runId, eventHandler = autoApproveHandler } = options;

  return {
    async do<T extends Serializable>(
      name: string,
      configOrCallback: WorkflowStepConfig | (() => Promise<T> | T),
      maybeCallback?: () => Promise<T> | T
    ): Promise<T> {
      // Handle overloaded signature
      const config: WorkflowStepConfig | undefined =
        typeof configOrCallback === "function" ? undefined : configOrCallback;
      const callback: () => Promise<T> | T =
        typeof configOrCallback === "function" ? configOrCallback : maybeCallback!;

      // Record step start
      const step = recorder.startStep(name, "do");
      if (config) {
        step.config = config;
      }

      try {
        // Execute with retry logic if configured
        const result = await executeWithRetry(callback, config);
        recorder.completeStep(result as Serializable);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recorder.failStep(message);
        throw error;
      }
    },

    async sleep(name: string, duration: WorkflowDuration): Promise<void> {
      recorder.startStep(name, "sleep");

      const ms = parseDuration(duration);
      await new Promise((resolve) => setTimeout(resolve, ms));

      recorder.completeStep();
    },

    async sleepUntil(name: string, timestamp: Date | number): Promise<void> {
      recorder.startStep(name, "sleepUntil");

      const targetTime = typeof timestamp === "number" ? timestamp : timestamp.getTime();
      const now = Date.now();
      const delay = Math.max(0, targetTime - now);

      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }

      recorder.completeStep();
    },

    async waitForEvent<T extends Serializable>(
      name: string,
      opts: { type: string; timeout?: WorkflowDuration }
    ): Promise<T> {
      recorder.startStep(name, "waitForEvent");
      recorder.waitStep();

      const timeoutMs = opts.timeout ? parseDuration(opts.timeout) : undefined;

      try {
        const result = await eventHandler.wait<T>(runId, name, opts.type, timeoutMs);
        recorder.resumeStep();
        recorder.completeStep(result as Serializable);
        return result;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        recorder.failStep(message);
        throw error;
      }
    },
  };
}

// =============================================================================
// Retry Logic
// =============================================================================

async function executeWithRetry<T>(
  callback: () => Promise<T> | T,
  config?: WorkflowStepConfig
): Promise<T> {
  const maxRetries = config?.retries?.limit ?? 0;
  const baseDelay = config?.retries?.delay ? parseDuration(config.retries.delay) : 1000;
  const backoff = config?.retries?.backoff ?? "linear";
  const timeout = config?.timeout ? parseDuration(config.timeout) : undefined;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Apply timeout if configured
      if (timeout) {
        const result = await Promise.race([
          Promise.resolve(callback()),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("Step timeout")), timeout)
          ),
        ]);
        return result;
      }
      return await callback();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on last attempt
      if (attempt < maxRetries) {
        let delay: number;
        switch (backoff) {
          case "exponential":
            delay = baseDelay * Math.pow(2, attempt);
            break;
          case "constant":
            delay = baseDelay;
            break;
          case "linear":
          default:
            delay = baseDelay * (attempt + 1);
            break;
        }
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

// =============================================================================
// Workflow Execution
// =============================================================================

export interface ExecuteWorkflowOptions {
  action: WorkflowActionDefinition;
  input: Serializable;
  ctx: ActionContext;
  runId: string;
  eventHandler?: WaitForEventHandler;
}

/**
 * Execute a workflow action and return result with step records
 */
export async function executeWorkflow<T extends Serializable>(
  options: ExecuteWorkflowOptions
): Promise<WorkflowRunResult<T>> {
  const { action, input, ctx, runId, eventHandler } = options;

  const recorder = new StepRecorder();
  const step = createWorkflowStep({ recorder, runId, eventHandler });

  const startTime = Date.now();

  try {
    const result = await action.workflow(step, ctx, input);
    const durationMs = Date.now() - startTime;

    return {
      result: result as T,
      steps: recorder.getSteps(),
      durationMs,
    };
  } catch (error) {
    const durationMs = Date.now() - startTime;

    // Return partial result with steps recorded so far
    return {
      result: undefined as unknown as T,
      steps: recorder.getSteps(),
      durationMs,
    };
  }
}
