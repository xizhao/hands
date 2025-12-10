/**
 * Eval loop orchestrator
 *
 * Uses a plugin-based architecture for extensibility.
 * Plugins can hook into different phases: pre-processing,
 * transformation, validation, analysis, post-processing.
 */

import type { EvalResult, ServiceStatus, WranglerConfig } from "../types"
import {
  PluginContainer,
  createPluginContainer,
  type EvalPlugin,
  type EvalContext,
  type PluginResult,
} from "./plugins"
import { getBuiltinPlugins } from "./builtin-plugins"

export interface EvalOptions {
  workbookDir: string
  services: {
    postgres: ServiceStatus
    worker: ServiceStatus
  }
  /** Auto-fix issues where possible (formatting, etc.) */
  autoFormat?: boolean
  /** Custom plugins to add (in addition to built-ins) */
  plugins?: EvalPlugin[]
  /** Plugins to disable by name */
  disablePlugins?: string[]
  /** Custom options passed to plugins */
  pluginOptions?: Record<string, unknown>
}

// Global plugin container - can be configured at startup
let globalContainer: PluginContainer | null = null

/**
 * Get or create the global plugin container
 */
export function getPluginContainer(): PluginContainer {
  if (!globalContainer) {
    globalContainer = createPluginContainer()
    // Register built-in plugins
    for (const plugin of getBuiltinPlugins()) {
      globalContainer.use(plugin)
    }
  }
  return globalContainer
}

/**
 * Configure the global plugin container
 */
export function configurePlugins(configure: (container: PluginContainer) => void): void {
  const container = getPluginContainer()
  configure(container)
}

/**
 * Run the full eval loop
 */
export async function runEval(options: EvalOptions): Promise<EvalResult> {
  const start = Date.now()
  const {
    workbookDir,
    services,
    autoFormat = true,
    plugins = [],
    disablePlugins = [],
    pluginOptions = {},
  } = options

  // Get container and optionally add custom plugins
  const container = getPluginContainer()

  // Add custom plugins for this run
  for (const plugin of plugins) {
    container.use(plugin)
  }

  // Remove disabled plugins
  for (const name of disablePlugins) {
    container.remove(name)
  }

  // Create eval context
  const ctx: EvalContext = {
    workbookDir,
    services,
    autoFix: autoFormat,
    options: pluginOptions,
  }

  // Run all plugins
  const results = await container.run(ctx)

  // Build result from plugin outputs
  const duration = Date.now() - start

  // Extract specific plugin data
  const wranglerResult = results.get("wrangler")
  const typescriptResult = results.get("typescript")
  const formatResult = results.get("format")
  const unusedResult = results.get("unused")
  const blockRefsResult = results.get("blockRefs")

  return {
    timestamp: Date.now(),
    duration,
    wrangler: (wranglerResult?.data as { config?: WranglerConfig })?.config ?? null,
    typescript: {
      errors: (typescriptResult?.data as any)?.errors ?? [],
      warnings: (typescriptResult?.data as any)?.warnings ?? [],
    },
    format: {
      fixed: formatResult?.fixed ?? [],
      errors: formatResult?.errors.map((e) => e.message) ?? [],
    },
    unused: {
      exports: (unusedResult?.data as any)?.exports ?? [],
      files: (unusedResult?.data as any)?.files ?? [],
    },
    blockRefs: {
      errors: (blockRefsResult?.data as any)?.missing ?? [],
      availableBlocks: (blockRefsResult?.data as any)?.availableBlocks ?? [],
    },
    services,
  }
}

// Re-export plugin types and utilities
export {
  PluginContainer,
  createPluginContainer,
  type EvalPlugin,
  type EvalContext,
  type PluginResult,
} from "./plugins"

export { getBuiltinPlugins } from "./builtin-plugins"

// Re-export from stdlib for backwards compatibility
export { checkTypescript, formatCode, checkFormat, findUnused } from "@hands/stdlib"
