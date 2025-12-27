import { useEffect, useCallback, useRef } from "react";
import { useSyncedState } from "rwsdk/use-synced-state/client";
import type { CollabUser, UserPresence, PresenceMap } from "../types";
import { PRESENCE_STALE_MS, PRESENCE_UPDATE_MS } from "../constants";

/**
 * Sync cursor presence with other users on the same page.
 * Uses rwsdk's useSyncedState with page-scoped key.
 */
export function usePresence(pageId: string, user: CollabUser | null) {
  // Use compound key for page-scoped state (rwsdk doesn't support room param yet)
  const [presenceMap, setPresenceMap] = useSyncedState<PresenceMap>(
    {},
    `presence:${pageId}`
  );

  // Debug logging
  console.log("[usePresence] pageId:", pageId, "user:", user?.name, "presenceMap keys:", Object.keys(presenceMap));

  const lastUpdateRef = useRef(0);
  const rafIdRef = useRef<number | undefined>(undefined);

  // Update own cursor position (throttled)
  const updateCursor = useCallback(
    (x: number, y: number) => {
      if (!user) return;

      const now = Date.now();
      if (now - lastUpdateRef.current < PRESENCE_UPDATE_MS) return;
      lastUpdateRef.current = now;

      setPresenceMap((prev) => ({
        ...prev,
        [user.id]: {
          user,
          cursor: { x, y, timestamp: now },
        },
      }));
    },
    [user, setPresenceMap]
  );

  // Clear cursor when leaving
  const clearCursor = useCallback(() => {
    if (!user) return;
    setPresenceMap((prev) => ({
      ...prev,
      [user.id]: {
        user,
        cursor: null,
      },
    }));
  }, [user, setPresenceMap]);

  // Mouse move handler
  useEffect(() => {
    if (!user) return;

    const handleMouseMove = (e: MouseEvent) => {
      // Store absolute page coordinates (document-relative pixels)
      // This way other users see cursor at correct document position
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => updateCursor(e.pageX, e.pageY));
    };

    const handleMouseLeave = () => {
      clearCursor();
    };

    // Cleanup on unmount
    const handleUnload = () => {
      clearCursor();
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseleave", handleMouseLeave);
    window.addEventListener("beforeunload", handleUnload);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseleave", handleMouseLeave);
      window.removeEventListener("beforeunload", handleUnload);
      if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
      clearCursor();
    };
  }, [user, updateCursor, clearCursor]);

  // Filter out stale users and own cursor
  const otherUsers = Object.values(presenceMap).filter((p): p is UserPresence => {
    if (!user || p.user.id === user.id) return false;
    if (!p.cursor) return false;
    if (Date.now() - p.cursor.timestamp > PRESENCE_STALE_MS) return false;
    return true;
  });

  return { otherUsers, presenceMap };
}
