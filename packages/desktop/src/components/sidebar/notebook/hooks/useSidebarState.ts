/**
 * Sidebar State Hook
 *
 * Manages expansion state for sections and folders.
 */

import { useCallback, useState } from "react";

export interface SidebarStateOptions {
  /** Initially expanded sections */
  defaultExpanded?: {
    pages?: boolean;
    data?: boolean;
    actions?: boolean;
    plugins?: boolean;
  };
}

export function useSidebarState(options: SidebarStateOptions = {}) {
  const { defaultExpanded = {} } = options;

  // Section expansion
  const [pagesExpanded, setPagesExpanded] = useState(defaultExpanded.pages ?? true);
  const [dataExpanded, setDataExpanded] = useState(defaultExpanded.data ?? true);
  const [actionsExpanded, setActionsExpanded] = useState(defaultExpanded.actions ?? true);
  const [pluginsExpanded, setPluginsExpanded] = useState(defaultExpanded.plugins ?? true);

  // Folder expansion (for nested items)
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [expandedSources, setExpandedSources] = useState<Set<string>>(new Set());

  const toggleFolder = useCallback((folderId: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  }, []);

  const toggleSource = useCallback((sourceId: string) => {
    setExpandedSources((prev) => {
      const next = new Set(prev);
      if (next.has(sourceId)) {
        next.delete(sourceId);
      } else {
        next.add(sourceId);
      }
      return next;
    });
  }, []);

  const isFolderExpanded = useCallback(
    (folderId: string) => expandedFolders.has(folderId),
    [expandedFolders],
  );

  const isSourceExpanded = useCallback(
    (sourceId: string) => expandedSources.has(sourceId),
    [expandedSources],
  );

  return {
    // Section states
    sections: {
      pages: { expanded: pagesExpanded, toggle: () => setPagesExpanded((v) => !v) },
      data: { expanded: dataExpanded, toggle: () => setDataExpanded((v) => !v) },
      actions: { expanded: actionsExpanded, toggle: () => setActionsExpanded((v) => !v) },
      plugins: { expanded: pluginsExpanded, toggle: () => setPluginsExpanded((v) => !v) },
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
  };
}

export type SidebarState = ReturnType<typeof useSidebarState>;
