/**
 * Source Management Module
 *
 * Simple serverless-style source sync:
 * - Source discovery from workbook/sources/ directory
 * - Secrets loading and validation
 * - Sync execution (source owns everything)
 * - Single HTTP endpoint: POST /sync/:id
 *
 * Orchestration (scheduling, history, retries) handled by caller.
 */

// Re-export types
export type { DiscoveredSource, SyncResult } from "./types.js"
export type { SecretLoadResult } from "./secrets.js"

// Discovery
export { discoverSources, getSource, sourcesDirectoryExists } from "./discovery.js"

// Secrets
export { loadSecrets, readEnvFile, checkMissingSecrets } from "./secrets.js"

// Executor
export { executeSync } from "./executor.js"

// Routes
export { registerSourceRoutes } from "./routes.js"
