import { useCallback } from "react";
import { useSyncedState } from "rwsdk/use-synced-state/client";
import type { CollabUser, Comment, CommentThread, CommentsMap } from "../types";

/**
 * Manage comment threads synced across users.
 * Uses rwsdk's useSyncedState with page-scoped key.
 */
export function useComments(pageId: string, user: CollabUser | null) {
  // Use compound key for page-scoped state (rwsdk doesn't support room param yet)
  const [commentsMap, setCommentsMap] = useSyncedState<CommentsMap>(
    {},
    `comments:${pageId}`
  );

  const addComment = useCallback(
    (blockIndex: number, content: string, threadId?: string) => {
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

        // Create new thread
        return {
          ...prev,
          [newThreadId]: {
            id: newThreadId,
            blockIndex,
            comments: [comment],
            isResolved: false,
          },
        };
      });
    },
    [user, setCommentsMap]
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
              i === 0 ? { ...c, resolvedAt: new Date().toISOString() } : c
            ),
          },
        };
      });
    },
    [setCommentsMap]
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
    [setCommentsMap]
  );

  // Group threads by block index (only unresolved)
  const threadsByBlock = Object.values(commentsMap).reduce(
    (acc, thread) => {
      if (thread.isResolved) return acc;
      const key = thread.blockIndex;
      if (!acc[key]) acc[key] = [];
      acc[key].push(thread);
      return acc;
    },
    {} as Record<number, CommentThread[]>
  );

  return {
    commentsMap,
    threadsByBlock,
    addComment,
    resolveThread,
    deleteComment,
  };
}
