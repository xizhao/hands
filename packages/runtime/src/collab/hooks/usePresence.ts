import type { CollabUser, UserPresence } from "../types";

/**
 * Stub for cursor presence sync.
 * Collab features are deferred - this returns no-op values.
 */
export function usePresence(_pageId: string, _user: CollabUser | null) {
  const otherUsers: UserPresence[] = [];
  const presenceMap = {};

  return { otherUsers, presenceMap };
}
