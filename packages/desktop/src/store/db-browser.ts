/**
 * Database Browser Store
 *
 * TanStack DB collections for real-time database change tracking.
 * Uses SSE subscription to runtime's /postgres/changes endpoint.
 */

import { createCollection } from "@tanstack/db";

// ============ TYPES ============

export interface DatabaseChange {
  table: string;
  op: "INSERT" | "UPDATE" | "DELETE";
  rowId: string | null;
  ts: number;
}

export interface ChangeRecord extends DatabaseChange {
  id: string; // `${table}-${ts}-${rowId}`
}

export interface TableInfo {
  name: string;
  column_count: number;
  size_bytes: number;
}

export interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  default_value: string | null;
  is_primary: boolean;
}

// ============ SYNC WRITER INTERFACE ============

type SyncWriter<T> = {
  begin: () => void;
  write: (message: { value: T; type: "insert" | "update" | "delete" }) => void;
  commit: () => void;
  markReady: () => void;
};

const syncWriters = {
  changes: null as SyncWriter<ChangeRecord> | null,
};

// ============ COLLECTIONS ============

export const dbChangesCollection = createCollection<ChangeRecord, string>({
  id: "db-changes",
  getKey: (c) => c.id,
  sync: {
    sync: ({ begin, write, commit, markReady }) => {
      syncWriters.changes = { begin, write, commit, markReady };
      markReady();
    },
  },
});

// ============ RING BUFFER MANAGEMENT ============

const MAX_CHANGES = 100;
let changeIds: string[] = [];

function addChange(change: ChangeRecord): void {
  const w = syncWriters.changes;
  if (!w) return;

  w.begin();
  w.write({ value: change, type: "insert" });

  // Maintain ring buffer - remove oldest if over limit
  changeIds.push(change.id);
  if (changeIds.length > MAX_CHANGES) {
    const oldId = changeIds.shift()!;
    w.write({ value: { id: oldId } as ChangeRecord, type: "delete" });
  }

  w.commit();
}

function clearChanges(): void {
  const w = syncWriters.changes;
  if (!w) return;

  w.begin();
  for (const id of changeIds) {
    w.write({ value: { id } as ChangeRecord, type: "delete" });
  }
  w.commit();
  changeIds = [];
}

// ============ SSE SUBSCRIPTION ============

let currentSubscription: (() => void) | null = null;

export function subscribeToDbChanges(
  runtimePort: number,
  _onError?: (err: unknown) => void,
  onNewChange?: (change: ChangeRecord) => void
): () => void {
  console.log("[db-browser] Starting SSE subscription to port", runtimePort);

  // Cleanup existing subscription
  if (currentSubscription) {
    console.log("[db-browser] Cleaning up existing subscription");
    currentSubscription();
    currentSubscription = null;
  }

  // Clear old changes when switching workbooks
  clearChanges();

  const abortController = new AbortController();
  let reconnectAttempts = 0;
  let currentEventSource: EventSource | null = null;

  const connect = () => {
    const url = `http://localhost:${runtimePort}/postgres/changes`;
    console.log("[db-browser] Connecting to SSE via EventSource:", url);

    const eventSource = new EventSource(url);
    currentEventSource = eventSource;

    eventSource.onopen = () => {
      console.log("[db-browser] EventSource connected");
      reconnectAttempts = 0; // Reset on successful connection
    };

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        console.log("[db-browser] EventSource message:", data.type);

        if (data.type === "history") {
          console.log("[db-browser] Received history with", data.changes?.length ?? 0, "changes");
          for (const change of data.changes as DatabaseChange[]) {
            const changeRecord: ChangeRecord = {
              ...change,
              id: `${change.table}-${change.ts}-${change.rowId ?? "null"}`,
            };
            addChange(changeRecord);
          }
        } else if (data.type === "change") {
          const change = data.change as DatabaseChange;
          console.log("[db-browser] Received change:", change.op, change.table, change.rowId);
          const changeRecord: ChangeRecord = {
            ...change,
            id: `${change.table}-${change.ts}-${change.rowId ?? "null"}`,
          };
          addChange(changeRecord);
          // Notify caller about new change (for auto-opening DB browser)
          onNewChange?.(changeRecord);
        } else {
          console.log("[db-browser] Received unknown event type:", data.type);
        }
      } catch (parseErr) {
        console.error("[db-browser] Failed to parse SSE data:", parseErr, event.data);
      }
    };

    eventSource.onerror = () => {
      // Don't log every error - just reconnect silently with backoff
      eventSource.close();
      currentEventSource = null;

      if (abortController.signal.aborted) return;

      // Exponential backoff: 2s, 4s, 8s, 16s, max 30s
      reconnectAttempts++;
      const delay = Math.min(2000 * Math.pow(2, reconnectAttempts - 1), 30000);

      if (reconnectAttempts <= 3) {
        // Only log first few reconnects
        console.log(`[db-browser] Reconnecting in ${delay / 1000}s (attempt ${reconnectAttempts})...`);
      }

      setTimeout(() => {
        if (!abortController.signal.aborted) {
          connect();
        }
      }, delay);
    };
  };

  // Cleanup handler
  abortController.signal.addEventListener("abort", () => {
    console.log("[db-browser] Closing EventSource");
    currentEventSource?.close();
    currentEventSource = null;
  });

  connect();

  const cleanup = () => {
    console.log("[db-browser] Cleaning up SSE subscription");
    abortController.abort();
    currentSubscription = null;
  };

  currentSubscription = cleanup;
  return cleanup;
}

// ============ TABLE DATA FETCHING ============

export async function fetchTables(runtimePort: number): Promise<TableInfo[]> {
  const response = await fetch(`http://localhost:${runtimePort}/postgres/tables`);
  if (!response.ok) {
    throw new Error(`Failed to fetch tables: ${response.status}`);
  }
  return response.json();
}

export async function fetchTableColumns(
  runtimePort: number,
  tableName: string
): Promise<TableColumn[]> {
  const response = await fetch(
    `http://localhost:${runtimePort}/postgres/tables/${encodeURIComponent(tableName)}/columns`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch columns: ${response.status}`);
  }
  return response.json();
}

export async function fetchTableRows(
  runtimePort: number,
  tableName: string,
  limit = 50,
  offset = 0
): Promise<{ rows: Record<string, unknown>[]; total: number; limit: number; offset: number }> {
  const response = await fetch(
    `http://localhost:${runtimePort}/postgres/tables/${encodeURIComponent(tableName)}/rows?limit=${limit}&offset=${offset}`
  );
  if (!response.ok) {
    throw new Error(`Failed to fetch rows: ${response.status}`);
  }
  return response.json();
}

export async function refreshTriggers(runtimePort: number): Promise<void> {
  const response = await fetch(`http://localhost:${runtimePort}/postgres/triggers/refresh`, {
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`Failed to refresh triggers: ${response.status}`);
  }
}
