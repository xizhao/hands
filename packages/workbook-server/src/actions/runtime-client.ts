/**
 * Runtime Client
 *
 * Shared utilities for communicating with the runtime's HTTP API.
 * The runtime loads actions through Vite's pipeline, providing proper
 * alias resolution and TypeScript transforms.
 */

import type { DiscoveredAction } from "../workbook/types.js";

/**
 * Action metadata as returned by the runtime's /actions endpoint
 */
interface RuntimeActionMetadata {
  id: string;
  name: string;
  description?: string;
  triggers: string[];
  schedule?: string;
  secrets?: string[];
  isWorkflow?: boolean;
}

/**
 * Fetch action metadata from runtime's /actions endpoint.
 *
 * This is the canonical way to get full action metadata (name, triggers, schedule, etc.)
 * because the runtime loads actions through Vite which handles:
 * - TypeScript compilation
 * - Alias resolution (@hands/db, etc.)
 * - Module validation
 *
 * Returns empty array if runtime is not available.
 */
export async function fetchActionsFromRuntime(runtimeUrl: string): Promise<DiscoveredAction[]> {
  try {
    const response = await fetch(`${runtimeUrl}/actions`);
    if (!response.ok) return [];

    const actions = (await response.json()) as RuntimeActionMetadata[];

    return actions.map((a) => ({
      id: a.id,
      path: `actions/${a.id}.ts`,
      valid: true,
      name: a.name,
      description: a.description,
      schedule: a.schedule,
      triggers: a.triggers as DiscoveredAction["triggers"],
      secrets: a.secrets,
      isWorkflow: a.isWorkflow,
    }));
  } catch {
    return [];
  }
}

/**
 * Check if runtime is available by hitting the health endpoint
 */
export async function isRuntimeReady(runtimeUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${runtimeUrl}/health`);
    return response.ok;
  } catch {
    return false;
  }
}
