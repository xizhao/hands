/**
 * Sidebar State Hook
 *
 * Manages expansion state for sections and folders.
 * Uses module-level state for instant reactivity + server persistence.
 */

import { useSyncExternalStore, useCallback, useEffect } from "react";
import { trpc } from "@/lib/trpc";

// ============================================================================
// Module-level state (persists across navigation)
// ============================================================================

// Section expansion state (synced from server)
let pagesExpanded = false;
let dataExpanded = false;
let actionsExpanded = false;
let pluginsExpanded = false;

// Folder/source expansion state (synced from server)
let expandedFolders = new Set<string>();
let expandedSources = new Set<string>();

// Track if we've initialized from server
let sidebarStateInitialized = false;

// Snapshot type
interface SidebarStateSnapshot {
  pagesExpanded: boolean;
  dataExpanded: boolean;
  actionsExpanded: boolean;
  pluginsExpanded: boolean;
  expandedFolders: Set<string>;
  expandedSources: Set<string>;
}

// Cached snapshot - only recreate when state changes
let snapshot: SidebarStateSnapshot = {
  pagesExpanded,
  dataExpanded,
  actionsExpanded,
  pluginsExpanded,
  expandedFolders,
  expandedSources,
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
  snapshot = {
    pagesExpanded,
    dataExpanded,
    actionsExpanded,
    pluginsExpanded,
    expandedFolders,
    expandedSources,
  };
  for (const listener of listeners) {
    listener();
  }
}

/** Initialize sidebar state from server */
export function initializeSidebarFromServer(serverState: {
  pagesExpanded: boolean;
  dataExpanded: boolean;
  actionsExpanded: boolean;
  pluginsExpanded: boolean;
  expandedFolders: string[];
  expandedSources: string[];
}) {
  if (sidebarStateInitialized) return;
  pagesExpanded = serverState.pagesExpanded;
  dataExpanded = serverState.dataExpanded;
  actionsExpanded = serverState.actionsExpanded;
  pluginsExpanded = serverState.pluginsExpanded;
  expandedFolders = new Set(serverState.expandedFolders);
  expandedSources = new Set(serverState.expandedSources);
  sidebarStateInitialized = true;
  emitChange();
}

// ============================================================================
// Setters (exported for direct access if needed)
// ============================================================================

export function togglePagesExpanded() {
  pagesExpanded = !pagesExpanded;
  emitChange();
}

export function toggleDataExpanded() {
  dataExpanded = !dataExpanded;
  emitChange();
}

export function toggleActionsExpanded() {
  actionsExpanded = !actionsExpanded;
  emitChange();
}

export function togglePluginsExpanded() {
  pluginsExpanded = !pluginsExpanded;
  emitChange();
}

export function toggleFolder(folderId: string) {
  const next = new Set(expandedFolders);
  if (next.has(folderId)) {
    next.delete(folderId);
  } else {
    next.add(folderId);
  }
  expandedFolders = next;
  emitChange();
}

export function toggleSource(sourceId: string) {
  const next = new Set(expandedSources);
  if (next.has(sourceId)) {
    next.delete(sourceId);
  } else {
    next.add(sourceId);
  }
  expandedSources = next;
  emitChange();
}

/** Reset all sidebar state (e.g., when switching workbooks) */
export function resetSidebarState() {
  pagesExpanded = false;
  dataExpanded = false;
  actionsExpanded = false;
  pluginsExpanded = false;
  expandedFolders = new Set();
  expandedSources = new Set();
  sidebarStateInitialized = false;
  emitChange();
}

// ============================================================================
// Hook
// ============================================================================

export interface SidebarStateOptions {
  /** Initially expanded sections (only used on first mount if state is default) */
  defaultExpanded?: {
    pages?: boolean;
    data?: boolean;
    actions?: boolean;
    plugins?: boolean;
  };
}

/**
 * Hook to initialize sidebar state from server on mount
 * Should be called once at the app root level
 */
