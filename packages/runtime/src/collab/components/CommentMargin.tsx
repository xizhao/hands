"use client";

import { useState, useRef, useEffect } from "react";
import type { CommentThread as CommentThreadType, CollabUser } from "../types";
import { CommentThread } from "./CommentThread";
import { CommentInput } from "./CommentInput";

interface CommentMarginProps {
  blockIndex: number;
  top: number;
  threads: CommentThreadType[];
  currentUser: CollabUser | null;
  onAddComment: (content: string, threadId?: string) => void;
  onResolve: (threadId: string) => void;
  onDelete: (threadId: string, commentId: string) => void;
}

export function CommentMargin({
  blockIndex,
  top,
  threads,
  currentUser,
  onAddComment,
  onResolve,
  onDelete,
}: CommentMarginProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showNewThread, setShowNewThread] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  const hasComments = threads.length > 0;
  const totalComments = threads.reduce((sum, t) => sum + t.comments.length, 0);

  // Close popover on click outside
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowNewThread(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  const handleNewComment = (content: string) => {
    onAddComment(content);
    setShowNewThread(false);
  };

  return (
    <div
      className="absolute -left-10 flex items-start"
      style={{ top: `${top}px` }}
    >
      {/* Margin icon button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`
          w-6 h-6 rounded-lg flex items-center justify-center
          transition-all duration-150 flex-shrink-0
          border
          ${
            hasComments
              ? "bg-primary text-primary-foreground border-primary shadow-sm hover:shadow-md"
              : "bg-background/80 backdrop-blur-sm text-muted-foreground border-border/50 opacity-0 group-hover:opacity-100 hover:bg-muted hover:text-foreground"
          }
        `}
        title={hasComments ? `${totalComments} comment${totalComments !== 1 ? "s" : ""}` : "Add comment"}
      >
        {hasComments ? (
          <span className="text-[10px] font-semibold">{totalComments}</span>
        ) : (
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        )}
      </button>

      {/* Popover */}
      {isOpen && (
        <div
          ref={popoverRef}
          className="absolute left-8 top-0 w-72 bg-background/95 backdrop-blur-md rounded-xl shadow-xl border border-border/50 z-50"
        >
          <div className="p-3 max-h-96 overflow-y-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-border/50">
              <span className="text-xs font-medium text-foreground">Comments</span>
              <button
                onClick={() => setIsOpen(false)}
                className="w-5 h-5 rounded flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Existing threads */}
            {threads.map((thread) => (
              <div key={thread.id} className="mb-4 last:mb-0">
                <CommentThread
                  thread={thread}
                  currentUser={currentUser}
                  onReply={(content) => onAddComment(content, thread.id)}
                  onResolve={() => onResolve(thread.id)}
                  onDelete={(commentId) => onDelete(thread.id, commentId)}
                />
              </div>
            ))}

            {/* New thread input */}
            {!hasComments || showNewThread ? (
              <div className={threads.length > 0 ? "pt-3 border-t border-border/50" : ""}>
                <CommentInput
                  placeholder="Add a comment..."
                  onSubmit={handleNewComment}
                  onCancel={threads.length > 0 ? () => setShowNewThread(false) : undefined}
                  autoFocus
                />
              </div>
            ) : (
              <button
                onClick={() => setShowNewThread(true)}
                className="w-full mt-3 pt-3 border-t border-border/50 text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 transition-colors"
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
                </svg>
                New thread
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
