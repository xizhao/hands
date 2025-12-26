// Collab widget exports
export { mountCollab, getPageIdFromUrl } from "./CollabRoot";
export type { PageMetadata } from "./CollabRoot";
export { CollabProvider, useCollab } from "./components/CollabProvider";
export { CollabWidget } from "./components/CollabWidget";

// Types
export type {
  CollabUser,
  UserPresence,
  CursorPosition,
  PresenceMap,
  Comment,
  CommentThread,
  CommentsMap,
} from "./types";
