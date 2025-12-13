/**
 * useChatState - Module-level state for chat interactions
 *
 * Allows components deep in the tree to trigger chat with pending attachments
 * without prop drilling. Uses useSyncExternalStore for React integration.
 */

import { useSyncExternalStore } from "react";

// Attachment type constants - use these instead of string literals
export const ATTACHMENT_TYPE = {
  FILE: "file",
  FILEPATH: "filepath",
  BLOCK: "block",
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

export interface PendingBlockAttachment {
  type: typeof ATTACHMENT_TYPE.BLOCK;
  blockId: string;
  name: string;
  errorContext?: string;
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
  | PendingBlockAttachment
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

// Hook
export function useChatState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...state,
    setPendingAttachment,
    setChatExpanded,
    setAutoSubmitPending,
    setChatBarHidden,
    setSessionError,
    clearSessionError,
  };
}
