/**
 * Typed Event Schema
 *
 * Defines all cross-window events used in the application.
 * Provides type-safe event emission and listening.
 */

import { emit as tauriEmit, listen as tauriListen, type UnlistenFn } from "@tauri-apps/api/event";

// ============================================================================
// Event Types
// ============================================================================

/** Workbook-related events */
export interface WorkbookEvents {
  /** Emitted when active workbook changes */
  "active-workbook-changed": {
    workbook_id: string;
    workbook_dir: string;
  };
  /** Emitted when a workbook is opened in a window */
  "workbook-opened": string;
}

/** Floating chat events */
export interface FloatingChatEvents {
  /** Emitted when floating chat is ready to show */
  "floating-chat-ready": undefined;
  /** Emitted when floating chat expands */
  "floating-chat-expanded": undefined;
  /** Emitted when floating chat collapses */
  "floating-chat-collapsed": undefined;
  /** Emitted to send a prompt to floating chat */
  "floating-chat-prompt": string;
}

/** Keyboard/hotkey events */
export interface KeyboardEvents {
  /** Option key was pressed (start recording) */
  "option-key-pressed": undefined;
  /** Option key was released (stop recording) */
  "option-key-released": undefined;
  /** Option key was tapped without combo (expand + focus) */
  "option-key-tapped": undefined;
  /** Option was pressed with another key (cancel STT) */
  "option-key-cancelled": undefined;
  /** Option+Space was pressed (toggle expand/collapse) */
  "option-space-pressed": undefined;
}

/** Speech-to-text events */
export interface SttEvents {
  /** Download progress (0.0 to 1.0) */
  "stt:download-progress": number;
  /** Partial transcription result */
  "stt:partial": string;
}

/** Background job events */
export interface JobEvents {
  /** Job started */
  "job:started": string;
  /** Job completed */
  "job:completed": string;
  /** Job failed */
  "job:failed": string;
}

/** Navigation events */
export interface NavigationEvents {
  /** Navigate to a route */
  navigate: string;
  /** Open settings panel */
  "open-settings": undefined;
}

/** All application events */
export type AppEvents = WorkbookEvents &
  FloatingChatEvents &
  KeyboardEvents &
  SttEvents &
  JobEvents &
  NavigationEvents;

/** Event names */
export type AppEventName = keyof AppEvents;

// ============================================================================
// Type-Safe Event Helpers
// ============================================================================

/**
 * Emit a typed event.
 *
 * @example
 * ```ts
 * emitEvent("active-workbook-changed", { workbook_id: "123", workbook_dir: "/path" });
 * emitEvent("floating-chat-ready"); // void payload
 * ```
 */
export function emitEvent<K extends AppEventName>(event: K, payload?: AppEvents[K]): Promise<void> {
  return tauriEmit(event, payload);
}

/**
 * Listen for a typed event.
 *
 * @example
 * ```ts
 * const unlisten = await listenEvent("active-workbook-changed", (event) => {
 *   console.log(event.payload.workbook_id); // typed!
 * });
 * ```
 */
export function listenEvent<K extends AppEventName>(
  event: K,
  handler: (event: { payload: AppEvents[K] }) => void,
): Promise<UnlistenFn> {
  return tauriListen(event, handler as any);
}

/**
 * Listen for a typed event once.
 */
export function listenEventOnce<K extends AppEventName>(
  event: K,
  handler: (event: { payload: AppEvents[K] }) => void,
): Promise<UnlistenFn> {
  return tauriListen(event, (e) => {
    handler(e as any);
  });
}

// ============================================================================
// Re-export for convenience
// ============================================================================

export { tauriEmit as emit, tauriListen as listen };
