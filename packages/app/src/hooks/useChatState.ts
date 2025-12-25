/**
 * useChatState - Module-level state for chat interactions
 *
 * Allows components deep in the tree to trigger chat with pending attachments
 * without prop drilling. Uses useSyncExternalStore for React integration.
 *
 * chatExpanded state is persisted to server via tRPC.
 */

import { useCallback, useEffect, useSyncExternalStore } from "react";
import { trpc } from "@/lib/trpc";

// Attachment type constants - use these instead of string literals
export const ATTACHMENT_TYPE = {
  FILE: "file",
  FILEPATH: "filepath",
  SOURCE: "source",
} as const;

export type AttachmentType = (typeof ATTACHMENT_TYPE)[keyof typeof ATTACHMENT_TYPE];

// Types
export interface PendingAttachment {
  type: typeof ATTACHMENT_TYPE.FILE;
  file: File;
  name: string;
}

export interface PendingFilePathAttachment {
  type: typeof ATTACHMENT_TYPE.FILEPATH;
  filePath: string;
  name: string;
}

export interface PendingSourceAttachment {
  type: typeof ATTACHMENT_TYPE.SOURCE;
  sourceId: string;
  name: string;
}

// Combined attachment type
export type AnyPendingAttachment =
  | PendingAttachment
  | PendingFilePathAttachment
  | PendingSourceAttachment;

// Session error type
export interface SessionError {
  sessionId: string;
  message: string;
  timestamp: number;
}

// Module-level state
let pendingAttachment: AnyPendingAttachment | null = null;
let chatExpanded: boolean = false;
let autoSubmitPending: boolean = false;
let chatBarHidden: boolean = false;
let sessionError: SessionError | null = null;
let chatStateInitialized: boolean = false;

// Debounce helper for server sync
let chatSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingChatSyncFn: (() => void) | null = null;

function debouncedChatSync(fn: () => void, delay = 300) {
  pendingChatSyncFn = fn;
  if (chatSyncTimeout) clearTimeout(chatSyncTimeout);
  chatSyncTimeout = setTimeout(() => {
    pendingChatSyncFn?.();
    pendingChatSyncFn = null;
    chatSyncTimeout = null;
  }, delay);
}

/** Initialize chatExpanded from server state */
export function initializeChatFromServer(serverChatExpanded: boolean) {
  if (chatStateInitialized) return;
  chatExpanded = serverChatExpanded;
  chatStateInitialized = true;
  emitChange();
}

// Snapshot type
interface ChatStateSnapshot {
  pendingAttachment: AnyPendingAttachment | null;
  chatExpanded: boolean;
  autoSubmitPending: boolean;
  chatBarHidden: boolean;
  sessionError: SessionError | null;
}

// Cached snapshot - only recreate when state changes
let snapshot: ChatStateSnapshot = {
  pendingAttachment,
  chatExpanded,
  autoSubmitPending,
  chatBarHidden,
  sessionError,
};

// Subscribers for useSyncExternalStore
let listeners: Array<() => void> = [];

function subscribe(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return snapshot;
}

function emitChange() {
  // Create new snapshot object so React detects the change
  snapshot = { pendingAttachment, chatExpanded, autoSubmitPending, chatBarHidden, sessionError };
  for (const listener of listeners) {
    listener();
  }
}

// Setters
export function setPendingAttachment(attachment: AnyPendingAttachment | null) {
  if (pendingAttachment === attachment) return;
  pendingAttachment = attachment;
  emitChange();
}

export function setChatExpanded(expanded: boolean) {
  if (chatExpanded === expanded) return;
  chatExpanded = expanded;
  emitChange();
}

export function setAutoSubmitPending(pending: boolean) {
  if (autoSubmitPending === pending) return;
  autoSubmitPending = pending;
  emitChange();
}

export function setChatBarHidden(hidden: boolean) {
  if (chatBarHidden === hidden) return;
  chatBarHidden = hidden;
  emitChange();
}

export function setSessionError(error: SessionError | null) {
  sessionError = error;
  emitChange();
}

export function clearSessionError() {
  if (sessionError === null) return;
  sessionError = null;
  emitChange();
}

/**
 * Hook to initialize chat state from server on mount
 * Should be called once at the app root level
 */
export function useChatStateSync() {
  const { data: serverState } = trpc.editorState.getUiState.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  // Initialize from server state on first load
  useEffect(() => {
    if (serverState && !chatStateInitialized) {
      initializeChatFromServer(serverState.chatExpanded);
    }
  }, [serverState]);
}

// Hook
export function useChatState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const updateMutation = trpc.editorState.updateUiState.useMutation();

  const setChatExpandedWithSync = useCallback((expanded: boolean) => {
    setChatExpanded(expanded);
    // Debounce sync to server
    debouncedChatSync(() => {
      updateMutation.mutate({ chatExpanded: expanded });
    });
  }, [updateMutation]);

  return {
    ...state,
    setPendingAttachment,
    setChatExpanded: setChatExpandedWithSync,
    setAutoSubmitPending,
    setChatBarHidden,
    setSessionError,
    clearSessionError,
  };
}
