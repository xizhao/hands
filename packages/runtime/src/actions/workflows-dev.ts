/**
 * Workflow Bindings (Dev Mode)
 *
 * In development, CF Workflows are not used. Actions with `workflow()` are
 * executed locally via workflow-executor.ts with step recording.
 *
 * This module provides empty bindings so the worker can start without errors.
 * The CF worker's module runner resolves imports before Vite's alias system,
 * so we need real files (not virtual modules) for it to find.
 *
 * In production builds, vite-plugin-workbook generates real WorkflowEntrypoint
 * classes that CF can instantiate.
 */

export const workflowBindings = {} as const;

export type WorkflowId = never;

export function getWorkflowBinding(
  _id: string,
): { className: string; binding: string } | undefined {
  return undefined;
}
