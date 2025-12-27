/**
 * Action Primitives
 *
 * Types and helpers for defining serverless actions.
 */

// Core action types
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
  CloudEmailInput,
  CloudSlackInput,
  CloudGitHubIssue,
  CloudGitHubRepo,
  CloudServiceStatus,
  ActionCloud,
  ActionRunner,
  ActionContext,
  InputValidator,
  ActionDefinition,
  RunActionDefinition,
  WorkflowActionDefinition,
  DiscoveredAction,
  ValidAction,
  InvalidAction,
} from "./types.js";

export { defineAction, isWorkflowAction, isRunAction } from "./types.js";

// Workflow types (CF Workers compatible)
export type {
  Serializable,
  WorkflowDuration,
  WorkflowBackoff,
  WorkflowStepConfig,
  WorkflowStep,
  StepStatus,
  StepType,
  StepRecord,
  WorkflowFn,
  ValidCFWorkflow,
  WorkflowInput,
  WorkflowOutput,
  WorkflowRunResult,
} from "./workflow.js";

// Workflow graph (for visualization)
export type { WorkflowNode, WorkflowEdge, WorkflowGraph } from "./graph.js";
export {
  StepRecorder,
  getStepGraph,
  getStepList,
  findStep,
  getTotalDuration,
} from "./graph.js";
