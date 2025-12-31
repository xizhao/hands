import { useCallback } from "react";
import { useSyncedState } from "rwsdk/use-synced-state/client";
import type { CollabUser, Comment, CommentsMap, CommentThread } from "../types";

/**
 * Manage comment threads synced across users.
 * Uses rwsdk's useSyncedState with page-scoped key.
 * Comments are anchored by stable Plate element IDs.
 */
export function useComments(pageId: string, user: CollabUser | null) {
  // Use compound key for page-scoped state (rwsdk doesn't support room param yet)
  const [commentsMap, setCommentsMap] = useSyncedState<CommentsMap>({}, `comments:${pageId}`);

  const addComment = useCallback(
    (elementId: string, content: string, threadId?: string) => {
      if (!user || !content.trim()) return;

      const commentId = crypto.randomUUID();
      const newThreadId = threadId || commentId;
      const now = new Date().toISOString();

      const comment: Comment = {
        id: commentId,
        threadId: newThreadId,
        authorId: user.id,
        authorName: user.name,
        authorColor: user.color,
        content: content.trim(),
        createdAt: now,
      };

      setCommentsMap((prev) => {
        const existingThread = prev[newThreadId];

        if (existingThread) {
          // Add reply to existing thread
          return {
            ...prev,
            [newThreadId]: {
              ...existingThread,
              comments: [...existingThread.comments, comment],
            },
          };
        }

        // Create new thread anchored to element ID
        return {
          ...prev,
          [newThreadId]: {
            id: newThreadId,
            elementId,
            comments: [comment],
            isResolved: false,
          },
        };
      });
    },
    [user, setCommentsMap],
  );

  const resolveThread = useCallback(
    (threadId: string) => {
      setCommentsMap((prev) => {
        const thread = prev[threadId];
        if (!thread) return prev;

        return {
          ...prev,
          [threadId]: {
            ...thread,
            isResolved: true,
            comments: thread.comments.map((c, i) =>
              i === 0 ? { ...c, resolvedAt: new Date().toISOString() } : c,
            ),
          },
        };
      });
    },
    [setCommentsMap],
  );

  const deleteComment = useCallback(
    (threadId: string, commentId: string) => {
      setCommentsMap((prev) => {
        const thread = prev[threadId];
        if (!thread) return prev;

        const updatedComments = thread.comments.filter((c) => c.id !== commentId);

        // If no comments left, remove the thread
        if (updatedComments.length === 0) {
          const { [threadId]: _, ...rest } = prev;
          return rest;
        }

        return {
          ...prev,
          [threadId]: {
            ...thread,
            comments: updatedComments,
          },
        };
      });
    },
    [setCommentsMap],
  );

  // Group threads by element ID (only unresolved)
  const threadsByElementId = Object.values(commentsMap).reduce(
    (acc, thread) => {
      if (thread.isResolved) return acc;
      const key = thread.elementId;
      if (!acc[key]) acc[key] = [];
      acc[key].push(thread);
      return acc;
    },
    {} as Record<string, CommentThread[]>,
  );

  return {
    commentsMap,
    threadsByElementId,
    addComment,
    resolveThread,
    deleteComment,
  };
}
