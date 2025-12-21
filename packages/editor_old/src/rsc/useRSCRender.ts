/**
 * useRSCRender - Hook for fetching RSC-rendered block content
 *
 * Handles:
 * - Fetching RSC stream via Flight protocol
 * - Loading states and error handling
 * - Refresh/re-render capability
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { renderBlockViaRsc } from "./client";

interface UseRSCRenderOptions {
  /** Runtime port to fetch RSC from */
  port: number;
  /** Block ID to render */
  blockId: string;
  /** Auto-refresh when these dependencies change */
  deps?: unknown[];
}

interface UseRSCRenderResult {
  /** The rendered RSC element (null while loading) */
  rscElement: React.ReactNode | null;
  /** Whether currently loading/fetching */
  isLoading: boolean;
  /** Any error that occurred */
  error: string | null;
  /** Trigger a refresh/re-render */
  refresh: () => Promise<void>;
  /** Render key - increments on each refresh */
  renderKey: number;
}

export function useRSCRender({
  port,
  blockId,
  deps = [],
}: UseRSCRenderOptions): UseRSCRenderResult {
  const [rscElement, setRscElement] = useState<React.ReactNode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [renderKey, setRenderKey] = useState(0);

  // Track if component is mounted to avoid state updates after unmount
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!mountedRef.current) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await renderBlockViaRsc(port, blockId);

      if (!mountedRef.current) return;

      if (result.error) {
        setError(result.error);
        setRscElement(null);
      } else {
        setRscElement(result.element);
        setRenderKey((k) => k + 1);
      }
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : String(err));
      setRscElement(null);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [port, blockId]);

  // Initial load and refresh on deps change
  useEffect(() => {
    refresh();
  }, [refresh, ...deps]);

  return {
    rscElement,
    isLoading,
    error,
    refresh,
    renderKey,
  };
}

/**
 * Debounced version of useRSCRender refresh
 * Useful when source changes frequently (e.g., during typing)
 */
export function useDebouncedRefresh(refresh: () => Promise<void>, delay: number = 300): () => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const debouncedRefresh = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      refresh();
    }, delay);
  }, [refresh, delay]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedRefresh;
}
