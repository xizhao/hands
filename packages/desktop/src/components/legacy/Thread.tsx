import { useEffect, useRef } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessages, useSessions, useSessionStatuses, useDeleteSession } from "@/hooks/useSession";
import { useUIStore } from "@/stores/ui";
import { useBackgroundStore } from "@/stores/background";
import { ChatMessage } from "@/components/ChatMessage";
import { cn } from "@/lib/utils";
import { X, Loader2 } from "lucide-react";
import { ShimmerText } from "@/components/ui/thinking-indicator";
import { motion, AnimatePresence } from "framer-motion";

interface ThreadProps {
  expanded: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}

export function Thread({ expanded, onCollapse, onExpand }: ThreadProps) {
  const { activeSessionId, setActiveSession } = useUIStore();
  const { tasks: backgroundTasks, removeTask } = useBackgroundStore();
  const { data: messages = [] } = useMessages(activeSessionId);
  const { data: sessions = [] } = useSessions();
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const deleteSession = useDeleteSession();

  // Background task IDs
  const backgroundTaskIds = new Set(Object.keys(backgroundTasks));
  const backgroundTaskList = Object.values(backgroundTasks);

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
  const otherSessions = sessions.filter(s => s.id !== activeSessionId && s.title && !backgroundTaskIds.has(s.id));
  const isCurrentBackground = activeSessionId ? backgroundTaskIds.has(activeSessionId) : false;
  const currentBackgroundTask = activeSessionId ? backgroundTasks[activeSessionId] : null;
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

  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(0);

  // Auto-scroll to bottom (newest messages)
  useEffect(() => {
    if (messages.length > prevMessagesLength.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length]);

  const hasMessages = messages.length > 0;

  const handleSwitchThread = (sessionId: string) => {
    setActiveSession(sessionId);
    onExpand();
  };

  const handleDeleteThread = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession.mutate(sessionId);
    if (backgroundTaskIds.has(sessionId)) {
      removeTask(sessionId);
    }
  };

  const handleSelectBackgroundTask = (taskId: string) => {
    setActiveSession(taskId);
    onExpand();
  };

  // All thread chips (current + others + background)
  const allChips = [
    // Current session chip
    ...(currentHasTitle && activeSessionId && !isCurrentBackground ? [{
      id: activeSessionId,
      title: currentSession?.title || "",
      status: getSessionStatus(activeSessionId),
      isCurrent: true,
      isBackground: false,
    }] : []),
    // Current background task chip
    ...(isCurrentBackground && currentBackgroundTask ? [{
      id: activeSessionId!,
      title: currentBackgroundTask.title,
      status: currentBackgroundTask.status === "running" ? "busy" as const : null,
      isCurrent: true,
      isBackground: true,
    }] : []),
    // Other sessions
    ...otherSessions.slice(0, 4).map(s => ({
      id: s.id,
      title: s.title || "",
      status: getSessionStatus(s.id),
      isCurrent: false,
      isBackground: false,
    })),
    // Other background tasks
    ...backgroundTaskList.filter(t => t.id !== activeSessionId).map(t => ({
      id: t.id,
      title: t.progress || t.title,
      status: t.status === "running" ? "busy" as const : t.status === "error" ? "error" as const : null,
      isCurrent: false,
      isBackground: true,
    })),
  ];

  const hasChips = allChips.length > 0;

  return (
    <div className="flex flex-col-reverse">
      {/* Thread chips - above chatbar */}
      {hasChips && (
        <div className="flex flex-wrap gap-1 px-1 pb-1.5">
          {allChips.map((chip) => (
            <div key={chip.id} className="flex items-center">
              <button
                onClick={() => {
                  if (chip.isCurrent) {
                    expanded ? onCollapse() : onExpand();
                  } else if (chip.isBackground) {
                    handleSelectBackgroundTask(chip.id);
                  } else {
                    handleSwitchThread(chip.id);
                  }
                }}
                className={cn(
                  "flex items-center gap-1 px-2 py-0.5 text-[11px] rounded-md transition-colors",
                  chip.isCurrent
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50",
                  chip.isBackground && "opacity-70"
                )}
              >
                <StatusDot status={chip.status} isBackground={chip.isBackground} />
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
      )}

      {/* Messages - expand upward when thread is open, angled down toward input */}
      <AnimatePresence>
        {expanded && hasMessages && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <ScrollArea className="max-h-[50vh] mb-1.5" ref={scrollRef}>
              <div className="space-y-1.5 px-1 pb-2">
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
              </div>
            </ScrollArea>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// Status dot component
function StatusDot({ status, isBackground }: { status: "busy" | "error" | null; isBackground?: boolean }) {
  if (status === "busy") {
    return isBackground ? (
      <Loader2 className="h-2.5 w-2.5 animate-spin text-muted-foreground" />
    ) : (
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
