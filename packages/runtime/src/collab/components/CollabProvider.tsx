"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useUserIdentity } from "../hooks/useUserIdentity";
import { usePresence } from "../hooks/usePresence";
import { useComments } from "../hooks/useComments";
import { useBlockPositions, type BlockPosition } from "../hooks/useBlockPositions";
import type { CollabUser, UserPresence, CommentThread } from "../types";
import type { PageMetadata } from "../CollabRoot";

interface CollabContextValue {
  user: CollabUser | null;
  otherUsers: UserPresence[];
  blockPositions: BlockPosition[];
  threadsByBlock: Record<number, CommentThread[]>;
  pageMetadata?: PageMetadata;
  addComment: (blockIndex: number, content: string, threadId?: string) => void;
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
  const { threadsByBlock, addComment, resolveThread, deleteComment } = useComments(pageId, user);
  const blockPositions = useBlockPositions();

  return (
    <CollabContext.Provider
      value={{
        user,
        otherUsers,
        blockPositions,
        threadsByBlock,
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
