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
  onError?: (err: unknown) => void
): () => void {
  // Cleanup existing subscription
  if (currentSubscription) {
    currentSubscription();
    currentSubscription = null;
  }

  // Clear old changes when switching workbooks
  clearChanges();

  const abortController = new AbortController();

  const connect = async () => {
    try {
      const response = await fetch(`http://localhost:${runtimePort}/postgres/changes`, {
        signal: abortController.signal,
      });

      if (!response.ok) {
        throw new Error(`Failed to connect: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) {
        throw new Error("No response body");
      }

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || ""; // Keep incomplete line in buffer

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const data = JSON.parse(line.slice(6));

              if (data.type === "history") {
                // Initial history load
                for (const change of data.changes as DatabaseChange[]) {
                  const changeRecord: ChangeRecord = {
                    ...change,
                    id: `${change.table}-${change.ts}-${change.rowId ?? "null"}`,
                  };
                  addChange(changeRecord);
                }
              } else if (data.type === "change") {
                const change = data.change as DatabaseChange;
                const changeRecord: ChangeRecord = {
                  ...change,
                  id: `${change.table}-${change.ts}-${change.rowId ?? "null"}`,
                };
                addChange(changeRecord);
              }
            } catch (parseErr) {
              console.error("[db-browser] Failed to parse SSE data:", parseErr);
            }
          }
        }
      }
    } catch (err) {
      if (!abortController.signal.aborted) {
        console.error("[db-browser] SSE connection error:", err);
        onError?.(err);
      }
    }
  };

  connect();

  const cleanup = () => {
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
