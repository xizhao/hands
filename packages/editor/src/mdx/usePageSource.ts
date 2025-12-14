/**
 * usePageSource - Source state management for the MDX Page Editor
 *
 * Handles:
 * - Source polling for external changes (linter, auto-formatter)
 * - Source mutations
 * - Version tracking for refreshes
 * - Conflict-free save/poll coordination
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { getTRPCClient } from "../trpc";
import { getCachedPageSource, setCachedPageSource } from "./cache";

// ============================================================================
// Types
// ============================================================================

export interface UsePageSourceOptions {
  pageId: string;
  runtimePort: number;
  initialSource?: string | null;
  pollInterval?: number;
  readOnly?: boolean;
}

export interface UsePageSourceReturn {
  /** Current source code */
  source: string | null;

  /** Whether a save is in progress */
  isSaving: boolean;

  /** Whether we're refreshing (have cached, fetching fresh) */
  isRefreshing: boolean;

  /** Version number (increments on external changes) */
  version: number;

  /** Current page ID (may change after rename) */
  currentPageId: string;

  /** Save source changes */
  saveSource: (newSource: string) => Promise<boolean>;

  /** Rename the page */
  renamePage: (newSlug: string) => Promise<boolean>;
}

// ============================================================================
// Hook
// ============================================================================

export function usePageSource({
  pageId,
  runtimePort,
  initialSource = null,
  pollInterval = 1000,
  readOnly = false,
}: UsePageSourceOptions): UsePageSourceReturn {
  // Initialize with cached source if available
  const cachedSource = getCachedPageSource(pageId);
  const [source, setSourceState] = useState<string | null>(initialSource ?? cachedSource);
  const [isSaving, setIsSaving] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(cachedSource !== null);
  const [version, setVersion] = useState(0);
  const [currentPageId, setCurrentPageId] = useState(pageId);

  // Track the source that's confirmed saved on server
  const confirmedServerSource = useRef<string | null>(initialSource ?? cachedSource);

  // Track pending source during save (to prevent poll overwrites)
  const pendingSource = useRef<string | null>(null);

  // Get tRPC client
  const trpcRef = useRef(getTRPCClient(runtimePort));

  // ============================================================================
  // Initial Fetch
  // ============================================================================

  useEffect(() => {
    const trpc = trpcRef.current;

    trpc.pages.getSource
      .query({ route: currentPageId })
      .then((data) => {
        setSourceState(data.source);
        setCachedPageSource(currentPageId, data.source);
        confirmedServerSource.current = data.source;
        setIsRefreshing(false);
      })
      .catch((err) => {
        console.error("[usePageSource] Failed to fetch source:", err);
        setIsRefreshing(false);
      });
  }, [currentPageId]);

  // ============================================================================
  // Polling for External Changes
  // ============================================================================

  useEffect(() => {
    let active = true;
    const trpc = trpcRef.current;

    const poll = async () => {
      // Skip polling if we have a pending save or are read-only
      if (!active || pendingSource.current !== null || readOnly) {
        return;
      }

      try {
        const data = await trpc.pages.getSource.query({ route: currentPageId });

        if (active && pendingSource.current === null) {
          // Only update if source changed externally
          if (data.source !== confirmedServerSource.current) {
            console.log("[usePageSource] Source changed externally, updating");
            setSourceState(data.source);
            setCachedPageSource(currentPageId, data.source);
            confirmedServerSource.current = data.source;
            setVersion((v) => v + 1);
          }
        }
      } catch (_e) {
        // Ignore polling errors
      }
    };

    // Initial poll after short delay
    const initialTimeout = setTimeout(poll, 100);

    // Set up interval
    const interval = setInterval(poll, pollInterval);

    return () => {
      active = false;
      clearTimeout(initialTimeout);
      clearInterval(interval);
    };
  }, [currentPageId, pollInterval, readOnly]);

  // ============================================================================
  // Save Source
  // ============================================================================

  const saveSource = useCallback(
    async (newSource: string): Promise<boolean> => {
      if (readOnly) return false;

      // Mark as pending - blocks polling
      pendingSource.current = newSource;
      setIsSaving(true);

      // Update local state immediately
      setSourceState(newSource);
      setCachedPageSource(currentPageId, newSource);

      try {
        const trpc = trpcRef.current;
        await trpc.pages.saveSource.mutate({ route: currentPageId, source: newSource });

        // Update confirmed source after server confirms
        confirmedServerSource.current = newSource;
        console.log("[usePageSource] Saved successfully");
        return true;
      } catch (err) {
        console.error("[usePageSource] Save failed:", err);
        return false;
      } finally {
        // Clear pending - allows polling to resume
        pendingSource.current = null;
        setIsSaving(false);
      }
    },
    [currentPageId, readOnly],
  );

  // ============================================================================
  // Rename Page
  // ============================================================================

  const renamePage = useCallback(
    async (newSlug: string): Promise<boolean> => {
      if (readOnly) return false;

      try {
        const trpc = trpcRef.current;
        await trpc.pages.rename.mutate({ route: currentPageId, newSlug });

        console.log("[usePageSource] Page renamed:", newSlug);

        // Update local state
        setCurrentPageId(newSlug);

        // Update URL without reloading
        const newParams = new URLSearchParams(window.location.search);
        newParams.set("pageId", newSlug);
        window.history.replaceState({}, "", `?${newParams.toString()}`);

        // Notify parent
        window.parent.postMessage(
          { type: "page-renamed", oldId: currentPageId, newId: newSlug },
          "*",
        );

        return true;
      } catch (err) {
        console.error("[usePageSource] Rename error:", err);
        return false;
      }
    },
    [currentPageId, readOnly],
  );

  return {
    source,
    isSaving,
    isRefreshing,
    version,
    currentPageId,
    saveSource,
    renamePage,
  };
}
