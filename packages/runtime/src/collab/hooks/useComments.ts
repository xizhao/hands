import type { CollabUser, CommentsMap, CommentThread } from "../types";

/**
 * Stub for comment threads sync.
 * Collab features are deferred - this returns no-op values.
 */
export function useComments(_pageId: string, _user: CollabUser | null) {
  const commentsMap: CommentsMap = {};
  const threadsByElementId: Record<string, CommentThread[]> = {};

  const addComment = (_elementId: string, _content: string, _threadId?: string) => {};
  const resolveThread = (_threadId: string) => {};
  const deleteComment = (_threadId: string, _commentId: string) => {};

  return {
    commentsMap,
    threadsByElementId,
    addComment,
    resolveThread,
    deleteComment,
  };
}
