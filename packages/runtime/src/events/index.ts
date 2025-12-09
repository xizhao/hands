/**
 * Event Bus for Service Coordination
 *
 * Provides loose coupling between runtime components.
 * Inspired by Node.js EventEmitter but with typed events.
 */

import type { ServiceStatus, EvalResult } from "../types"
import type { DatabaseChange, SyncProgress } from "../db"

/**
 * Runtime event types
 */
export interface RuntimeEvents {
  // Service lifecycle events
  "service:postgres:starting": void
  "service:postgres:ready": { port: number; pid?: number }
  "service:postgres:stopped": void
  "service:postgres:error": { error: Error }

  "service:worker:starting": void
  "service:worker:ready": { port: number }
  "service:worker:stopped": void
  "service:worker:error": { error: Error }

  // Build events
  "build:started": { workbookDir: string }
  "build:completed": { outputDir: string; files: string[] }
  "build:failed": { errors: string[] }

  // Eval events
  "eval:started": void
  "eval:completed": { result: EvalResult }
  "eval:error": { error: Error }

  // File watcher events
  "file:changed": { path: string; event: "add" | "change" | "unlink" }
  "file:debounced": { paths: string[] }

  // Database events
  "db:change": { change: DatabaseChange }
  "db:connected": void
  "db:disconnected": void

  // Sync events
  "sync:started": { sourceId: string }
  "sync:progress": { progress: SyncProgress }
  "sync:completed": { sourceId: string; success: boolean }

  // Runtime lifecycle
  "runtime:ready": { runtimePort: number; postgresPort: number; workerPort: number }
  "runtime:shutdown": void
}

type EventHandler<T> = T extends void ? () => void : (data: T) => void

/**
 * Typed event emitter
 */
export class EventBus {
  private handlers = new Map<string, Set<EventHandler<unknown>>>()

  /**
   * Subscribe to an event
   */
  on<K extends keyof RuntimeEvents>(
    event: K,
    handler: EventHandler<RuntimeEvents[K]>
  ): () => void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set())
    }
    this.handlers.get(event)!.add(handler as EventHandler<unknown>)

    // Return unsubscribe function
    return () => {
      this.handlers.get(event)?.delete(handler as EventHandler<unknown>)
    }
  }

  /**
   * Subscribe to an event once
   */
  once<K extends keyof RuntimeEvents>(
    event: K,
    handler: EventHandler<RuntimeEvents[K]>
  ): () => void {
    const wrapper = ((data: RuntimeEvents[K]) => {
      this.off(event, wrapper as EventHandler<RuntimeEvents[K]>)
      ;(handler as (data: RuntimeEvents[K]) => void)(data)
    }) as EventHandler<RuntimeEvents[K]>

    return this.on(event, wrapper)
  }

  /**
   * Unsubscribe from an event
   */
  off<K extends keyof RuntimeEvents>(
    event: K,
    handler: EventHandler<RuntimeEvents[K]>
  ): void {
    this.handlers.get(event)?.delete(handler as EventHandler<unknown>)
  }

  /**
   * Emit an event
   */
  emit<K extends keyof RuntimeEvents>(
    event: K,
    ...args: RuntimeEvents[K] extends void ? [] : [RuntimeEvents[K]]
  ): void {
    const handlers = this.handlers.get(event)
    if (!handlers) return

    const data = args[0]
    for (const handler of handlers) {
      try {
        ;(handler as (data: unknown) => void)(data)
      } catch (error) {
        console.error(`Event handler error for ${event}:`, error)
      }
    }
  }

  /**
   * Wait for an event (promise-based)
   */
  waitFor<K extends keyof RuntimeEvents>(
    event: K,
    timeout?: number
  ): Promise<RuntimeEvents[K]> {
    return new Promise((resolve, reject) => {
      let timeoutId: ReturnType<typeof setTimeout> | undefined

      const unsubscribe = this.once(event, ((data: RuntimeEvents[K]) => {
        if (timeoutId) clearTimeout(timeoutId)
        resolve(data)
      }) as EventHandler<RuntimeEvents[K]>)

      if (timeout) {
        timeoutId = setTimeout(() => {
          unsubscribe()
          reject(new Error(`Timeout waiting for event: ${event}`))
        }, timeout)
      }
    })
  }

  /**
   * Remove all handlers for an event (or all events)
   */
  clear(event?: keyof RuntimeEvents): void {
    if (event) {
      this.handlers.delete(event)
    } else {
      this.handlers.clear()
    }
  }

  /**
   * Get handler count for an event
   */
  listenerCount(event: keyof RuntimeEvents): number {
    return this.handlers.get(event)?.size ?? 0
  }
}

// Global event bus instance
let globalBus: EventBus | null = null

/**
 * Get the global event bus
 */
export function getEventBus(): EventBus {
  if (!globalBus) {
    globalBus = new EventBus()
  }
  return globalBus
}

/**
 * Create a new event bus (for testing or isolated contexts)
 */
export function createEventBus(): EventBus {
  return new EventBus()
}
