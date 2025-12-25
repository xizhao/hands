/**
 * Sidebar Data Hook
 *
 * Extracts and filters data from runtime manifest for sidebar display.
 */

import { useMemo } from "react";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { useSourceManagement } from "@/hooks/useSources";
import type {
  SidebarPage,
  SidebarPlugin,
  SidebarAction,
  SidebarSource,
  SidebarTable,
} from "../types";

export interface SidebarDataOptions {
  /** Search query to filter items */
  searchQuery?: string;
}

export function useSidebarData(options: SidebarDataOptions = {}) {
  const { searchQuery = "" } = options;

  // Consolidated runtime state
  const {
    workbookId: activeWorkbookId,
    manifest,
    isStarting,
    isDbBooting,
  } = useRuntimeState();

  // Source management
  const { sources } = useSourceManagement();

  // Raw data from manifest
  const tables: SidebarTable[] = manifest?.tables ?? [];
  const allPages = manifest?.pages ?? [];
  const actions: SidebarAction[] = manifest?.actions ?? [];
  const plugins: SidebarPlugin[] = manifest?.plugins ?? [];

  // Filter out blocks - they show in BlocksPanel
  const pages: SidebarPage[] = useMemo(
    () => allPages.filter((p) => !p.isBlock),
    [allPages],
  );

  // Derived loading states
  const isLoading = !manifest && !!activeWorkbookId;
  const isDbLoading = isStarting || isDbBooting;

  // Group pages by folder
  const { rootPages, pageFolders } = useMemo(() => {
    const root: SidebarPage[] = [];
    const folders = new Map<string, SidebarPage[]>();

    for (const page of pages) {
      if (!page.parentDir) {
        root.push(page);
      } else {
        if (!folders.has(page.parentDir)) {
          folders.set(page.parentDir, []);
        }
        folders.get(page.parentDir)!.push(page);
      }
    }

    return { rootPages: root, pageFolders: folders };
  }, [pages]);

  // Group tables by source
  const { sourceTableMap, unassociatedTables } = useMemo(() => {
    const tableMap = new Map<string, string[]>();
    const unassociated: string[] = [];

    if (tables.length === 0) return { sourceTableMap: tableMap, unassociatedTables: unassociated };

    for (const table of tables) {
      const tableName = table.name;
      let matched = false;

      for (const source of sources) {
        const prefix = `${source.name.toLowerCase()}_`;
        if (
          tableName.toLowerCase().startsWith(prefix) ||
          tableName.toLowerCase() === source.name.toLowerCase()
        ) {
          if (!tableMap.has(source.id)) {
            tableMap.set(source.id, []);
          }
          tableMap.get(source.id)?.push(tableName);
          matched = true;
          break;
        }
      }

      if (!matched) {
        unassociated.push(tableName);
      }
    }

    return { sourceTableMap: tableMap, unassociatedTables: unassociated };
  }, [tables, sources]);

  // Filter helpers
  const matchesSearch = (text: string) =>
    !searchQuery || text.toLowerCase().includes(searchQuery.toLowerCase());

  // Filtered data
  const filteredRootPages = useMemo(
    () => rootPages.filter((p) => matchesSearch(p.title) || matchesSearch(p.id)),
    [rootPages, searchQuery],
  );

  const filteredPlugins = useMemo(
    () => plugins.filter((p) => matchesSearch(p.name) || matchesSearch(p.id)),
    [plugins, searchQuery],
  );

  const filteredActions = useMemo(
    () => actions.filter((a) => matchesSearch(a.name ?? a.id) || matchesSearch(a.id)),
    [actions, searchQuery],
  );

  const filteredUnassociatedTables = useMemo(
    () => unassociatedTables.filter(matchesSearch),
    [unassociatedTables, searchQuery],
  );

  // Filter pages within folders
  const getFilteredFolderPages = (folderPages: SidebarPage[]) =>
    searchQuery
      ? folderPages.filter((p) => matchesSearch(p.title) || matchesSearch(p.id))
      : folderPages;

  // Filter tables within sources
  const getFilteredSourceTables = (sourceTables: string[]) =>
    searchQuery ? sourceTables.filter(matchesSearch) : sourceTables;

  return {
    // Raw data
    pages,
    actions,
    plugins,
    tables,
    sources,

    // Grouped data
    rootPages: filteredRootPages,
    pageFolders,
    sourceTableMap,
    unassociatedTables: filteredUnassociatedTables,

    // Filtered getters
    getFilteredFolderPages,
    getFilteredSourceTables,
    filteredPlugins,
    filteredActions,

    // Loading states
    isLoading,
    isDbLoading,
    activeWorkbookId,

    // Counts
    hasPages: pages.length > 0,
    hasData: sources.length > 0 || tables.length > 0,
    hasActions: actions.length > 0,
    hasPlugins: plugins.length > 0,
  };
}

export type SidebarData = ReturnType<typeof useSidebarData>;
