/**
 * Navigation state - Module-level state + server persistence
 *
 * Module state: tab, session (persists across navigation)
 * Server persistence: sidebarWidth, activeTab
 *
 * Note: chatExpanded is managed by useChatState.ts
 *
 * This approach keeps UI state independent of URL routing,
 * so navigating between pages doesn't lose sidebar state.
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { trpc } from "@/lib/trpc";

// Types
export type TabId = "sources" | "data" | "insights" | "preview";

/** URL search params for navigation */
export interface NavSearchParams {
  panel?: "chat" | undefined;
  tab?: TabId | undefined;
  session?: string | undefined;
}

// ============================================
// Module-level state (persists across navigation)
// ============================================

let activeTab: TabId = "preview";
let activeSession: string | null = null;
let sidebarWidth = 280;
let stateInitialized = false;

interface NavStateSnapshot {
  activeTab: TabId;
  activeSession: string | null;
  sidebarWidth: number;
}

let snapshot: NavStateSnapshot = {
  activeTab,
  activeSession,
  sidebarWidth,
};

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
  snapshot = {
    activeTab,
    activeSession,
    sidebarWidth,
  };
  for (const listener of listeners) {
    listener();
  }
}

// Debounce helper for server sync
let syncTimeout: ReturnType<typeof setTimeout> | null = null;
let pendingSyncFn: (() => void) | null = null;

function debouncedSync(fn: () => void, delay = 300) {
  pendingSyncFn = fn;
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    pendingSyncFn?.();
    pendingSyncFn = null;
    syncTimeout = null;
  }, delay);
}

// Setters
export function setActiveTabState(tab: TabId) {
  activeTab = tab;
  emitChange();
}

export function setActiveSessionState(sessionId: string | null) {
  activeSession = sessionId;
  emitChange();
}

export function setSidebarWidthState(width: number) {
  sidebarWidth = width;
  emitChange();
}

/** Initialize from server state */
export function initializeFromServer(serverState: {
  sidebarWidth: number;
  activeTab: string;
}) {
  if (stateInitialized) return;
  sidebarWidth = serverState.sidebarWidth;
  activeTab = (serverState.activeTab as TabId) ?? "preview";
  stateInitialized = true;
  emitChange();
}

/** Reset navigation state (e.g., when switching workbooks) */
export function resetNavState() {
  activeTab = "preview";
  activeSession = null;
  stateInitialized = false;
  // Note: sidebarWidth preserved across workbook switches
  emitChange();
}

// ============================================
// Hooks (use module-level state + server sync)
// ============================================

/**
 * Hook to initialize state from server on mount
 * Should be called once at the app root level
 */
export function useEditorStateSync() {
  const { data: serverState } = trpc.editorState.getUiState.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const updateMutation = trpc.editorState.updateUiState.useMutation();

  // Initialize from server state on first load
  useEffect(() => {
    if (serverState && !stateInitialized) {
      initializeFromServer(serverState);
    }
  }, [serverState]);

  // Return the mutation for other hooks to use
  return { updateMutation };
}

export function useActiveTab() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const updateMutation = trpc.editorState.updateUiState.useMutation();

  const setTab = useCallback((newTab: TabId) => {
    setActiveTabState(newTab);
    debouncedSync(() => {
      updateMutation.mutate({ activeTab: newTab });
    });
  }, [updateMutation]);

  return { tab: state.activeTab, setTab };
}

export function useActiveSession() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setSession = useCallback((newSessionId: string | null) => {
    setActiveSessionState(newSessionId);
    // Session is ephemeral, no server sync needed
  }, []);

  return { sessionId: state.activeSession, setSession };
}

export function useSidebarWidth() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const updateMutation = trpc.editorState.updateUiState.useMutation();

  const setWidth = useCallback((width: number) => {
    setSidebarWidthState(width);
    // Debounce sync to server (sidebar resizing is frequent)
    debouncedSync(() => {
      updateMutation.mutate({ sidebarWidth: width });
    }, 500);
  }, [updateMutation]);

  return { width: state.sidebarWidth, setWidth };
}

// ============================================
// Navigation reset (for workbook switching)
// ============================================

/**
 * Clears navigation state and navigates to root.
 * Used when switching workbooks to ensure clean state.
 */
export function useClearNavigation() {
  const navigate = useNavigate();

  return useCallback(() => {
    resetNavState();
    navigate({
      to: "/",
      replace: true,
    });
  }, [navigate]);
}
