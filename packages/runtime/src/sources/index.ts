/**
 * Source Management Module
 *
 * Simple serverless-style source sync:
 * - Source discovery is handled by manifest (single file walk)
 * - Secrets loading and validation
 * - Sync execution (source owns everything)
 * - Single HTTP endpoint: POST /sources/:id/sync
 *
 * Orchestration (scheduling, history, retries) handled by caller.
 */

// Routes (main public API)
export { registerSourceRoutes } from "./routes.js"

// Secrets utilities (used by manifest generation)
export { checkMissingSecrets } from "./secrets.js"
