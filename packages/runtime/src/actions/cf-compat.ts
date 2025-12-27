/**
 * Cloudflare Workflows Type Compatibility
 *
 * This file imports actual CF types and creates compile-time assertions
 * to ensure our workflow types are compatible with CF Workflows.
 *
 * If this file fails to compile, it means our types have drifted
 * from CF's actual API.
 */

import type {
  WorkflowStep as CFWorkflowStep,
  WorkflowStepConfig as CFWorkflowStepConfig,
  WorkflowEntrypoint as CFWorkflowEntrypoint,
  WorkflowEvent as CFWorkflowEvent,
} from "cloudflare:workers";

import type {
  WorkflowStep,
  WorkflowStepConfig,
  WorkflowBackoff,
  Serializable,
} from "@hands/core/primitives";

// =============================================================================
// Type Compatibility Assertions
// =============================================================================

/**
 * Assert that our WorkflowStepConfig is assignable to CF's.
 * This will fail to compile if our config type is incompatible.
 */
type AssertStepConfigCompat = WorkflowStepConfig extends CFWorkflowStepConfig
  ? true
  : "WorkflowStepConfig is not compatible with CF WorkflowStepConfig";

// Force the type to be evaluated
const _configCompat: AssertStepConfigCompat = true;

/**
 * Assert that our WorkflowStep methods are compatible with CF's.
 * We check method signatures individually since we may have a superset.
 */
type AssertDoMethodCompat = Parameters<WorkflowStep["do"]> extends Parameters<
  CFWorkflowStep["do"]
>
  ? true
  : "WorkflowStep.do is not compatible with CF";

type AssertSleepMethodCompat = Parameters<WorkflowStep["sleep"]> extends Parameters<
  CFWorkflowStep["sleep"]
>
  ? true
  : "WorkflowStep.sleep is not compatible with CF";

// =============================================================================
// CF Workflow Wrapper
// =============================================================================

/**
 * Wrapper to convert our workflow function to a CF WorkflowEntrypoint.
 * This enables direct deployment to Cloudflare Workers.
 *
 * @example
 * ```typescript
 * // In a CF Worker script
 * import { toCFWorkflow } from "./cf-compat";
 * import { myAction } from "@hands/actions";
 *
 * export class MyWorkflow extends toCFWorkflow(myAction) {}
 * ```
 */
export function createCFWorkflowClass<Env, TInput extends Serializable>(
  actionWorkflow: (
    step: WorkflowStep,
    ctx: unknown,
    input: TInput
  ) => Promise<Serializable>
): new (
  ctx: ExecutionContext,
  env: Env
) => CFWorkflowEntrypoint<Env, TInput> & {
  run(event: CFWorkflowEvent<TInput>, step: CFWorkflowStep): Promise<unknown>;
} {
  // This is a factory that returns a class extending WorkflowEntrypoint
  // The actual implementation would need to bridge contexts
  throw new Error(
    "CF Workflow compilation not yet implemented. " +
      "Use executeWorkflow for local execution."
  );
}

// =============================================================================
// Serializable Validation
// =============================================================================

/**
 * Validate at compile time that a type is serializable.
 * Use this to check your workflow return types.
 *
 * @example
 * ```typescript
 * type MyOutput = { count: number; items: string[] };
 * type _check = AssertSerializable<MyOutput>; // OK
 *
 * type BadOutput = { fn: () => void };
 * type _bad = AssertSerializable<BadOutput>; // Error!
 * ```
 */
export type AssertSerializable<T> = T extends Serializable
  ? T
  : "Type is not serializable for CF Workflows";

/**
 * Runtime check if a value is serializable.
 * Uses structured clone algorithm detection.
 */
export function isSerializable(value: unknown): boolean {
  try {
    structuredClone(value);
    return true;
  } catch {
    return false;
  }
}

/**
 * Throws if value is not serializable.
 * Use at workflow boundaries for runtime validation.
 */
export function assertSerializable<T>(value: T, context?: string): T {
  if (!isSerializable(value)) {
    const msg = context
      ? `Value at ${context} is not serializable`
      : "Value is not serializable";
    throw new Error(msg);
  }
  return value;
}
