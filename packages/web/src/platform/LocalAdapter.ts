/**
 * Local Platform Adapter
 *
 * Platform adapter for fully local browser execution with BYOK.
 * Uses official sqlite-wasm for in-browser SQLite with OPFS persistence.
 */

import type {
  HistoryEntry,
  PersistenceStatus,
  PlatformAdapter,
  RuntimeConnection,
  RuntimeStatus,
  SaveResult,
  Workbook,
} from "@hands/app/platform";
import { openDB, type IDBPDatabase } from "idb";

// ============================================================================
// Types
// ============================================================================

interface LocalWorkbookData {
  id: string;
  name: string;
  description?: string;
  created_at: number;
  updated_at: number;
  last_opened_at: number;
}

interface LocalPageData {
  workbookId: string;
  path: string;
  content: string;
  updated_at: number;
}

interface LocalDBSchema {
  workbooks: {
    key: string;
    value: LocalWorkbookData;
    indexes: { "by-updated": number };
  };
  pages: {
    key: string;
    value: LocalPageData;
    indexes: { "by-workbook": string };
  };
  settings: {
    key: string;
    value: unknown;
  };
}

// ============================================================================
// IndexedDB Setup (for workbook metadata, pages, settings - NOT SQLite data)
// ============================================================================

const DB_NAME = "hands-local";
const DB_VERSION = 1;

let idbPromise: Promise<IDBPDatabase<LocalDBSchema>> | null = null;

