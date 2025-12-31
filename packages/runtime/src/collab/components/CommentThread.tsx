"use client";

import type { CollabUser, CommentThread as CommentThreadType } from "../types";
import { CommentInput } from "./CommentInput";

interface CommentThreadProps {
  thread: CommentThreadType;
  currentUser: CollabUser | null;
  onReply: (content: string) => void;
  onResolve: () => void;
  onDelete: (commentId: string) => void;
}

export function CommentThread({
  thread,
  currentUser,
  onReply,
  onResolve,
  onDelete,
}: CommentThreadProps) {
  return (
    <div className="space-y-3">
      {thread.comments.map((comment, index) => {
        const initials = comment.authorName
          .split(" ")
          .map((n) => n[0])
          .join("");
        return (
          <div key={comment.id} className="group">
            <div className="flex items-start gap-2">
              {/* Avatar */}
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[9px] font-semibold flex-shrink-0 shadow-sm"
                style={{ backgroundColor: comment.authorColor }}
              >
                {initials}
              </div>

              <div className="flex-1 min-w-0">
                {/* Header */}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-foreground">{comment.authorName}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {formatTime(comment.createdAt)}
                  </span>
                </div>

                {/* Content */}
                <p className="text-sm text-foreground/80 mt-0.5 whitespace-pre-wrap break-words leading-relaxed">
                  {comment.content}
                </p>
              </div>

              {/* Delete button (only for own comments) */}
              {currentUser?.id === comment.authorId && (
                <button
                  onClick={() => onDelete(comment.id)}
                  className="opacity-0 group-hover:opacity-100 p-1 text-muted-foreground hover:text-destructive transition-all"
                  title="Delete comment"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Resolve button on first comment */}
            {index === 0 && (
              <button
                onClick={onResolve}
                className="mt-2 ml-8 text-[10px] text-muted-foreground hover:text-green-600 flex items-center gap-1 transition-colors"
              >
                <svg
                  className="w-3 h-3"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                Resolve
              </button>
            )}
          </div>
        );
      })}

      {/* Reply input */}
      <div className="pt-2 border-t border-border/50">
        <CommentInput placeholder="Reply..." onSubmit={onReply} />
      </div>
    </div>
  );
}

function formatTime(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;

  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;

  return date.toLocaleDateString();
}
