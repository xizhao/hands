/**
 * Workflow Step Recording and Graph Extraction
 *
 * Used for UI visualization of workflow execution.
 */

import type { Serializable, StepRecord, StepStatus, StepType } from "./workflow.js";

// =============================================================================
// Step Recorder
// =============================================================================

/**
 * Records steps during workflow execution for visualization.
 */
export class StepRecorder {
  private steps: StepRecord[] = [];
  private stepStack: StepRecord[] = []; // For nested steps

  /**
   * Start recording a new step
   */
  startStep(name: string, type: StepType): StepRecord {
    const step: StepRecord = {
      name,
      type,
      status: "running",
      startedAt: new Date().toISOString(),
    };

    // If we're inside a parent step, add as child
    const parent = this.stepStack[this.stepStack.length - 1];
    if (parent) {
      parent.children = parent.children || [];
      parent.children.push(step);
    } else {
      this.steps.push(step);
    }

    this.stepStack.push(step);
    return step;
  }

  /**
   * Complete the current step successfully
   */
  completeStep(result?: Serializable): void {
    const step = this.stepStack.pop();
    if (step) {
      step.status = "success";
      step.finishedAt = new Date().toISOString();
      step.result = result;
    }
  }

  /**
   * Fail the current step
   */
  failStep(error: string): void {
    const step = this.stepStack.pop();
    if (step) {
      step.status = "failed";
      step.finishedAt = new Date().toISOString();
      step.error = error;
    }
  }

  /**
   * Mark current step as waiting (for waitForEvent)
   */
  waitStep(): void {
    const step = this.stepStack[this.stepStack.length - 1];
    if (step) {
      step.status = "waiting";
    }
  }

  /**
   * Resume a waiting step
   */
  resumeStep(): void {
    const step = this.stepStack[this.stepStack.length - 1];
    if (step) {
      step.status = "running";
    }
  }

  /**
   * Get all recorded steps
   */
  getSteps(): StepRecord[] {
    return this.steps;
  }

  /**
   * Get current step depth (for nested parallel steps)
   */
  getDepth(): number {
    return this.stepStack.length;
  }
}

// =============================================================================
// Graph Types
// =============================================================================

/**
 * Node in the workflow graph
 */
export interface WorkflowNode {
  id: string;
  type: StepType;
  status: StepStatus;
  label: string;
  duration?: number; // milliseconds
  error?: string;
}

/**
 * Edge connecting workflow nodes
 */
export interface WorkflowEdge {
  source: string;
  target: string;
}

/**
 * Complete workflow graph for visualization
 */
export interface WorkflowGraph {
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

// =============================================================================
// Graph Extraction
// =============================================================================

/**
 * Extract visualization graph from step records
 */
export function getStepGraph(steps: StepRecord[]): WorkflowGraph {
  const nodes: WorkflowNode[] = [];
  const edges: WorkflowEdge[] = [];

  function processStep(step: StepRecord, prevId?: string): string {
    // Calculate duration
    let duration: number | undefined;
    if (step.startedAt && step.finishedAt) {
      duration = new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime();
    }

    // Create node
    const node: WorkflowNode = {
      id: step.name,
      type: step.type,
      status: step.status,
      label: step.name,
      duration,
      error: step.error,
    };
    nodes.push(node);

    // Create edge from previous step
    if (prevId) {
      edges.push({ source: prevId, target: step.name });
    }

    // Process children (parallel steps)
    if (step.children && step.children.length > 0) {
      for (const child of step.children) {
        // Children connect from parent, not to each other (parallel)
        processStep(child, step.name);
      }
    }

    return step.name;
  }

  // Process top-level steps in sequence
  let prevId: string | undefined;
  for (const step of steps) {
    prevId = processStep(step, prevId);
  }

  return { nodes, edges };
}

/**
 * Get a simple linear list of step names for display
 */
export function getStepList(steps: StepRecord[]): string[] {
  const list: string[] = [];

  function collectNames(stepList: StepRecord[]) {
    for (const step of stepList) {
      list.push(step.name);
      if (step.children) {
        collectNames(step.children);
      }
    }
  }

  collectNames(steps);
  return list;
}

/**
 * Find a step by name in the step tree
 */
export function findStep(steps: StepRecord[], name: string): StepRecord | undefined {
  for (const step of steps) {
    if (step.name === name) return step;
    if (step.children) {
      const found = findStep(step.children, name);
      if (found) return found;
    }
  }
  return undefined;
}

/**
 * Calculate total duration from steps
 */
export function getTotalDuration(steps: StepRecord[]): number {
  if (steps.length === 0) return 0;

  const first = steps[0];
  const last = steps[steps.length - 1];

  if (!first.startedAt) return 0;

  const endTime = last.finishedAt
    ? new Date(last.finishedAt).getTime()
    : Date.now();

  return endTime - new Date(first.startedAt).getTime();
}
