/**
 * Eval Plugin System
 *
 * Inspired by Vite's plugin architecture. Plugins can hook into
 * different phases of the eval loop.
 */

import type { ServiceStatus } from "../types"

/**
 * Context passed to all plugins during eval
 */
export interface EvalContext {
  /** Workbook directory */
  workbookDir: string
  /** Service statuses */
  services: {
    postgres: ServiceStatus
    worker: ServiceStatus
  }
  /** Whether to auto-fix issues */
  autoFix: boolean
  /** Options passed to eval */
  options: Record<string, unknown>
}

/**
 * Result from a single plugin's check
 */
export interface PluginResult {
  /** Plugin name */
  name: string
  /** Duration in ms */
  duration: number
  /** Whether the check passed */
  ok: boolean
  /** Errors found */
  errors: PluginDiagnostic[]
  /** Warnings found */
  warnings: PluginDiagnostic[]
  /** Files that were fixed (if autoFix enabled) */
  fixed?: string[]
  /** Custom data from the plugin */
  data?: unknown
}

/**
 * A diagnostic message from a plugin
 */
export interface PluginDiagnostic {
  file?: string
  line?: number
  column?: number
  message: string
  code?: string
}

/**
 * Plugin hook that runs during eval
 */
export type EvalHook = (ctx: EvalContext) => Promise<PluginResult>

/**
 * A plugin for the eval system
 */
export interface EvalPlugin {
  /** Plugin name (must be unique) */
  name: string
  /**
   * Order hint for execution. Lower numbers run first.
   * - 0-99: Pre-processing (file discovery, config loading)
   * - 100-199: Transformation (formatting, transpilation)
   * - 200-299: Validation (type checking, linting)
   * - 300-399: Analysis (unused code, complexity)
   * - 400+: Post-processing (reporting, cleanup)
   */
  order?: number
  /**
   * Whether this plugin can run in parallel with others.
   * If false, it will run sequentially.
   * Default: true
   */
  parallel?: boolean
  /**
   * The eval hook
   */
  eval: EvalHook
}

/**
 * Plugin container - manages plugin lifecycle
 */
export class PluginContainer {
  private plugins: EvalPlugin[] = []

  /**
   * Register a plugin
   */
  use(plugin: EvalPlugin): this {
    this.plugins.push(plugin)
    // Keep sorted by order
    this.plugins.sort((a, b) => (a.order ?? 200) - (b.order ?? 200))
    return this
  }

  /**
   * Remove a plugin by name
   */
  remove(name: string): this {
    this.plugins = this.plugins.filter((p) => p.name !== name)
    return this
  }

  /**
   * Get a plugin by name
   */
  get(name: string): EvalPlugin | undefined {
    return this.plugins.find((p) => p.name === name)
  }

  /**
   * List all plugins
   */
  list(): EvalPlugin[] {
    return [...this.plugins]
  }

  /**
   * Run all plugins, respecting order and parallelism
   */
  async run(ctx: EvalContext): Promise<Map<string, PluginResult>> {
    const results = new Map<string, PluginResult>()

    // Group plugins by order for batch execution
    const groups = this.groupByOrder()

    for (const group of groups) {
      const parallelPlugins = group.filter((p) => p.parallel !== false)
      const sequentialPlugins = group.filter((p) => p.parallel === false)

      // Run parallel plugins concurrently
      if (parallelPlugins.length > 0) {
        const parallelResults = await Promise.all(
          parallelPlugins.map((p) => this.runPlugin(p, ctx))
        )
        for (const result of parallelResults) {
          results.set(result.name, result)
        }
      }

      // Run sequential plugins one at a time
      for (const plugin of sequentialPlugins) {
        const result = await this.runPlugin(plugin, ctx)
        results.set(result.name, result)
      }
    }

    return results
  }

  /**
   * Run a single plugin with error handling
   */
  private async runPlugin(plugin: EvalPlugin, ctx: EvalContext): Promise<PluginResult> {
    const start = Date.now()
    try {
      const result = await plugin.eval(ctx)
      return {
        ...result,
        name: plugin.name,
        duration: Date.now() - start,
      }
    } catch (error) {
      return {
        name: plugin.name,
        duration: Date.now() - start,
        ok: false,
        errors: [
          {
            message: error instanceof Error ? error.message : String(error),
          },
        ],
        warnings: [],
      }
    }
  }

  /**
   * Group plugins by their order range (0-99, 100-199, etc.)
   */
  private groupByOrder(): EvalPlugin[][] {
    const groups = new Map<number, EvalPlugin[]>()

    for (const plugin of this.plugins) {
      const order = plugin.order ?? 200
      const groupKey = Math.floor(order / 100) * 100
      const group = groups.get(groupKey) || []
      group.push(plugin)
      groups.set(groupKey, group)
    }

    // Return groups sorted by key
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([_, plugins]) => plugins)
  }
}

/**
 * Create a new plugin container with default plugins
 */
export function createPluginContainer(): PluginContainer {
  return new PluginContainer()
}
