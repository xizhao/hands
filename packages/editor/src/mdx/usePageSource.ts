/**
 * usePageSource - Source state management for the MDX Page Editor
 *
 * Handles:
 * - Source polling for external changes (linter, auto-formatter)
 * - Debounced source mutations (400ms) to avoid per-keystroke saves
 * - Version tracking for refreshes and conflict detection
 * - Conflict-free save/poll coordination
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  /** Debounce delay in ms (default: 400) */
  debounceMs?: number;
}

export interface UsePageSourceReturn {
  /** Current source code */
  source: string | null;

  /** Whether a save is in progress */
  isSaving: boolean;

  /** Whether we're refreshing (have cached, fetching fresh) */
  isRefreshing: boolean;

  /** Whether there are unsaved local changes */
  isDirty: boolean;

  /** Version number (increments on external changes) */
  version: number;

  /** Current page ID (may change after rename) */
  currentPageId: string;

  /** Save source changes (debounced) */
  saveSource: (newSource: string) => void;

  /** Force immediate save (bypasses debounce) */
  saveSourceImmediate: (newSource: string) => Promise<boolean>;

  /** Rename the page */
  renamePage: (newSlug: string) => Promise<boolean>;
}

// ============================================================================
// Debounce Utility
// ============================================================================

function debounce<T extends (...args: any[]) => any>(
  fn: T,
  delay: number,
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
  runtimePort,
  initialSource = null,
  pollInterval = 1000,
  readOnly = false,
  debounceMs = 400,
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

  // Track current local source (for version conflict detection)
  const currentLocalSource = useRef<string | null>(initialSource ?? cachedSource);

  // Version tracking for conflict detection
  const localEditVersion = useRef(0); // Increments on each local edit
  const savedVersion = useRef(0); // Version that was last saved successfully

  // Track pending source during save (to prevent poll overwrites)
  const pendingSource = useRef<string | null>(null);

  // Grace period after save - ignore poll changes for a short time
  // This prevents the poll from overwriting content we just saved
  const lastSaveTime = useRef<number>(0);
  const SAVE_GRACE_PERIOD_MS = 2000; // Ignore poll changes for 2s after save

  // Get tRPC client
  const trpcRef = useRef(getTRPCClient(runtimePort));

  // Compute isDirty - true if local edits haven't been saved yet
  const isDirty = localEditVersion.current > savedVersion.current;

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
            // Check if we're in the grace period after a save
            // This prevents poll from overwriting content we just saved
            // (serialization may not be perfectly round-trip consistent)
            const timeSinceSave = Date.now() - lastSaveTime.current;
            if (timeSinceSave < SAVE_GRACE_PERIOD_MS) {
              console.log("[usePageSource] Ignoring poll change during grace period");
              confirmedServerSource.current = data.source;
              return;
            }

            // Check if we have unsaved local edits
            if (localEditVersion.current > savedVersion.current) {
              // Conflict: external change while user has unsaved edits
              // Keep local edits (user's work wins)
              console.log("[usePageSource] External change detected but local edits pending - keeping local");
              // Update server source ref so we don't keep logging this
              confirmedServerSource.current = data.source;
            } else {
              // No local edits - safe to apply external change
              console.warn("[usePageSource] TRIGGERING UPDATE - source changed externally", {
                serverLength: data.source.length,
                confirmedLength: confirmedServerSource.current?.length,
                localVersion: localEditVersion.current,
                savedVersion: savedVersion.current,
              });
              setSourceState(data.source);
              setCachedPageSource(currentPageId, data.source);
              confirmedServerSource.current = data.source;
              currentLocalSource.current = data.source;
              setVersion((v) => v + 1);
            }
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
  // Save Source (Internal - performs actual network save)
  // ============================================================================

  const performSave = useCallback(
    async (newSource: string, editVersion: number): Promise<boolean> => {
      if (readOnly) return false;

      // Skip if a newer edit came in (stale save)
      if (editVersion < localEditVersion.current) {
        console.log("[usePageSource] Skipping stale save (version", editVersion, "< current", localEditVersion.current, ")");
        return false;
      }

      // Mark as pending - blocks polling
      pendingSource.current = newSource;
      setIsSaving(true);

      try {
        const trpc = trpcRef.current;
        await trpc.pages.saveSource.mutate({ route: currentPageId, source: newSource });

        // Update confirmed source after server confirms
        confirmedServerSource.current = newSource;
        savedVersion.current = editVersion;
        lastSaveTime.current = Date.now(); // Start grace period
        console.log("[usePageSource] Saved successfully (version", editVersion, ")");

        // Check if more edits came in during the save
        if (localEditVersion.current > editVersion && currentLocalSource.current) {
          console.log("[usePageSource] More edits during save, queueing another save");
          // Don't clear pending yet - queue another save
          performSave(currentLocalSource.current, localEditVersion.current);
        }

        return true;
      } catch (err) {
        console.error("[usePageSource] Save failed:", err);
        return false;
      } finally {
        // Only clear pending if no follow-up save was queued
        if (savedVersion.current >= localEditVersion.current) {
          pendingSource.current = null;
          setIsSaving(false);
        }
      }
    },
    [currentPageId, readOnly],
  );

  // ============================================================================
  // Debounced Save
  // ============================================================================

  const debouncedSave = useMemo(
    () =>
      debounce((newSource: string, editVersion: number) => {
        performSave(newSource, editVersion);
      }, debounceMs),
    [performSave, debounceMs],
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      debouncedSave.cancel();
    };
  }, [debouncedSave]);

  // ============================================================================
  // Public Save API
  // ============================================================================

  /** Debounced save - call on every keystroke */
  const saveSource = useCallback(
    (newSource: string): void => {
      if (readOnly) return;

      // Increment local version
      localEditVersion.current++;
      const editVersion = localEditVersion.current;

      // Update local state immediately for responsive UI
      currentLocalSource.current = newSource;
      setSourceState(newSource);
      setCachedPageSource(currentPageId, newSource);

      // Queue debounced save
      debouncedSave(newSource, editVersion);
    },
    [currentPageId, readOnly, debouncedSave],
  );

  /** Immediate save - bypasses debounce (for blur events, navigation, etc.) */
  const saveSourceImmediate = useCallback(
    async (newSource: string): Promise<boolean> => {
      if (readOnly) return false;

      // Cancel any pending debounced save
      debouncedSave.cancel();

      // Increment local version
      localEditVersion.current++;
      const editVersion = localEditVersion.current;

      // Update local state immediately
      currentLocalSource.current = newSource;
      setSourceState(newSource);
      setCachedPageSource(currentPageId, newSource);

      // Perform save immediately
      return performSave(newSource, editVersion);
    },
    [currentPageId, readOnly, debouncedSave, performSave],
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
    isDirty,
    version,
    currentPageId,
    saveSource,
    saveSourceImmediate,
    renamePage,
  };
}