export function useSidebarStateSync() {
  const { data: uiState } = trpc.editorState.getUiState.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const { data: serverFolders } = trpc.editorState.getExpandedFolders.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  const { data: serverSources } = trpc.editorState.getExpandedSources.useQuery(undefined, {
    staleTime: Number.POSITIVE_INFINITY,
    refetchOnWindowFocus: false,
  });

  // Initialize from server state on first load
  useEffect(() => {
    if (uiState && serverFolders && serverSources && !sidebarStateInitialized) {
      initializeSidebarFromServer({
        pagesExpanded: uiState.pagesExpanded,
        dataExpanded: uiState.dataExpanded,
        actionsExpanded: uiState.actionsExpanded,
        pluginsExpanded: uiState.pluginsExpanded,
        expandedFolders: serverFolders,
        expandedSources: serverSources,
      });
    }
  }, [uiState, serverFolders, serverSources]);
}

export function useSidebarState(_options: SidebarStateOptions = {}) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  // Mutations for server sync
  const updateUiMutation = trpc.editorState.updateUiState.useMutation();
  const setFolderMutation = trpc.editorState.setFolderExpanded.useMutation();
  const setSourceMutation = trpc.editorState.setSourceExpanded.useMutation();

  const togglePagesWithSync = useCallback(() => {
    togglePagesExpanded();
    updateUiMutation.mutate({ pagesExpanded: !state.pagesExpanded });
  }, [state.pagesExpanded, updateUiMutation]);

  const toggleDataWithSync = useCallback(() => {
    toggleDataExpanded();
    updateUiMutation.mutate({ dataExpanded: !state.dataExpanded });
  }, [state.dataExpanded, updateUiMutation]);

  const toggleActionsWithSync = useCallback(() => {
    toggleActionsExpanded();
    updateUiMutation.mutate({ actionsExpanded: !state.actionsExpanded });
  }, [state.actionsExpanded, updateUiMutation]);

  const togglePluginsWithSync = useCallback(() => {
    togglePluginsExpanded();
    updateUiMutation.mutate({ pluginsExpanded: !state.pluginsExpanded });
  }, [state.pluginsExpanded, updateUiMutation]);

  const toggleFolderWithSync = useCallback((folderId: string) => {
    const isCurrentlyExpanded = state.expandedFolders.has(folderId);
    toggleFolder(folderId);
    setFolderMutation.mutate({ path: folderId, expanded: !isCurrentlyExpanded });
  }, [state.expandedFolders, setFolderMutation]);

  const toggleSourceWithSync = useCallback((sourceId: string) => {
    const isCurrentlyExpanded = state.expandedSources.has(sourceId);
    toggleSource(sourceId);
    setSourceMutation.mutate({ sourceId, expanded: !isCurrentlyExpanded });
  }, [state.expandedSources, setSourceMutation]);

  const isFolderExpanded = useCallback(
    (folderId: string) => state.expandedFolders.has(folderId),
    [state.expandedFolders],
  );

  const isSourceExpanded = useCallback(
    (sourceId: string) => state.expandedSources.has(sourceId),
    [state.expandedSources],
  );

  return {
    // Section states
    sections: {
      pages: { expanded: state.pagesExpanded, toggle: togglePagesWithSync },
      data: { expanded: state.dataExpanded, toggle: toggleDataWithSync },
      actions: { expanded: state.actionsExpanded, toggle: toggleActionsWithSync },
      plugins: { expanded: state.pluginsExpanded, toggle: togglePluginsWithSync },
    },
    // Folder states
    folders: {
      toggle: toggleFolderWithSync,
      isExpanded: isFolderExpanded,
    },
    // Source states
    sources: {
      toggle: toggleSourceWithSync,
      isExpanded: isSourceExpanded,
    },
    // Reset function
    reset: resetSidebarState,
  };
}

export type SidebarState = ReturnType<typeof useSidebarState>;
