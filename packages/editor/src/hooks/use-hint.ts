/**
 * useHint - React hook for generating plain English hints from technical content
 *
 * Features:
 * - Single hint generation with local caching
 * - Batch prefetching for multiple hints
 * - Deduplication of concurrent requests
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorTrpc } from "../context/EditorContext";

// ============================================================================
// Types
// ============================================================================

interface HintState {
  hint: string | null;
  isLoading: boolean;
  error: string | null;
}

interface UseHintOptions {
  /** Whether to fetch immediately on mount */
  enabled?: boolean;
  /** Context for better hints */
  context?: {
    tables?: string[];
    operation?: string;
  };
}

// ============================================================================
// Local Cache (shared across all hook instances)
// ============================================================================

const hintCache = new Map<string, string>();
const pendingRequests = new Map<string, Promise<string>>();

/**
 * Simple hash for cache key
 */
function hashContent(content: string): string {
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(36);
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Get a plain English hint for technical content
 */
export function useHint(content: string, options: UseHintOptions = {}): HintState {
  const { enabled = true, context } = options;
  const trpc = useEditorTrpc();

  const [state, setState] = useState<HintState>(() => {
    // Check cache on init
    const cacheKey = hashContent(content);
    const cached = hintCache.get(cacheKey);
    return {
      hint: cached ?? null,
      isLoading: !cached && enabled,
      error: null,
    };
  });

  // Track if component is mounted
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch hint
  useEffect(() => {
    if (!enabled || !content || !trpc) {
      setState(prev => ({ ...prev, isLoading: false }));
      return;
    }

    const cacheKey = hashContent(content);

    // Already cached
    if (hintCache.has(cacheKey)) {
      setState({ hint: hintCache.get(cacheKey)!, isLoading: false, error: null });
      return;
    }

    // Check for pending request (deduplication)
    const pending = pendingRequests.get(cacheKey);
    if (pending) {
      pending.then(hint => {
        if (mountedRef.current) {
          setState({ hint, isLoading: false, error: null });
        }
      }).catch(err => {
        if (mountedRef.current) {
          setState({ hint: null, isLoading: false, error: err.message });
        }
      });
      return;
    }

    // Start new request
    setState(prev => ({ ...prev, isLoading: true }));

    const request = trpc.ai.generateHint.mutate({ content, context })
      .then(result => {
        hintCache.set(cacheKey, result.hint);
        pendingRequests.delete(cacheKey);
        return result.hint;
      })
      .catch(err => {
        pendingRequests.delete(cacheKey);
        throw err;
      });

    pendingRequests.set(cacheKey, request);

    request
      .then(hint => {
        if (mountedRef.current) {
          setState({ hint, isLoading: false, error: null });
        }
      })
      .catch(err => {
        if (mountedRef.current) {
          setState({ hint: null, isLoading: false, error: err.message });
        }
      });
  }, [content, enabled, trpc, context]);

  return state;
}

/**
 * Prefetch hints for multiple content strings
 * Returns a function to get hints from cache
 */
export function usePrefetchHints(
  contents: string[],
  options: { context?: { tables?: string[]; operation?: string } } = {}
) {
  const trpc = useEditorTrpc();
  const [hintsMap, setHintsMap] = useState<Map<string, string>>(new Map());
  const [isLoading, setIsLoading] = useState(false);

  // Prefetch on mount or when contents change
  useEffect(() => {
    if (!trpc || contents.length === 0) return;

    // Filter to uncached items
    const uncached = contents.filter(c => {
      const key = hashContent(c);
      return !hintCache.has(key);
    });

    if (uncached.length === 0) {
      // All cached - populate hintsMap from cache
      const map = new Map<string, string>();
      for (const content of contents) {
        const key = hashContent(content);
        const cached = hintCache.get(key);
        if (cached) map.set(content, cached);
      }
      setHintsMap(map);
      return;
    }

    setIsLoading(true);

    const items = uncached.map(content => ({
      content,
      context: options.context,
    }));

    trpc.ai.generateHintsBatch.mutate({ items })
      .then(result => {
        const map = new Map<string, string>();

        // Add cached items
        for (const content of contents) {
          const key = hashContent(content);
          const cached = hintCache.get(key);
          if (cached) map.set(content, cached);
        }

        // Add new items and cache them
        for (const item of result.hints) {
          const key = hashContent(item.content);
          hintCache.set(key, item.hint);
          map.set(item.content, item.hint);
        }

        setHintsMap(map);
        setIsLoading(false);
      })
      .catch(() => {
        setIsLoading(false);
      });
  }, [contents.join(","), trpc, options.context]);

  const getHint = useCallback((content: string): string | undefined => {
    return hintsMap.get(content) ?? hintCache.get(hashContent(content));
  }, [hintsMap]);

  return { getHint, isLoading, hintsMap };
}

/**
 * Clear the hint cache (useful for testing or refresh)
 */
export function clearHintCache(): void {
  hintCache.clear();
  pendingRequests.clear();
}
