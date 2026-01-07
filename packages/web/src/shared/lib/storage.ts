/**
 * Lightweight storage utilities for landing page and editor.
 * Tree-shakable - only import what you need.
 *
 * Storage architecture:
 * - IndexedDB: Cache of workbook IDs and names (for fast listing)
 * - SQLite via OPFS: Source of truth for all per-workbook data
 *   - _workbook: Metadata (name, description, timestamps)
 *   - _pages: MDX content
 *   - _sessions, _messages, _parts: Agent conversations
 *   - User tables (no prefix)
 */

import { openDB, type IDBPDatabase } from "idb";
import { nanoid } from "nanoid";

// ============================================================================
// Types
// ============================================================================

/**
 * Workbook cache entry in IndexedDB.
 * This is a CACHE of data from SQLite _workbook table.
 * Source of truth is always SQLite.
 */
export interface WorkbookCache {
  id: string;
  name: string;
  updated_at: number; // For sorting
}

interface StorageSchema {
  workbooks: {
    key: string;
    value: WorkbookCache;
    indexes: { "by-updated": number };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

// ============================================================================
// IndexedDB - lightweight cache for workbook listing
// ============================================================================

const DB_NAME = "hands-local";
const DB_VERSION = 2; // Must match LocalAdapter.ts

let idbPromise: Promise<IDBPDatabase<StorageSchema>> | null = null;

function getIdb(): Promise<IDBPDatabase<StorageSchema>> {
  if (!idbPromise) {
    idbPromise = openDB<StorageSchema>(DB_NAME, DB_VERSION, {
      upgrade(db, oldVersion) {
        // Create workbooks store (cache for listing)
        if (!db.objectStoreNames.contains("workbooks")) {
          const store = db.createObjectStore("workbooks", { keyPath: "id" });
          store.createIndex("by-updated", "updated_at");
        }

        // Create settings store
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }

        // Remove legacy pages store if upgrading from v1 (pages now in SQLite)
        if (oldVersion < 2 && db.objectStoreNames.contains("pages")) {
          db.deleteObjectStore("pages");
        }
      },
    });
  }
  return idbPromise;
}

// ============================================================================
// Workbook Cache Operations
//
// These operate on the IndexedDB cache. Source of truth is SQLite.
// When opening a workbook, sync from SQLite to IndexedDB.
//
// NOTE: API key storage is handled by @hands/agent/browser
// Use getStoredConfig/setStoredConfig from there for API keys
// ============================================================================

/** Get last opened workbook from cache */
export async function getLastWorkbook(): Promise<WorkbookCache | null> {
  try {
    const idb = await getIdb();
    const all = await idb.getAll("workbooks");
    if (all.length === 0) return null;
    // Sort by updated_at desc
    all.sort((a, b) => b.updated_at - a.updated_at);
    return all[0];
  } catch {
    return null;
  }
}

/** Check if any workbooks exist in cache */
export async function hasWorkbooks(): Promise<boolean> {
  try {
    const idb = await getIdb();
    const count = await idb.count("workbooks");
    return count > 0;
  } catch {
    return false;
  }
}

/** Create a new workbook entry in cache. SQLite is source of truth. */
export async function createWorkbookCache(name: string): Promise<WorkbookCache> {
  const idb = await getIdb();
  const id = nanoid(10); // Short, URL-safe: "V1StGXR8_Z"
  const now = Date.now();

  const workbook: WorkbookCache = {
    id,
    name,
    updated_at: now,
  };

  await idb.put("workbooks", workbook);
  return workbook;
}

/** Get a workbook from cache by ID */
export async function getWorkbookCache(id: string): Promise<WorkbookCache | null> {
  try {
    const idb = await getIdb();
    return (await idb.get("workbooks", id)) || null;
  } catch {
    return null;
  }
}

/** List all workbooks from cache, sorted by updated_at */
export async function listWorkbooks(): Promise<WorkbookCache[]> {
  try {
    const idb = await getIdb();
    const all = await idb.getAll("workbooks");
    return all.sort((a, b) => b.updated_at - a.updated_at);
  } catch {
    return [];
  }
}

/** Update workbook cache entry (sync from SQLite) */
export async function updateWorkbookCache(id: string, name: string): Promise<void> {
  const idb = await getIdb();
  await idb.put("workbooks", { id, name, updated_at: Date.now() });
}

/** Get workbook ID from URL path: /w/:id */
export function getWorkbookIdFromUrl(): string | null {
  const path = window.location.pathname;
  const match = path.match(/^\/w\/([^/]+)/);
  return match ? match[1] : null;
}

/** Get the ID of the last opened workbook (for redirect routing) */
export async function getLastOpenedWorkbookId(): Promise<string | null> {
  const workbook = await getLastWorkbook();
  return workbook?.id || null;
}

/** Delete a workbook from cache */
export async function deleteWorkbookCache(id: string): Promise<void> {
  const idb = await getIdb();
  await idb.delete("workbooks", id);
  // Note: SQLite database (pages, tables) is in OPFS at hands-{id}.sqlite3
  // OPFS cleanup would require navigator.storage.getDirectory() access
  // For now, orphaned OPFS files may remain - they're scoped to the workbook ID
}

/** Cleanup empty workbooks from previous sessions (no-op for now) */
export function cleanupEmptyWorkbooks(): void {
  // No-op: cleanup logic would need to check SQLite for empty workbooks
}
