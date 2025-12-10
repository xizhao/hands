/**
 * useChatState - Module-level state for chat interactions
 *
 * Allows components deep in the tree to trigger chat with pending attachments
 * without prop drilling. Uses useSyncExternalStore for React integration.
 */

import { useSyncExternalStore } from "react";

// Types
export interface PendingAttachment {
  type: "file";
  file: File;
  name: string;
}

export interface PendingBlockAttachment {
  type: "block";
  blockId: string;
  name: string;
  errorContext?: string;
}

// Module-level state
let pendingAttachment: PendingAttachment | PendingBlockAttachment | null = null;
let chatExpanded: boolean = false;
let autoSubmitPending: boolean = false;

// Cached snapshot - only recreate when state changes
let snapshot = { pendingAttachment, chatExpanded, autoSubmitPending };

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
  snapshot = { pendingAttachment, chatExpanded, autoSubmitPending };
  for (const listener of listeners) {
    listener();
  }
}

// Setters
export function setPendingAttachment(attachment: PendingAttachment | PendingBlockAttachment | null) {
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

// Hook
export function useChatState() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  return {
    ...state,
    setPendingAttachment,
    setChatExpanded,
    setAutoSubmitPending,
  };
}
