/**
 * Cross-window state synchronization for Hands taskbar service.
 *
 * Uses Tauri events to sync state across multiple windows.
 */

import type { UnlistenFn } from "@tauri-apps/api/event";
import { emit, listen } from "@tauri-apps/api/event";

export interface JobInfo {
  id: string;
  workbook_id: string;
  session_id: string;
  status: "running" | "completed" | "failed" | "cancelled";
  description: string;
  started_at: number;
  updated_at: number;
}

export interface RuntimeStatus {
  workbook_id: string;
  running: boolean;
  runtime_port: number;
  active_jobs: number;
  window_count: number;
}

type StateChangeCallback<T> = (value: T) => void;

class AppStateManager {
  private listeners = new Map<string, Set<StateChangeCallback<unknown>>>();
  private unlisteners: UnlistenFn[] = [];
  private initialized = false;

  async init() {
    if (this.initialized) return;
    this.initialized = true;

    // Listen for workbook changes
    this.unlisteners.push(
      await listen("workbooks:changed", () => {
        this.notifyListeners("workbooks", undefined);
      }),
    );

    // Listen for runtime status changes
    this.unlisteners.push(
      await listen<RuntimeStatus>("runtime:status", (event) => {
        this.notifyListeners("runtime", event.payload);
      }),
    );

    // Listen for job events
    this.unlisteners.push(
      await listen<string>("job:started", (event) => {
        this.notifyListeners("jobs", { type: "started", jobId: event.payload });
      }),
    );

    this.unlisteners.push(
      await listen<string>("job:completed", (event) => {
        this.notifyListeners("jobs", { type: "completed", jobId: event.payload });
      }),
    );

    this.unlisteners.push(
      await listen<string>("job:failed", (event) => {
        this.notifyListeners("jobs", { type: "failed", jobId: event.payload });
      }),
    );

    // Listen for workbook opened
    this.unlisteners.push(
      await listen<string>("workbook-opened", (event) => {
        this.notifyListeners("workbook-opened", event.payload);
      }),
    );

    // Listen for new workbook requests
    this.unlisteners.push(
      await listen("new-workbook", () => {
        this.notifyListeners("new-workbook", undefined);
      }),
    );

    // Listen for settings open requests
    this.unlisteners.push(
      await listen("open-settings", () => {
        this.notifyListeners("open-settings", undefined);
      }),
    );
  }

  private notifyListeners(key: string, value: unknown) {
    const callbacks = this.listeners.get(key);
    if (callbacks) {
      for (const callback of callbacks) {
        callback(value);
      }
    }
  }

  /**
   * Subscribe to workbook list changes
   */
  onWorkbooksChange(callback: () => void): () => void {
    return this.subscribe("workbooks", callback);
  }

  /**
   * Subscribe to runtime status changes
   */
  onRuntimeStatus(callback: StateChangeCallback<RuntimeStatus>): () => void {
    return this.subscribe("runtime", callback as StateChangeCallback<unknown>);
  }

  /**
   * Subscribe to job changes
   */
  onJobsChange(callback: StateChangeCallback<{ type: string; jobId: string }>): () => void {
    return this.subscribe("jobs", callback as StateChangeCallback<unknown>);
  }

  /**
   * Subscribe to workbook opened events
   */
  onWorkbookOpened(callback: StateChangeCallback<string>): () => void {
    return this.subscribe("workbook-opened", callback as StateChangeCallback<unknown>);
  }

  /**
   * Subscribe to new workbook requests
   */
  onNewWorkbook(callback: () => void): () => void {
    return this.subscribe("new-workbook", callback);
  }

  /**
   * Subscribe to open settings requests
   */
  onOpenSettings(callback: () => void): () => void {
    return this.subscribe("open-settings", callback);
  }

  private subscribe(key: string, callback: StateChangeCallback<unknown>): () => void {
    let callbacks = this.listeners.get(key);
    if (!callbacks) {
      callbacks = new Set();
      this.listeners.set(key, callbacks);
    }
    callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      callbacks?.delete(callback);
    };
  }

  /**
   * Emit workbooks changed event to all windows
   */
  async notifyWorkbooksChanged() {
    await emit("workbooks:changed", undefined);
  }

  /**
   * Emit runtime status to all windows
   */
  async notifyRuntimeStatus(status: RuntimeStatus) {
    await emit("runtime:status", status);
  }

  /**
   * Cleanup listeners
   */
  async destroy() {
    for (const unlisten of this.unlisteners) {
      unlisten();
    }
    this.unlisteners = [];
    this.listeners.clear();
    this.initialized = false;
  }
}

// Singleton instance
export const appState = new AppStateManager();

// Initialize on module load
if (typeof window !== "undefined") {
  appState.init().catch(console.error);
}