async function getIdb(): Promise<IDBPDatabase<LocalDBSchema>> {
  if (!idbPromise) {
    idbPromise = openDB<LocalDBSchema>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains("workbooks")) {
          const workbooksStore = db.createObjectStore("workbooks", { keyPath: "id" });
          workbooksStore.createIndex("by-updated", "updated_at");
        }
        if (!db.objectStoreNames.contains("pages")) {
          const pagesStore = db.createObjectStore("pages", { keyPath: ["workbookId", "path"] });
          pagesStore.createIndex("by-workbook", "workbookId");
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
// Page Storage
//
// NOTE: API key storage is handled by @hands/agent/browser
// Use getStoredConfig/setStoredConfig from there for API keys
// ============================================================================

export async function listPages(workbookId: string): Promise<LocalPageData[]> {
  const idb = await getIdb();
  return idb.getAllFromIndex("pages", "by-workbook", workbookId);
}

export async function getPage(workbookId: string, path: string): Promise<LocalPageData | undefined> {
  const idb = await getIdb();
  return idb.get("pages", [workbookId, path]);
}

export async function savePage(workbookId: string, path: string, content: string): Promise<void> {
  const idb = await getIdb();
  await idb.put("pages", {
    workbookId,
    path,
    content,
    updated_at: Date.now(),
  });
}

export async function deletePage(workbookId: string, path: string): Promise<void> {
  const idb = await getIdb();
  await idb.delete("pages", [workbookId, path]);
}

// ============================================================================
// Local Platform Adapter Factory
// ============================================================================

export function createLocalPlatformAdapter(): PlatformAdapter {
  let currentWorkbookId: string | null = null;

  return {
    // No auth needed for local mode
    auth: undefined,

    workbook: {
      list: async (): Promise<Workbook[]> => {
        const idb = await getIdb();
        const workbooks = await idb.getAll("workbooks");
        return workbooks.sort((a, b) => b.updated_at - a.updated_at);
      },

      create: async (name: string, _template?: string): Promise<Workbook> => {
        const id = `local_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        const now = Date.now();

        const workbook: LocalWorkbookData = {
          id,
          name,
          created_at: now,
          updated_at: now,
          last_opened_at: now,
        };

        const idb = await getIdb();
        await idb.put("workbooks", workbook);

        return workbook;
      },

      open: async (workbook: Workbook): Promise<RuntimeConnection> => {
        currentWorkbookId = workbook.id;

        // Update last opened
        const idb = await getIdb();
        const existing = await idb.get("workbooks", workbook.id);
        if (existing) {
          existing.last_opened_at = Date.now();
          await idb.put("workbooks", existing);
        }

        // Database is opened by LocalDatabaseProvider
        return {
          workbookId: workbook.id,
          // Use sentinel value (1) for local mode - must be truthy for UI checks
          port: 1,
          tRpcUrl: "", // No tRPC - direct database access via local router
          status: "running",
        };
      },

      update: async (workbook: Workbook): Promise<Workbook> => {
        const idb = await getIdb();
        const existing = await idb.get("workbooks", workbook.id);
        if (!existing) {
          throw new Error(`Workbook not found: ${workbook.id}`);
        }

        const updated: LocalWorkbookData = {
          ...existing,
          name: workbook.name,
          description: workbook.description,
          updated_at: Date.now(),
        };

        await idb.put("workbooks", updated);
        return updated;
      },

      delete: async (id: string): Promise<void> => {
        const idb = await getIdb();

        // Delete workbook metadata
        await idb.delete("workbooks", id);

        // Delete all pages
        const pages = await idb.getAllFromIndex("pages", "by-workbook", id);
        for (const page of pages) {
          await idb.delete("pages", [id, page.path]);
        }

        // Note: SQLite database in OPFS is deleted separately if needed
      },
    },

    runtime: {
      getStatus: async (): Promise<RuntimeStatus | null> => {
        if (!currentWorkbookId) return null;

        const idb = await getIdb();
        const workbook = await idb.get("workbooks", currentWorkbookId);

        return {
          running: true,
          workbook_id: currentWorkbookId,
          directory: undefined, // No directory in browser - must match SSE events
          // Use a sentinel value (1) to indicate "local mode" - no real server
          runtime_port: 1,
          message: workbook ? "Local mode active" : "Workbook not found",
        };
      },

      isReady: async (): Promise<boolean> => {
        // In web/local mode, runtime is always ready when a workbook is selected
        return currentWorkbookId !== null;
      },

      stop: async (_workbookId: string): Promise<void> => {
        // Database is closed by LocalDatabaseProvider
        currentWorkbookId = null;
      },

      eval: async (_workbookId: string): Promise<unknown> => {
        // No-op in local mode
        return null;
      },
    },

    storage: {
      get: async <T>(key: string): Promise<T | null> => {
        const idb = await getIdb();
        const value = await idb.get("settings", key);
        return (value as T) || null;
      },

      set: async <T>(key: string, value: T): Promise<void> => {
        const idb = await getIdb();
        await idb.put("settings", value, key);
      },

      delete: async (key: string): Promise<void> => {
        const idb = await getIdb();
        await idb.delete("settings", key);
      },
    },

    // File picker using HTML5 File API
    fs: {
      pickFile: async (options?: { filters?: Array<{ name: string; extensions: string[] }> }): Promise<string | null> => {
        return new Promise((resolve) => {
          const input = document.createElement("input");
          input.type = "file";

          if (options?.filters) {
            const accept = options.filters
              .flatMap((f) => f.extensions.map((ext) => `.${ext}`))
              .join(",");
            input.accept = accept;
          }

          input.onchange = () => {
            const file = input.files?.[0];
            if (file) {
              resolve(file.name);
            } else {
              resolve(null);
            }
          };

          input.oncancel = () => resolve(null);
          input.click();
        });
      },

      pickDirectory: async (): Promise<string | null> => {
        return null;
      },
    },

    window: undefined,
    windowEvents: undefined,
    server: undefined,

    ai: {
      // Direct LLM calls from browser - no proxy URL needed
      getOpenCodeUrl: () => "",
    },

    persistence: {
      getStatus: async (): Promise<PersistenceStatus> => {
        // In web mode, data is always auto-saved to OPFS
        // No "unsaved changes" concept
        return {
          hasChanges: false,
          lastSaved: Date.now(), // Always "just saved"
          canSync: false, // No cloud sync in local mode
        };
      },

      save: async (_message?: string): Promise<SaveResult | null> => {
        // In web mode, data is auto-saved to OPFS
        // This is a no-op that returns the current "save" state
        return {
          id: `auto_${Date.now()}`,
          message: "Auto-saved",
          timestamp: Date.now(),
        };
      },

      getHistory: async (_limit?: number): Promise<HistoryEntry[]> => {
        // No history in web mode (no git)
        return [];
      },

      revert: async (_entryId: string): Promise<void> => {
        // No revert in web mode
        throw new Error("Revert not available in web mode");
      },

      // No sync in local web mode
      sync: undefined,
    },

    platform: "web",
    capabilities: {
      localFiles: false,
      nativeMenus: false,
      offlineSupport: true,
      cloudSync: false,
      authentication: false,
    },
  };
}
