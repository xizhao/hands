/**
 * PostgreSQL LISTEN/NOTIFY for real-time change tracking
 * Zero storage overhead - uses pg_notify for push notifications
 */

import postgres from "postgres";

export interface DatabaseChange {
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  rowId: string | null;
  ts: number;
}

interface ChangeEvent {
  type: "change";
  change: DatabaseChange;
}

interface HistoryEvent {
  type: "history";
  changes: DatabaseChange[];
}

export type ChangeStreamEvent = ChangeEvent | HistoryEvent;

const SETUP_SQL = `
-- Notification function for table changes
CREATE OR REPLACE FUNCTION hands_notify_change() RETURNS TRIGGER AS $$
BEGIN
  PERFORM pg_notify('hands_changes', json_build_object(
    'table', TG_TABLE_NAME,
    'op', TG_OP,
    'rowId', CASE
      WHEN TG_OP = 'DELETE' THEN
        CASE WHEN OLD IS NOT NULL AND OLD.id IS NOT NULL THEN OLD.id::text ELSE NULL END
      ELSE
        CASE WHEN NEW IS NOT NULL AND NEW.id IS NOT NULL THEN NEW.id::text ELSE NULL END
    END,
    'ts', EXTRACT(EPOCH FROM NOW())::bigint
  )::text);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

-- Function to attach triggers to all user tables
CREATE OR REPLACE FUNCTION hands_attach_triggers() RETURNS void AS $$
DECLARE
  t RECORD;
BEGIN
  FOR t IN
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_type = 'BASE TABLE'
  LOOP
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS hands_change_trigger ON %I', t.table_name);
      EXECUTE format(
        'CREATE TRIGGER hands_change_trigger
         AFTER INSERT OR UPDATE OR DELETE ON %I
         FOR EACH ROW EXECUTE FUNCTION hands_notify_change()',
        t.table_name
      );
    EXCEPTION WHEN OTHERS THEN
      -- Skip tables that can't have triggers (e.g., foreign tables)
      NULL;
    END;
  END LOOP;
END;
$$ LANGUAGE plpgsql;
`;

export class PostgresListener {
  private sql: ReturnType<typeof postgres> | null = null;
  private listeners = new Set<(change: DatabaseChange) => void>();
  private changeBuffer: DatabaseChange[] = [];
  private readonly MAX_BUFFER_SIZE = 100;
  private isSetup = false;

  constructor(private connectionString: string) {}

  /**
   * Start listening for database changes
   */
  async start(): Promise<void> {
    // Create a dedicated connection for LISTEN (can't share with pool)
    this.sql = postgres(this.connectionString, {
      max: 1,
      idle_timeout: 0, // Keep alive
      connect_timeout: 10,
    });

    // Setup trigger infrastructure (idempotent)
    await this.setupTriggers();

    // Subscribe to change notifications
    await this.sql.listen("hands_changes", (payload) => {
      try {
        const change = JSON.parse(payload) as DatabaseChange;
        this.handleChange(change);
      } catch (err) {
        console.error("[listener] Failed to parse change notification:", err);
      }
    });

    console.log("[listener] Started listening for database changes");
  }

  /**
   * Setup trigger functions and attach to all tables
   */
  private async setupTriggers(): Promise<void> {
    if (!this.sql || this.isSetup) return;

    try {
      // Create the notification function and attach helper
      await this.sql.unsafe(SETUP_SQL);

      // Attach triggers to all existing tables
      await this.sql`SELECT hands_attach_triggers()`;

      this.isSetup = true;
      console.log("[listener] Triggers attached to all tables");
    } catch (err) {
      console.error("[listener] Failed to setup triggers:", err);
      throw err;
    }
  }

  /**
   * Refresh triggers (call after schema changes)
   */
  async refreshTriggers(): Promise<void> {
    if (!this.sql) return;
    await this.sql`SELECT hands_attach_triggers()`;
    console.log("[listener] Triggers refreshed");
  }

  /**
   * Handle an incoming change notification
   */
  private handleChange(change: DatabaseChange): void {
    // Add to ring buffer
    this.changeBuffer.push(change);
    if (this.changeBuffer.length > this.MAX_BUFFER_SIZE) {
      this.changeBuffer.shift();
    }

    // Notify all listeners
    for (const listener of this.listeners) {
      try {
        listener(change);
      } catch (err) {
        console.error("[listener] Error in change listener:", err);
      }
    }
  }

  /**
   * Subscribe to change notifications
   * Returns unsubscribe function
   */
  subscribe(listener: (change: DatabaseChange) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Get recent changes from the ring buffer
   */
  getRecentChanges(): DatabaseChange[] {
    return [...this.changeBuffer];
  }

  /**
   * Clear the change buffer
   */
  clearBuffer(): void {
    this.changeBuffer = [];
  }

  /**
   * Stop listening and cleanup
   */
  async stop(): Promise<void> {
    if (this.sql) {
      await this.sql.end();
      this.sql = null;
    }
    this.listeners.clear();
    this.changeBuffer = [];
    this.isSetup = false;
    console.log("[listener] Stopped");
  }
}
