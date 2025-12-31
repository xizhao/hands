/**
 * ThreadList - Session chips with status dots
 *
 * Features:
 * - Foreground sessions as interactive chips
 * - Background jobs indicator with dropdown
 * - Overflow dropdown for many sessions
 * - Status indicators (busy/error)
 * - New thread button
 */

import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Layers, Loader2, Plus, X } from "lucide-react";
import { useState } from "react";
import { StatusDot, type SessionStatus } from "./StatusDot";
import type { Session } from "@/lib/api";

interface ThreadListProps {
  sessions: Session[];
  backgroundSessions?: Session[];
  activeSessionId: string | null;
  onSessionSelect: (id: string | null) => void;
  onSessionDelete?: (id: string) => void;
  onCreateSession?: () => void;
  getSessionStatus: (id: string) => SessionStatus;
  isCreating?: boolean;
  maxVisible?: number;
  className?: string;
}

export function ThreadList({
  sessions,
  backgroundSessions = [],
  activeSessionId,
  onSessionSelect,
  onSessionDelete,
  onCreateSession,
  getSessionStatus,
  isCreating = false,
  maxVisible = 6,
  className = "",
}: ThreadListProps) {
  const [showDropdown, setShowDropdown] = useState(false);

  const visibleSessions = sessions.slice(0, maxVisible);
  const overflowSessions = sessions.slice(maxVisible);
  const hasOverflow = overflowSessions.length > 0;
  const hasBackground = backgroundSessions.length > 0;

  if (sessions.length === 0 && backgroundSessions.length === 0) {
    return null;
  }

  return (
    <div className={`flex flex-col gap-1 items-start ${className}`}>
      {/* Visible session chips */}
      {visibleSessions.map((session) => {
        const status = getSessionStatus(session.id);
        return (
          <div
            key={session.id}
            className="group flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 text-xs rounded-lg bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 hover:text-zinc-100 border border-zinc-700/50 transition-all"
          >
            <StatusDot status={status} />
            <button
              onClick={() => onSessionSelect(session.id)}
              className="max-w-[140px] truncate hover:text-white transition-colors"
            >
              {session.title || "Untitled"}
            </button>
            {onSessionDelete && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSessionDelete(session.id);
                }}
                className="p-0.5 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}

      {/* Overflow + Background row */}
      {(hasOverflow || hasBackground) && (
        <div className="flex items-center gap-2 mt-1">
          {/* Overflow dropdown */}
          {hasOverflow && (
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-1.5 px-2.5 h-7 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg transition-colors"
              >
                <span>+{overflowSessions.length} more</span>
                <ChevronDown className="h-3 w-3" />
              </button>

              <AnimatePresence>
                {showDropdown && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute bottom-full left-0 mb-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[220px] py-1 max-h-[300px] overflow-y-auto"
                  >
                    {overflowSessions.map((session) => (
                      <div
                        key={session.id}
                        className="group w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-300 hover:bg-zinc-700 transition-colors"
                      >
                        <StatusDot status={getSessionStatus(session.id)} />
                        <button
                          onClick={() => {
                            onSessionSelect(session.id);
                            setShowDropdown(false);
                          }}
                          className="truncate flex-1 text-left hover:text-white"
                        >
                          {session.title || "Untitled"}
                        </button>
                        {onSessionDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSessionDelete(session.id);
                            }}
                            className="p-0.5 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Background jobs pill */}
          {hasBackground && (
            <div className="relative">
              <button
                onClick={() => setShowDropdown(!showDropdown)}
                className="flex items-center gap-1.5 px-2.5 h-7 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg transition-colors"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>{backgroundSessions.length}</span>
                {backgroundSessions.some(
                  (s) => getSessionStatus(s.id) === "busy"
                ) && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500" />
                  </span>
                )}
              </button>

              <AnimatePresence>
                {showDropdown && !hasOverflow && (
                  <motion.div
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 5 }}
                    className="absolute bottom-full left-0 mb-1 bg-zinc-800 border border-zinc-700 rounded-lg shadow-xl z-50 min-w-[220px] py-1"
                  >
                    <div className="flex items-center gap-1.5 px-3 py-1 text-[10px] uppercase text-zinc-500 font-medium">
                      <Layers className="h-3 w-3" />
                      Background Jobs
                    </div>
                    {backgroundSessions.map((session) => (
                      <div
                        key={session.id}
                        className="group w-full flex items-center gap-2 px-3 py-1.5 text-xs text-zinc-400 hover:bg-zinc-700 transition-colors"
                      >
                        <StatusDot status={getSessionStatus(session.id)} />
                        <button
                          onClick={() => {
                            onSessionSelect(session.id);
                            setShowDropdown(false);
                          }}
                          className="truncate flex-1 text-left hover:text-zinc-200"
                        >
                          {session.title || `Subtask ${session.id.slice(0, 6)}`}
                        </button>
                        {onSessionDelete && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onSessionDelete(session.id);
                            }}
                            className="p-0.5 rounded hover:bg-zinc-600 text-zinc-500 hover:text-zinc-300 opacity-0 group-hover:opacity-100 transition-all"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* New thread button */}
          {onCreateSession && (
            <button
              onClick={onCreateSession}
              disabled={isCreating}
              className="flex items-center justify-center h-7 w-7 text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700/50 rounded-lg transition-colors ml-auto"
            >
              {isCreating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
            </button>
          )}
        </div>
      )}

      {/* New thread button when no overflow/background */}
      {!hasOverflow && !hasBackground && onCreateSession && (
        <button
          onClick={onCreateSession}
          disabled={isCreating}
          className="flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-zinc-500 hover:text-zinc-300 bg-zinc-800/50 hover:bg-zinc-800 border border-dashed border-zinc-700/50 rounded-lg transition-colors"
        >
          {isCreating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <>
              <Plus className="h-3.5 w-3.5" />
              <span>New thread</span>
            </>
          )}
        </button>
      )}
    </div>
  );
}
