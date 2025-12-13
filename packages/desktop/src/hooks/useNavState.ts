/**
 * Navigation state - URL search params + localStorage
 *
 * URL params: panel, tab, session (shareable/bookmarkable)
 * localStorage: chatExpanded (ephemeral preference)
 */

import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useSyncExternalStore } from "react";

// Types
export type RightPanelId = "sources" | "database" | "blocks" | "settings" | "alerts" | null;
export type TabId = "sources" | "data" | "insights" | "preview";

// Search params schema (for route definition)
export interface NavSearchParams {
  panel?: RightPanelId;
  tab?: TabId;
  session?: string;
}

// LocalStorage keys
const CHAT_EXPANDED_KEY = "hands-chat-expanded";

// ============================================
// URL-based state (via TanStack Router)
// ============================================

export function useRightPanel() {
  const search = useSearch({ strict: false }) as NavSearchParams;
  const navigate = useNavigate();

  const panel = (search.panel ?? null) as RightPanelId;

  const setPanel = useCallback(
    (newPanel: RightPanelId) => {
      navigate({
        search: ((prev: NavSearchParams) => ({
          ...prev,
          panel: newPanel ?? undefined,
        })) as never,
        replace: true,
      });
    },
    [navigate],
  );

  const togglePanel = useCallback(
    (targetPanel: Exclude<RightPanelId, null>) => {
      navigate({
        search: ((prev: NavSearchParams) => ({
          ...prev,
          panel: prev.panel === targetPanel ? undefined : targetPanel,
        })) as never,
        replace: true,
      });
    },
    [navigate],
  );

  return { panel, setPanel, togglePanel };
}

export function useActiveTab() {
  const search = useSearch({ strict: false }) as NavSearchParams;
  const navigate = useNavigate();

  const tab = (search.tab ?? "preview") as TabId;

  const setTab = useCallback(
    (newTab: TabId) => {
      navigate({
        search: ((prev: NavSearchParams) => ({
          ...prev,
          tab: newTab === "preview" ? undefined : newTab,
        })) as never,
        replace: true,
      });
    },
    [navigate],
  );

  return { tab, setTab };
}

export function useActiveSession() {
  const search = useSearch({ strict: false }) as NavSearchParams;
  const navigate = useNavigate();

  const sessionId = search.session ?? null;

  const setSession = useCallback(
    (newSessionId: string | null) => {
      navigate({
        search: ((prev: NavSearchParams) => ({
          ...prev,
          session: newSessionId ?? undefined,
        })) as never,
        replace: true,
      });
    },
    [navigate],
  );

  return { sessionId, setSession };
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
 * Clears all URL-based navigation state and navigates to root.
 * Used when switching workbooks to ensure clean state.
 */
export function useClearNavigation() {
  const navigate = useNavigate();

  return useCallback(() => {
    navigate({
      to: "/",
      search: {},
      replace: true,
    });
  }, [navigate]);
}
