/**
 * Domain Data Hook
 *
 * Consumes domains from tRPC domains.list endpoint.
 * Domains are non-relation tables treated as first-class entities.
 *
 * Note: Domains come from workbook-server's direct SQLite access,
 * so they're available immediately without waiting for runtime.
 */

import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import type { Domain } from "../types";

export interface DomainDataOptions {
  /** Search query to filter domains */
  searchQuery?: string;
}

export function useDomainData(options: DomainDataOptions = {}) {
  const { searchQuery = "" } = options;

  // Get domains from tRPC (polls for live updates)
  const { data: domainsData, isLoading } = trpc.domains.list.useQuery(undefined, {
    refetchInterval: 2000,
  });

  // Map to Domain type
  const domains: Domain[] = useMemo(() => {
    if (!domainsData?.domains) return [];

    return domainsData.domains.map((d) => ({
      id: d.id,
      name: d.name,
      columns: d.columns,
      schemaHash: d.schemaHash,
      foreignKeys: d.foreignKeys,
      relatedDomains: d.relatedDomains,
      hasPage: d.hasPage,
      pagePath: d.pagePath,
      pageId: d.pageId,
      icon: d.icon,
      syncStatus: d.syncStatus,
    }));
  }, [domainsData?.domains]);

  // Filter by search
  const filteredDomains = useMemo(() => {
    if (!searchQuery) return domains;
    const query = searchQuery.toLowerCase();
    return domains.filter(
      (d) => d.name.toLowerCase().includes(query) || d.id.toLowerCase().includes(query),
    );
  }, [domains, searchQuery]);

  return {
    domains: filteredDomains,
    allDomains: domains,
    isLoading,
    hasDomains: domains.length > 0,
  };
}

export type DomainData = ReturnType<typeof useDomainData>;
