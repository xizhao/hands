// Collab widget exports

export type { PageMetadata } from "./CollabRoot";
export { getPageIdFromUrl, mountCollab } from "./CollabRoot";
export { CollabProvider, useCollab } from "./components/CollabProvider";
export { CollabWidget } from "./components/CollabWidget";

// Types
export type {
  CollabUser,
  Comment,
  CommentsMap,
  CommentThread,
  CursorPosition,
  PresenceMap,
  UserPresence,
} from "./types";
