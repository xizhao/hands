"use client";

import { createContext, type ReactNode, useContext } from "react";
import type { PageMetadata } from "../CollabRoot";
import { type BlockPosition, useBlockPositions } from "../hooks/useBlockPositions";
import { useComments } from "../hooks/useComments";
import { usePresence } from "../hooks/usePresence";
import { useUserIdentity } from "../hooks/useUserIdentity";
import type { CollabUser, CommentThread, UserPresence } from "../types";

interface CollabContextValue {
  user: CollabUser | null;
  otherUsers: UserPresence[];
  blockPositions: BlockPosition[];
  threadsByElementId: Record<string, CommentThread[]>;
  pageMetadata?: PageMetadata;
  addComment: (elementId: string, content: string, threadId?: string) => void;
  resolveThread: (threadId: string) => void;
  deleteComment: (threadId: string, commentId: string) => void;
}

const CollabContext = createContext<CollabContextValue | null>(null);

export function useCollab() {
  const ctx = useContext(CollabContext);
  if (!ctx) throw new Error("useCollab must be used within CollabProvider");
  return ctx;
}

interface CollabProviderProps {
  pageId: string;
  pageMetadata?: PageMetadata;
  children: ReactNode;
}

export function CollabProvider({ pageId, pageMetadata, children }: CollabProviderProps) {
  const user = useUserIdentity();
  const { otherUsers } = usePresence(pageId, user);
  const { threadsByElementId, addComment, resolveThread, deleteComment } = useComments(
    pageId,
    user,
  );
  const blockPositions = useBlockPositions();

  return (
    <CollabContext.Provider
      value={{
        user,
        otherUsers,
        blockPositions,
        threadsByElementId,
        pageMetadata,
        addComment,
        resolveThread,
        deleteComment,
      }}
    >
      {children}
    </CollabContext.Provider>
  );
}
