/**
 * Lightweight storage utilities for landing page and editor.
 * Tree-shakable - only import what you need.
 */

import { openDB, type IDBPDatabase } from "idb";

// ============================================================================
// Types
// ============================================================================

export interface WorkbookMeta {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  updated_at: number;
  last_opened_at: number;
}

interface StorageSchema {
  workbooks: {
    key: string;
    value: WorkbookMeta;
    indexes: { "by-updated": number };
  };
  pages: {
    key: string;
    value: { workbookId: string; path: string; content: string; updated_at: number };
    indexes: { "by-workbook": string };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

// ============================================================================
// IndexedDB
// ============================================================================

const DB_NAME = "hands-local";
const DB_VERSION = 1;

let idbPromise: Promise<IDBPDatabase<StorageSchema>> | null = null;

function getIdb(): Promise<IDBPDatabase<StorageSchema>> {
  if (!idbPromise) {
    idbPromise = openDB<StorageSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("workbooks")) {
          const store = db.createObjectStore("workbooks", { keyPath: "id" });
          store.createIndex("by-updated", "updated_at");
        }
        if (!db.objectStoreNames.contains("pages")) {
          const store = db.createObjectStore("pages", { keyPath: ["workbookId", "path"] });
          store.createIndex("by-workbook", "workbookId");
        }
        if (!db.objectStoreNames.contains("settings")) {
          db.createObjectStore("settings");
        }
      },
    });
  }
  return idbPromise;
}

// ============================================================================
// Workbook Operations (minimal for landing)
//
// NOTE: API key storage is handled by @hands/agent/browser
// Use getStoredConfig/setStoredConfig from there for API keys
// ============================================================================

/** Get last opened workbook, if any */
export async function getLastWorkbook(): Promise<WorkbookMeta | null> {
  try {
    const idb = await getIdb();
    const all = await idb.getAll("workbooks");
    if (all.length === 0) return null;
    // Sort by last_opened_at desc
    all.sort((a, b) => b.last_opened_at - a.last_opened_at);
    return all[0];
  } catch {
    return null;
  }
}

/** Check if any workbooks exist */
export async function hasWorkbooks(): Promise<boolean> {
  try {
    const idb = await getIdb();
    const count = await idb.count("workbooks");
    return count > 0;
  } catch {
    return false;
  }
}

/** Create a new workbook and return it */
export async function createWorkbook(name: string): Promise<WorkbookMeta> {
  const idb = await getIdb();
  const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
  const now = Date.now();

  const workbook: WorkbookMeta = {
    id,
    name,
    created_at: now,
    updated_at: now,
    last_opened_at: now,
  };

  await idb.put("workbooks", workbook);
  return workbook;
}

/** Get a workbook by ID */
export async function getWorkbook(id: string): Promise<WorkbookMeta | null> {
  try {
    const idb = await getIdb();
    return (await idb.get("workbooks", id)) || null;
  } catch {
    return null;
  }
}

/** List all workbooks sorted by last opened */
export async function listWorkbooks(): Promise<WorkbookMeta[]> {
  try {
    const idb = await getIdb();
    const all = await idb.getAll("workbooks");
    return all.sort((a, b) => b.last_opened_at - a.last_opened_at);
  } catch {
    return [];
  }
}

/** Get workbook ID from URL path: /w/:id */
export function getWorkbookIdFromUrl(): string | null {
  const path = window.location.pathname;
  const match = path.match(/^\/w\/([^/]+)/);
  return match ? match[1] : null;
}

/** Delete a workbook by ID */
export async function deleteWorkbook(id: string): Promise<void> {
  const idb = await getIdb();
  await idb.delete("workbooks", id);
  // Also delete all pages for this workbook
  const pages = await idb.getAllFromIndex("pages", "by-workbook", id);
  const tx = idb.transaction("pages", "readwrite");
  for (const page of pages) {
    await tx.store.delete([page.workbookId, page.path]);
  }
  await tx.done;
}
