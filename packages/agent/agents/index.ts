/**
 * Agent configurations
 */

export { coderAgent } from "./coder";
export { handsAgent } from "./hands";
export { importAgent } from "./import";
export { researcherAgent } from "./researcher";

// Re-import for convenience exports
import { coderAgent } from "./coder";
import { handsAgent } from "./hands";
import { importAgent } from "./import";
import { researcherAgent } from "./researcher";

/**
 * The default/primary agent for user interactions.
 * This is the main entry point - it delegates to subagents as needed.
 */
export const defaultAgent = handsAgent;

/**
 * All available agents keyed by name.
 */
export const agents = {
  hands: handsAgent,
  coder: coderAgent,
  import: importAgent,
  researcher: researcherAgent,
} as const;

/**
 * Get an agent by name, or the default agent if not found.
 */
export function getAgent(name: string) {
  return agents[name as keyof typeof agents] ?? defaultAgent;
}
