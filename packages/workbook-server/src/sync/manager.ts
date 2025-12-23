/**
 * Electric-SQL Sync Manager
 *
 * Manages Electric-SQL shape subscriptions for tables.
 * Handles starting/stopping sync, status tracking, and reconnection.
 *
 * Uses @electric-sql/pglite-sync extension to sync shapes into PGlite.
 *
 * Note: This is a placeholder implementation. Full Electric-SQL integration
 * requires:
 * 1. Installing @electric-sql/pglite-sync
 * 2. Setting up Electric service
 * 3. Configuring sync shapes
 */

import type { PGlite } from "@electric-sql/pglite";

// Subscription configuration for a table
export interface TableSubscription {
  url: string;
  table: string;
  where?: string;
  columns?: string[];
}

// Status of a subscription
export interface SubscriptionStatus {
  active: boolean;
  shapeId?: string;
  lastSyncAt?: string;
  rowCount?: number;
  error?: string;
}

// ============================================================================
// Types
// ============================================================================

export interface SyncManagerConfig {
  db: PGlite;
  workbookDir: string;
}

export interface ActiveSubscription {
  source: string;
  table: string;
  config: TableSubscription;
  status: SubscriptionStatus;
  shapeStream?: unknown; // ShapeStream instance when connected
}

// ============================================================================
// Sync Manager
// ============================================================================

export class SyncManager {
  private db: PGlite;
  private workbookDir: string;
  private subscriptions = new Map<string, ActiveSubscription>();

  constructor(config: SyncManagerConfig) {
    this.db = config.db;
    this.workbookDir = config.workbookDir;
  }

  /**
   * Get a unique key for a subscription
   */
  private getKey(source: string, table: string): string {
    return `${source}:${table}`;
  }

  /**
   * Get status for a specific table subscription
   */
  getStatus(source: string, table: string): SubscriptionStatus {
    const key = this.getKey(source, table);
    const sub = this.subscriptions.get(key);

    if (!sub) {
      return {
        active: false,
        shapeId: undefined,
        lastSyncAt: undefined,
        rowCount: undefined,
        error: undefined,
      };
    }

    return sub.status;
  }

  /**
   * Get all active subscriptions
   */
  getActiveSubscriptions(): ActiveSubscription[] {
    return Array.from(this.subscriptions.values()).filter((s) => s.status.active);
  }

  /**
   * Start a subscription for a table
   *
   * Note: This is a placeholder. Full implementation requires:
   * 1. @electric-sql/pglite-sync extension
   * 2. Shape stream configuration
   * 3. Proper error handling and reconnection
   */
  async startSubscription(
    source: string,
    table: string,
    config: TableSubscription,
  ): Promise<SubscriptionStatus> {
    const key = this.getKey(source, table);

    // Check if already active
    const existing = this.subscriptions.get(key);
    if (existing?.status.active) {
      return existing.status;
    }

    // Placeholder: In full implementation, would:
    // 1. Create ShapeStream with config
    // 2. Register with pglite-sync extension
    // 3. Start syncing

    const status: SubscriptionStatus = {
      active: false,
      error:
        "Electric-SQL sync not yet configured. Set ELECTRIC_URL and install @electric-sql/pglite-sync.",
    };

    this.subscriptions.set(key, {
      source,
      table,
      config,
      status,
    });

    // TODO: Implement actual Electric-SQL sync
    // const { electricSync } = await import("@electric-sql/pglite-sync")
    // const { ShapeStream, Shape } = await import("@electric-sql/client")
    //
    // const stream = new ShapeStream({
    //   url: `${config.url}/v1/shape/${config.table}`,
    //   where: config.where,
    //   columns: config.columns,
    // })
    //
    // const shape = new Shape(stream)
    // await this.db.electric.syncShape(shape, {
    //   table: table,
    //   primaryKey: ['id'],
    // })

    return status;
  }

  /**
   * Stop a subscription for a table
   */
  async stopSubscription(source: string, table: string): Promise<void> {
    const key = this.getKey(source, table);
    const sub = this.subscriptions.get(key);

    if (!sub) return;

    // TODO: Implement actual stop logic
    // if (sub.shapeStream) {
    //   sub.shapeStream.stop()
    // }

    sub.status.active = false;
    sub.status.error = undefined;
    sub.shapeStream = undefined;
  }

  /**
   * Stop all active subscriptions
   */
  async stopAll(): Promise<void> {
    for (const [_key, sub] of this.subscriptions) {
      if (sub.status.active) {
        await this.stopSubscription(sub.source, sub.table);
      }
    }
    this.subscriptions.clear();
  }

  /**
   * Get sync statistics
   */
  getStats(): {
    total: number;
    active: number;
    errored: number;
    inactive: number;
  } {
    let active = 0;
    let errored = 0;
    let inactive = 0;

    for (const sub of this.subscriptions.values()) {
      if (sub.status.active) {
        active++;
      } else if (sub.status.error) {
        errored++;
      } else {
        inactive++;
      }
    }

    return {
      total: this.subscriptions.size,
      active,
      errored,
      inactive,
    };
  }
}

// ============================================================================
// Factory
// ============================================================================

let syncManagerInstance: SyncManager | null = null;

/**
 * Get the singleton sync manager instance
 */
export function getSyncManager(config?: SyncManagerConfig): SyncManager {
  if (!syncManagerInstance && config) {
    syncManagerInstance = new SyncManager(config);
  }
  if (!syncManagerInstance) {
    throw new Error("SyncManager not initialized. Call with config first.");
  }
  return syncManagerInstance;
}

/**
 * Create a new sync manager (for testing or multiple workbooks)
 */
export function createSyncManager(config: SyncManagerConfig): SyncManager {
  return new SyncManager(config);
}
