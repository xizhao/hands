/**
 * Sidebar State Hook
 *
 * Manages expansion state for sections and folders.
 * Uses module-level state to persist across route navigation.
 */

import { useSyncExternalStore, useCallback } from "react";

// ============================================================================
// Module-level state (persists across navigation)
// ============================================================================

// Section expansion state
let pagesExpanded = true;
let dataExpanded = true;
let actionsExpanded = true;
let pluginsExpanded = true;

// Folder/source expansion state
let expandedFolders = new Set<string>();
let expandedSources = new Set<string>();

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
  pagesExpanded = true;
  dataExpanded = true;
  actionsExpanded = true;
  pluginsExpanded = true;
  expandedFolders = new Set();
  expandedSources = new Set();
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

export function useSidebarState(_options: SidebarStateOptions = {}) {
  const state = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

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
      pages: { expanded: state.pagesExpanded, toggle: togglePagesExpanded },
      data: { expanded: state.dataExpanded, toggle: toggleDataExpanded },
      actions: { expanded: state.actionsExpanded, toggle: toggleActionsExpanded },
      plugins: { expanded: state.pluginsExpanded, toggle: togglePluginsExpanded },
    },
    // Folder states
    folders: {
      toggle: toggleFolder,
      isExpanded: isFolderExpanded,
    },
    // Source states
    sources: {
      toggle: toggleSource,
      isExpanded: isSourceExpanded,
    },
    // Reset function
    reset: resetSidebarState,
  };
}

export type SidebarState = ReturnType<typeof useSidebarState>;
