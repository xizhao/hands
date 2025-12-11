import { useEffect, useRef, useLayoutEffect, useState } from "react";
import { useMessages, useSessions, useSessionStatuses, useDeleteSession } from "@/hooks/useSession";
import { useActiveSession } from "@/hooks/useNavState";
import { ChatMessage } from "@/components/ChatMessage";
import { cn } from "@/lib/utils";
import { X, Layers } from "lucide-react";
import { ShimmerText } from "@/components/ui/thinking-indicator";
import { motion, AnimatePresence } from "framer-motion";
import type { Session } from "@/lib/api";

interface ThreadProps {
  expanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}

// Type helper for sessions with parentID
type SessionWithParent = Session & { parentID?: string };

export function Thread({ expanded, onCollapse, onExpand }: ThreadProps) {
  const { sessionId: activeSessionId, setSession: setActiveSession } = useActiveSession();
  const { data: messages = [], isLoading, error } = useMessages(activeSessionId);
  const { data: sessions = [] } = useSessions();
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const deleteSession = useDeleteSession();
  const [showBackgroundSessions, setShowBackgroundSessions] = useState(false);

  // Debug logging
  console.log("[Thread] render - activeSessionId:", activeSessionId, "expanded:", expanded);
  console.log("[Thread] messages:", messages.length, "isLoading:", isLoading, "error:", error);

  // Current session status
  const currentStatus = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = currentStatus?.type === "busy" || currentStatus?.type === "running";
  const activeForm = currentStatus?.type === "busy" ? currentStatus.activeForm : undefined;

  // Check if waiting for response
  const lastMessage = messages[messages.length - 1];
  const lastAssistantMessage = messages.filter(m => m.info.role === "assistant").pop();
  const hasAssistantContent = lastAssistantMessage?.parts?.some(
    p => p.type === "text" || p.type === "tool" || p.type === "reasoning"
  );
  const waitingForResponse = isBusy && (!lastAssistantMessage || !hasAssistantContent || lastMessage?.info.role === "user");

  // Session info
  const currentSession = sessions.find(s => s.id === activeSessionId);
  const otherSessions = sessions.filter(s => s.id !== activeSessionId && s.title);
  const currentHasTitle = Boolean(currentSession?.title);

  // Status helpers
  const lastAssistantHasError = Boolean(
    lastAssistantMessage?.info?.role === "assistant" &&
    (lastAssistantMessage.info as { error?: unknown }).error
  );

  const getSessionStatus = (sessionId: string): "busy" | "error" | null => {
    const status = sessionStatuses[sessionId];
    if (status?.type === "busy" || status?.type === "running") return "busy";
    if (sessionId === activeSessionId && lastAssistantHasError) return "error";
    return null;
  };

  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Scroll to bottom helper
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(hasScrolledRef.current ? "smooth" : "instant");
      hasScrolledRef.current = true;
    }
  }, [messages.length]);

  // Scroll to bottom when expanded (after animation)
  useLayoutEffect(() => {
    if (expanded) {
      const timer = setTimeout(() => {
        scrollToBottom("instant");
      }, 250);
      return () => clearTimeout(timer);
    }
  }, [expanded]);

  const hasMessages = messages.length > 0;

  const handleSwitchThread = (sessionId: string) => {
    setActiveSession(sessionId);
    onExpand();
  };

  const handleDeleteThread = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession.mutate(sessionId);
  };

  // Separate foreground sessions (no parentID) from background sessions (has parentID)
  const foregroundSessions = sessions.filter(s => {
    const sessionWithParent = s as SessionWithParent;
    return s.title && !sessionWithParent.parentID;
  });

  const backgroundSessions = sessions.filter(s => {
    const sessionWithParent = s as SessionWithParent;
    return sessionWithParent.parentID; // Child sessions (subagents)
  });

  // Foreground thread chips - keep stable order, just mark which is active
  const allChips = foregroundSessions
    .slice(0, 5)
    .map(s => ({
      id: s.id,
      title: s.title || "",
      status: getSessionStatus(s.id),
      isCurrent: s.id === activeSessionId,
    }));

  // Background sessions count and status
  const backgroundCount = backgroundSessions.length;
  const backgroundBusyCount = backgroundSessions.filter(s => {
    const status = sessionStatuses[s.id];
    return status?.type === "busy" || status?.type === "running";
  }).length;

  const hasChips = allChips.length > 0 || backgroundCount > 0;

  return (
    <div className="flex flex-col-reverse">
      {/* Thread chips - above chatbar */}
      {hasChips && (
        <div className="flex items-center gap-2 px-1 pb-1.5">
          {/* Foreground session chips - left side */}
          <div className="flex flex-wrap gap-1 min-w-0 flex-1">
            {allChips.map((chip) => (
              <div key={chip.id} className="flex items-center">
                <button
                  onClick={() => {
                    if (chip.isCurrent) {
                      expanded ? onCollapse() : onExpand();
                    } else {
                      handleSwitchThread(chip.id);
                    }
                  }}
                  className={cn(
                    "flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md transition-colors",
                    chip.isCurrent
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  <StatusDot status={chip.status} />
                  <span className="max-w-[100px] truncate">{chip.title}</span>
                </button>
                {!chip.isCurrent && (
                  <button
                    onClick={(e) => handleDeleteThread(chip.id, e)}
                    className="ml-0.5 p-0.5 rounded-full hover:bg-muted transition-colors opacity-40 hover:opacity-100"
                  >
                    <X className="h-2 w-2" />
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Background sessions chip - far right, compact [count icon] style */}
          {backgroundCount > 0 && (
            <div className="relative shrink-0 ml-auto">
              <button
                onClick={() => setShowBackgroundSessions(!showBackgroundSessions)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded transition-colors",
                  showBackgroundSessions
                    ? "bg-muted/80 text-foreground"
                    : "text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/30"
                )}
              >
                <span className="tabular-nums">{backgroundCount}</span>
                {backgroundBusyCount > 0 ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </span>
                ) : (
                  <Layers className="h-3 w-3 opacity-60" />
                )}
              </button>

              {/* Background sessions dropdown */}
              <AnimatePresence>
                {showBackgroundSessions && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute bottom-full right-0 mb-1 min-w-[180px] rounded-lg border bg-background/95 backdrop-blur-xl shadow-lg z-50"
                  >
                    <div className="p-1 max-h-[200px] overflow-y-auto">
                      <div className="px-2 py-1 text-[9px] uppercase tracking-wide text-muted-foreground/50 font-medium">
                        Background tasks
                      </div>
                      {backgroundSessions.map((session) => {
                        const status = getSessionStatus(session.id);
                        return (
                          <button
                            key={session.id}
                            onClick={() => {
                              handleSwitchThread(session.id);
                              setShowBackgroundSessions(false);
                            }}
                            className="flex items-center gap-2 w-full px-2 py-1.5 text-[11px] rounded-md hover:bg-muted/50 transition-colors text-left"
                          >
                            <StatusDot status={status} />
                            <span className="truncate flex-1">
                              {session.title || `Subtask ${session.id.slice(0, 8)}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Messages - expand upward when thread is open */}
      {expanded && hasMessages && (
        <div className="mb-1.5 max-h-[calc(100vh-12rem)] overflow-y-auto">
          <div className="space-y-1 px-1 pb-2">
            {/* Messages (oldest to newest, bottom-aligned) */}
            {messages.map((message, idx) => (
              <ChatMessage
                key={message.info.id || idx}
                message={message}
                compact
              />
            ))}

            {/* Loading indicator */}
            {waitingForResponse && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex w-full justify-start"
              >
                <div className="px-2.5 py-1.5 rounded-lg rounded-tl-sm bg-muted text-foreground">
                  <ShimmerText
                    text={activeForm || "Thinking..."}
                    className="text-xs"
                  />
                </div>
              </motion.div>
            )}
            {/* Scroll anchor */}
            <div ref={bottomRef} />
          </div>
        </div>
      )}
    </div>
  );
}

// Status dot component
function StatusDot({ status }: { status: "busy" | "error" | null }) {
  if (status === "busy") {
    return (
      <span className="relative flex h-2 w-2">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative inline-flex rounded-full h-2 w-2 bg-green-500" />
      </span>
    );
  }

  if (status === "error") {
    return <span className="inline-flex rounded-full h-2 w-2 bg-red-500" />;
  }

  return <span className="inline-flex rounded-full h-2 w-2 bg-muted-foreground/40" />;
}
