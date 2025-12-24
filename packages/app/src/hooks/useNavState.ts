/**
 * Navigation state - Module-level state + localStorage
 *
 * Module state: panel, tab, session (persists across navigation)
 * localStorage: chatExpanded (ephemeral preference)
 *
 * This approach keeps UI state independent of URL routing,
 * so navigating between pages doesn't lose sidebar state.
 */

import { useNavigate } from "@tanstack/react-router";
import { useCallback, useSyncExternalStore } from "react";

// Types
export type RightPanelId = "sources" | "database" | "settings" | "alerts" | "blocks" | null;
export type TabId = "sources" | "data" | "insights" | "preview";

// Search params schema (kept for backwards compat, but not used for state)
export interface NavSearchParams {
  panel?: RightPanelId;
  tab?: TabId;
  session?: string;
}

// LocalStorage keys
const CHAT_EXPANDED_KEY = "hands-chat-expanded";

// ============================================
// Module-level state (persists across navigation)
// ============================================

let rightPanel: RightPanelId = null;
let activeTab: TabId = "preview";
let activeSession: string | null = null;
let sidebarWidth = 280;

interface NavStateSnapshot {
  rightPanel: RightPanelId;
  activeTab: TabId;
  activeSession: string | null;
  sidebarWidth: number;
}

let snapshot: NavStateSnapshot = {
  rightPanel,
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
    rightPanel,
    activeTab,
    activeSession,
    sidebarWidth,
  };
  for (const listener of listeners) {
    listener();
  }
}

// Setters
export function setRightPanelState(panel: RightPanelId) {
  rightPanel = panel;
  emitChange();
}

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

/** Reset navigation state (e.g., when switching workbooks) */
export function resetNavState() {
  rightPanel = null;
  activeTab = "preview";
  activeSession = null;
  // Note: sidebarWidth preserved across workbook switches
  emitChange();
}

// ============================================
// Hooks (use module-level state)
// ============================================

export function useRightPanel() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setPanel = useCallback((newPanel: RightPanelId) => {
    setRightPanelState(newPanel);
  }, []);

  const togglePanel = useCallback((targetPanel: Exclude<RightPanelId, null>) => {
    setRightPanelState(rightPanel === targetPanel ? null : targetPanel);
  }, []);

  return { panel: state.rightPanel, setPanel, togglePanel };
}

export function useActiveTab() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setTab = useCallback((newTab: TabId) => {
    setActiveTabState(newTab);
  }, []);

  return { tab: state.activeTab, setTab };
}

export function useActiveSession() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setSession = useCallback((newSessionId: string | null) => {
    setActiveSessionState(newSessionId);
  }, []);

  return { sessionId: state.activeSession, setSession };
}

export function useSidebarWidth() {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const setWidth = useCallback((width: number) => {
    setSidebarWidthState(width);
  }, []);

  return { width: state.sidebarWidth, setWidth };
}

// ============================================
// localStorage-based state (preferences)
// ============================================

function subscribeChatExpanded(callback: () => void) {
  const handler = (e: StorageEvent) => {
    if (e.key === CHAT_EXPANDED_KEY) callback();
  };
  window.addEventListener("storage", handler);
  // Also listen for our custom event for same-tab updates
  window.addEventListener("chat-expanded-change", callback);
  return () => {
    window.removeEventListener("storage", handler);
    window.removeEventListener("chat-expanded-change", callback);
  };
}

function getChatExpanded() {
  try {
    return localStorage.getItem(CHAT_EXPANDED_KEY) === "true";
  } catch {
    return false;
  }
}

export function useChatExpanded() {
  const expanded = useSyncExternalStore(subscribeChatExpanded, getChatExpanded, () => false);

  const setExpanded = useCallback((value: boolean) => {
    localStorage.setItem(CHAT_EXPANDED_KEY, String(value));
    window.dispatchEvent(new Event("chat-expanded-change"));
  }, []);

  return { expanded, setExpanded };
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
