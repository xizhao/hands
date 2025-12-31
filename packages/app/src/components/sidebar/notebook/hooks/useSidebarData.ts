/**
 * Sidebar Data Hook
 *
 * Extracts and filters data from runtime manifest for sidebar display.
 * Domains come from tRPC, actions from manifest.
 *
 * Note: Legacy properties (pages, tables, plugins) are stubbed for backward
 * compatibility but return empty values. Use domains instead.
 */

import { useMemo } from "react";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { trpc } from "@/lib/trpc";
import type { SidebarAction, SidebarPage, SidebarPlugin, SidebarTable } from "../types";

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
  } = useRuntimeState();

  // Domains from tRPC (source of truth for tables)
  // Poll every 2 seconds for live updates when schema changes
  const { data: domainsData, isLoading: domainsLoading } = trpc.domains.list.useQuery(undefined, {
    refetchInterval: 2000,
  });
  const domains = domainsData?.domains ?? [];
  const actions: SidebarAction[] = manifest?.actions ?? [];

  // Legacy stubs - pages/tables/plugins are deprecated, use domains
  const pages: SidebarPage[] = [];
  const tables: SidebarTable[] = [];
  const plugins: SidebarPlugin[] = [];

  // Loading = waiting for manifest or domains
  const isLoading = (!manifest && !!activeWorkbookId) || domainsLoading;

  // Filter helpers
  const matchesSearch = (text: string) =>
    !searchQuery || text.toLowerCase().includes(searchQuery.toLowerCase());

  const filteredActions = useMemo(
    () => actions.filter((a) => matchesSearch(a.name ?? a.id) || matchesSearch(a.id)),
    [actions, searchQuery],
  );

  const filteredDomains = useMemo(
    () => domains.filter((d) => matchesSearch(d.name) || matchesSearch(d.id)),
    [domains, searchQuery],
  );

  // Legacy stubs for backward compatibility
  const rootPages: SidebarPage[] = [];
  const pageFolders = new Map<string, SidebarPage[]>();
  const sourceTableMap = new Map<string, string[]>();
  const unassociatedTables: string[] = [];
  const filteredPlugins: SidebarPlugin[] = [];
  const getFilteredFolderPages = () => [] as SidebarPage[];
  const getFilteredSourceTables = () => [] as string[];

  return {
    // Raw data - domains are now the primary source
    domains,
    actions,
    sources: [], // Legacy stub

    // Filtered data
    filteredDomains,
    filteredActions,

    // Legacy stubs (deprecated - use domains)
    pages,
    tables,
    plugins,
    rootPages,
    pageFolders,
    sourceTableMap,
    unassociatedTables,
    filteredPlugins,
    getFilteredFolderPages,
    getFilteredSourceTables,

    // Loading states
    isLoading,
    activeWorkbookId,

    // Counts
    hasDomains: domains.length > 0,
    hasData: domains.length > 0,
    hasActions: actions.length > 0,
    hasPages: false, // Legacy
    hasPlugins: false, // Legacy
  };
}

export type SidebarData = ReturnType<typeof useSidebarData>;
