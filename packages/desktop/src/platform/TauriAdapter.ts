/**
 * Tauri Platform Adapter
 *
 * Implements the PlatformAdapter interface for the Tauri desktop app.
 * Wraps all Tauri-specific functionality (IPC, window management, file system, etc.)
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
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { open } from "@tauri-apps/plugin-dialog";
import { load, type Store } from "@tauri-apps/plugin-store";

// ============================================================================
// Tauri-specific types
// ============================================================================

interface TauriRuntimeStatus {
  running: boolean;
  workbook_id: string;
  directory: string;
  runtime_port: number;
  message: string;
}

// ============================================================================
// Storage Singleton
// ============================================================================

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await load("settings.json", { autoSave: true, defaults: {} });
  }
  return storeInstance;
}

// ============================================================================
// Runtime Port Tracking (for persistence/tRPC calls)
// ============================================================================

let currentRuntimePort: number | null = null;

function getPort(): number {
  if (!currentRuntimePort) {
    throw new Error("Runtime not connected");
  }
  return currentRuntimePort;
}

// ============================================================================
// Git tRPC Helpers
// ============================================================================

interface GitStatus {
  isRepo: boolean;
  branch: string | null;
  hasChanges: boolean;
  staged: string[];
  unstaged: string[];
  untracked: string[];
  remote: string | null;
  ahead: number;
  behind: number;
}

interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  email: string;
  date: string;
  timestamp: number;
}

async function gitQuery<T>(path: string, input?: unknown): Promise<T> {
  const port = getPort();
  const url = input
    ? `http://localhost:${port}/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`
    : `http://localhost:${port}/trpc/${path}`;

  const res = await fetch(url);
  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.message || `tRPC ${path} failed`);
  }

  const data = await res.json();
  return data.result?.data as T;
}

async function gitMutation<T>(path: string, input?: unknown): Promise<T> {
  const port = getPort();
  const res = await fetch(`http://localhost:${port}/trpc/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input ?? {}),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ message: "Request failed" }));
    throw new Error(error.error?.message || error.message || `tRPC ${path} failed`);
  }

  const data = await res.json();
  return data.result?.data as T;
}

// ============================================================================
// Tauri Platform Adapter
// ============================================================================

const appWindow = getCurrentWindow();

export const TauriPlatformAdapter: PlatformAdapter = {
  // No auth on desktop (local mode)
  auth: undefined,

  workbook: {
    list: async (): Promise<Workbook[]> => {
      return invoke<Workbook[]>("list_workbooks");
    },

    create: async (name: string, template?: string): Promise<Workbook> => {
      return invoke<Workbook>("create_workbook", {
        request: { name, template },
      });
    },

    open: async (workbook: Workbook): Promise<RuntimeConnection> => {
      console.log("[TauriAdapter] open() called for:", workbook.id);

      // Update last_opened_at
      const updated: Workbook = {
        ...workbook,
        last_opened_at: Date.now(),
        updated_at: Date.now(),
      };
      console.log("[TauriAdapter] Calling update_workbook...");
      await invoke("update_workbook", { workbook: updated });
      console.log("[TauriAdapter] update_workbook done");

      // Start runtime
      console.log("[TauriAdapter] Calling start_workbook_server...");
      const status = await invoke<TauriRuntimeStatus>("start_workbook_server", {
        workbookId: workbook.id,
        directory: workbook.directory,
      });
      console.log("[TauriAdapter] start_workbook_server done:", status);

      // Set active workbook (restarts OpenCode) - fire and forget, don't block UI
      // The workbook runtime is already running, this just configures the AI server
      console.log("[TauriAdapter] Calling set_active_workbook (non-blocking)...");
      invoke("set_active_workbook", { workbookId: workbook.id })
        .then(() => console.log("[TauriAdapter] set_active_workbook done"))
        .catch((err) => console.error("[TauriAdapter] set_active_workbook error:", err));

      // Store port for persistence/tRPC calls
      currentRuntimePort = status.runtime_port;

      return {
        workbookId: workbook.id,
        port: status.runtime_port,
        tRpcUrl: `http://localhost:${status.runtime_port}/trpc`,
        status: status.running ? "running" : "stopped",
      };
    },

    update: async (workbook: Workbook): Promise<Workbook> => {
      await invoke("update_workbook", { workbook });
      return workbook;
    },

    delete: async (id: string): Promise<void> => {
      await invoke<boolean>("delete_workbook", { id });
    },
  },

  runtime: {
    getStatus: async (): Promise<RuntimeStatus | null> => {
      const status = await invoke<TauriRuntimeStatus | null>("get_active_runtime");
      if (!status) return null;
      return {
        running: status.running,
        workbook_id: status.workbook_id,
        directory: status.directory,
        runtime_port: status.runtime_port,
        message: status.message,
      };
    },

    isReady: async (): Promise<boolean> => {
      const status = await invoke<TauriRuntimeStatus | null>("get_active_runtime");
      return !!(status?.runtime_port && status.runtime_port > 0);
    },

    stop: async (workbookId: string): Promise<void> => {
      await invoke<void>("stop_runtime", { workbookId });
    },

    eval: async (workbookId: string): Promise<unknown> => {
      return invoke("runtime_eval", { workbookId });
    },
  },

  fs: {
    pickFile: async (options): Promise<string | null> => {
      const result = await open({
        multiple: false,
        filters: options?.filters,
        defaultPath: options?.defaultPath,
        title: options?.title,
      });
      return result as string | null;
    },

    pickDirectory: async (): Promise<string | null> => {
      const result = await open({ directory: true });
      return result as string | null;
    },
  },

  window: {
    minimize: () => {
      appWindow.minimize();
    },
    maximize: () => {
      appWindow.toggleMaximize();
    },
    close: () => {
      appWindow.close();
    },
    setTitle: (title: string) => {
      appWindow.setTitle(title);
    },
    isMaximized: () => appWindow.isMaximized(),
    isFullscreen: () => appWindow.isFullscreen(),
    toggleFullscreen: async () => {
      const isFullscreen = await appWindow.isFullscreen();
      await appWindow.setFullscreen(!isFullscreen);
    },
  },

  windowEvents: {
    onResize: (callback: () => void): (() => void) => {
      let unlisten: (() => void) | null = null;

      appWindow
        .onResized(() => {
          callback();
        })
        .then((fn) => {
          unlisten = fn;
        });

      return () => {
        unlisten?.();
      };
    },
  },

  storage: {
    get: async <T>(key: string): Promise<T | null> => {
      const store = await getStore();
      const value = await store.get<T>(key);
      return value ?? null;
    },

    set: async <T>(key: string, value: T): Promise<void> => {
      const store = await getStore();
      await store.set(key, value);
    },

    delete: async (key: string): Promise<void> => {
      const store = await getStore();
      await store.delete(key);
    },
  },

  server: {
    restart: async (): Promise<{ healthy: boolean; message: string }> => {
      return invoke<{ healthy: boolean; message: string }>("restart_server");
    },

    health: async (): Promise<{ healthy: boolean; message: string }> => {
      return invoke<{ healthy: boolean; message: string }>("health_check");
    },
  },

  navigation: {
    navigateInWorkbook: async (workbookId: string, route: string): Promise<void> => {
      await invoke("navigate_in_workbook", { workbookId, route });
    },

    onNavigate: (callback: (route: string) => void): (() => void) => {
      let unlisten: (() => void) | null = null;

      listen<string>("navigate", (event) => {
        callback(event.payload);
      }).then((fn) => {
        unlisten = fn;
      });

      return () => {
        unlisten?.();
      };
    },
  },

  ai: {
    getOpenCodeUrl: () => "http://localhost:4096",
  },

  persistence: {
    getStatus: async (): Promise<PersistenceStatus> => {
      try {
        const status = await gitQuery<GitStatus>("git.status");
        return {
          hasChanges: status.hasChanges,
          lastSaved: null, // Git doesn't track this easily
          canSync: status.isRepo,
          remote: status.remote
            ? {
                url: status.remote,
                ahead: status.ahead,
                behind: status.behind,
              }
            : undefined,
        };
      } catch {
        // Runtime not ready or git not initialized
        return {
          hasChanges: false,
          lastSaved: null,
          canSync: false,
        };
      }
    },

    save: async (message?: string): Promise<SaveResult | null> => {
      const result = await gitMutation<{ hash: string; message: string } | null>("git.save", {
        message,
      });
      if (!result) return null;
      return {
        id: result.hash,
        message: result.message,
        timestamp: Date.now(),
      };
    },

    getHistory: async (limit = 50): Promise<HistoryEntry[]> => {
      try {
        const commits = await gitQuery<GitCommit[]>("git.history", { limit });
        return commits.map((c) => ({
          id: c.hash,
          shortId: c.shortHash,
          message: c.message,
          author: c.author,
          timestamp: c.timestamp,
        }));
      } catch {
        return [];
      }
    },

    revert: async (entryId: string): Promise<void> => {
      await gitMutation("git.revert", { hash: entryId });
    },

    sync: {
      push: async (): Promise<void> => {
        await gitMutation("git.push");
      },

      pull: async (): Promise<void> => {
        await gitMutation("git.pull");
      },

      getRemote: async (): Promise<string | null> => {
        try {
          const status = await gitQuery<GitStatus>("git.status");
          return status.remote;
        } catch {
          return null;
        }
      },

      setRemote: async (url: string): Promise<void> => {
        await gitMutation("git.setRemote", { url });
      },
    },
  },

  platform: "desktop",

  capabilities: {
    localFiles: true,
    nativeMenus: true,
    offlineSupport: true,
    cloudSync: false,
    authentication: false,
  },
};
