/** Anonymous user identity - generated client-side and stored in localStorage */
export interface CollabUser {
  id: string;
  name: string; // e.g., "Happy Badger"
  color: string; // HSL color string
}

/** Cursor position as document-relative pixels (pageX/pageY) */
export interface CursorPosition {
  x: number; // pixels from document left edge
  y: number; // pixels from document top edge
  timestamp: number;
}

/** Full presence state for a user */
export interface UserPresence {
  user: CollabUser;
  cursor: CursorPosition | null; // null = cursor left the page
}

/** Synced presence map: userId -> presence */
export type PresenceMap = Record<string, UserPresence>;

/** Single comment in a thread */
export interface Comment {
  id: string;
  threadId: string;
  authorId: string;
  authorName: string;
  authorColor: string;
  content: string;
  createdAt: string; // ISO timestamp
  resolvedAt?: string;
}

/** Comment thread attached to a block */
export interface CommentThread {
  id: string;
  elementId: string; // Stable Plate element ID (preferred)
  blockIndex?: number; // Fallback: index of block in the page
  comments: Comment[];
  isResolved: boolean;
}

/** Synced comments map: threadId -> thread */
export type CommentsMap = Record<string, CommentThread>;
