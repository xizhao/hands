/**
 * usePageSource - Fetch and sync page source via tRPC
 *
 * Handles:
 * - Initial fetch of page source
 * - Polling for external changes (1s interval)
 * - Debounced saves (400ms)
 * - Conflict detection (local vs external changes)
 */

import { trpc } from "@/lib/trpc";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  type Frontmatter,
  parseFrontmatter,
  serializeFrontmatter,
} from "./Frontmatter";

// ============================================================================
// Types
// ============================================================================

export interface UsePageSourceOptions {
  /** Page ID (route) to load */
  pageId: string;
  /** Poll interval in ms (default: 1000) */
  pollInterval?: number;
  /** Debounce delay for saves in ms (default: 400) */
  debounceMs?: number;
  /** Whether editor is read-only */
  readOnly?: boolean;
}

export interface UsePageSourceReturn {
  /** Current source string (null while loading) */
  source: string | null;
  /** Parsed frontmatter */
  frontmatter: Frontmatter;
  /** Content without frontmatter */
  content: string;
  /** Whether initial load is in progress */
  isLoading: boolean;
  /** Whether a save is in progress */
  isSaving: boolean;
  /** Whether there are unsaved local changes */
  isDirty: boolean;
  /** Error message if any */
  error: string | null;
  /** Update source (debounced save) */
  setSource: (newSource: string) => void;
  /** Update frontmatter (updates source) */
  setFrontmatter: (newFrontmatter: Frontmatter) => void;
  /** Force immediate save */
  saveNow: () => Promise<boolean>;
}

// ============================================================================
// Debounce Utility
// ============================================================================

function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number
): T & { cancel: () => void; flush: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  let lastArgs: Parameters<T> | null = null;

  const debounced = ((...args: Parameters<T>) => {
    lastArgs = args;
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => {
      timeoutId = null;
      fn(...args);
    }, delay);
  }) as T & { cancel: () => void; flush: () => void };

  debounced.cancel = () => {
    if (timeoutId) {
      clearTimeout(timeoutId);
      timeoutId = null;
    }
    lastArgs = null;
  };

  debounced.flush = () => {
    if (timeoutId && lastArgs) {
      clearTimeout(timeoutId);
      timeoutId = null;
      fn(...lastArgs);
      lastArgs = null;
    }
  };

  return debounced;
}

// ============================================================================
// Hook
// ============================================================================

export function usePageSource({
  pageId,
  pollInterval = 1000,
  debounceMs = 400,
  readOnly = false,
}: UsePageSourceOptions): UsePageSourceReturn {
  // State
  const [source, setSourceState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for tracking
  const confirmedServerSource = useRef<string | null>(null);
  const localEditVersion = useRef(0);
  const savedVersion = useRef(0);
  const pendingSource = useRef<string | null>(null);
  const lastSaveTime = useRef(0);
  const SAVE_GRACE_PERIOD_MS = 2000;

  // tRPC mutations
  const saveSourceMutation = trpc.pages.saveSource.useMutation();

  // Compute derived state
  const isDirty = localEditVersion.current > savedVersion.current;
  const { frontmatter, contentStart } = source
    ? parseFrontmatter(source)
    : { frontmatter: {}, contentStart: 0 };
  const content = source ? source.slice(contentStart) : "";

  // ============================================================================
  // Initial Fetch
  // ============================================================================

  const {
    data,
    isLoading: queryLoading,
    error: queryError,
  } = trpc.pages.getSource.useQuery(
    { route: pageId },
    {
      refetchInterval: pollInterval,
      refetchIntervalInBackground: false,
    }
  );

  // Sync query result to state
  useEffect(() => {
    if (queryError) {
      setError(queryError.message);
      setIsLoading(false);
      return;
    }

    if (data?.source !== undefined) {
      const serverSource = data.source;

      // First load
      if (confirmedServerSource.current === null) {
        setSourceState(serverSource);
        confirmedServerSource.current = serverSource;
        setIsLoading(false);
        return;
      }

      // External change detection
      if (serverSource !== confirmedServerSource.current) {
        const timeSinceSave = Date.now() - lastSaveTime.current;

        // Ignore changes during grace period after save
        if (timeSinceSave < SAVE_GRACE_PERIOD_MS) {
          confirmedServerSource.current = serverSource;
          return;
        }

        // If no local edits, apply external change
        if (localEditVersion.current <= savedVersion.current) {
          setSourceState(serverSource);
          confirmedServerSource.current = serverSource;
        } else {
          // Local edits pending - keep local, update server ref
          confirmedServerSource.current = serverSource;
        }
      }
    }
  }, [data, queryError]);

  // ============================================================================
  // Save Logic
  // ============================================================================

  const performSave = useCallback(
    async (newSource: string, editVersion: number): Promise<boolean> => {
      if (readOnly) return false;

      // Skip stale saves
      if (editVersion < localEditVersion.current) {
        return false;
      }

      pendingSource.current = newSource;
      setIsSaving(true);

      try {
        await saveSourceMutation.mutateAsync({
          route: pageId,
          source: newSource,
        });

        confirmedServerSource.current = newSource;
        savedVersion.current = editVersion;
        lastSaveTime.current = Date.now();

        return true;
      } catch (err) {
        setError(err instanceof Error ? err.message : "Save failed");
        return false;
      } finally {
        if (savedVersion.current >= localEditVersion.current) {
          pendingSource.current = null;
          setIsSaving(false);
        }
      }
    },
    [pageId, readOnly, saveSourceMutation]
  );

  // Debounced save
  const debouncedSave = useMemo(
    () =>
      debounce((newSource: string, editVersion: number) => {
        performSave(newSource, editVersion);
      }, debounceMs),
    [performSave, debounceMs]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // ============================================================================
  // Public API
  // ============================================================================

  const setSource = useCallback(
    (newSource: string) => {
      if (readOnly) return;

      localEditVersion.current++;
      const editVersion = localEditVersion.current;

      setSourceState(newSource);
      debouncedSave(newSource, editVersion);
    },
    [readOnly, debouncedSave]
  );

  const setFrontmatter = useCallback(
    (newFrontmatter: Frontmatter) => {
      if (readOnly || !source) return;

      const { contentStart } = parseFrontmatter(source);
      const content = source.slice(contentStart);
      const newSource = serializeFrontmatter(newFrontmatter) + content;

      setSource(newSource);
    },
    [readOnly, source, setSource]
  );

  const saveNow = useCallback(async (): Promise<boolean> => {
    if (readOnly || !source) return false;

    debouncedSave.cancel();
    localEditVersion.current++;
    return performSave(source, localEditVersion.current);
  }, [readOnly, source, debouncedSave, performSave]);

  return {
    source,
    frontmatter,
    content,
    isLoading: isLoading || queryLoading,
    isSaving,
    isDirty,
    error,
    setSource,
    setFrontmatter,
    saveNow,
  };
}
