import { useEffect, useRef, useMemo, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessages, useSessions, useDeleteSession, useSessionStatuses } from "@/hooks/useSession";
import { useUIStore } from "@/stores/ui";
import { ChatMessage } from "@/components/ChatMessage";
import { cn } from "@/lib/utils";
import { Database, FileUp, Link, ChevronDown, ChevronUp, MessageSquare, X, Loader2 } from "lucide-react";
import { motion } from "framer-motion";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

interface ThreadProps {
  expanded: boolean;
  hasData: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}

export function Thread({ expanded, hasData, onCollapse, onExpand }: ThreadProps) {
  const queryClient = useQueryClient();
  const { activeSessionId, setActiveSession } = useUIStore();
  const { data: messages = [] } = useMessages(activeSessionId);
  const { data: sessions = [] } = useSessions();
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const deleteSession = useDeleteSession();

  // Check if the current session is busy (loading)
  const currentStatus = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = currentStatus?.type === "busy" || currentStatus?.type === "running";

  // Check if we're waiting for assistant response (busy but no visible assistant content yet)
  // Look at the last message - if it's from user OR if it's an empty assistant message with no parts
  const lastMessage = messages[messages.length - 1];
  const lastAssistantMessage = messages.filter(m => m.info.role === "assistant").pop();
  const hasAssistantContent = lastAssistantMessage?.parts?.some(
    p => p.type === "text" || p.type === "tool" || p.type === "reasoning"
  );
  const waitingForResponse = isBusy && (!lastAssistantMessage || !hasAssistantContent || lastMessage?.info.role === "user");

  // Get current session info
  const currentSession = sessions.find(s => s.id === activeSessionId);

  // Other sessions for switching - only those with titles
  const otherSessions = sessions.filter(s => s.id !== activeSessionId && s.title);

  // Check if current session has a title
  const currentHasTitle = Boolean(currentSession?.title);

  // Check if last assistant message had an error
  const lastAssistantHasError = Boolean(
    lastAssistantMessage?.info?.role === "assistant" &&
    (lastAssistantMessage.info as { error?: unknown }).error
  );

  // Get status indicator for a session: "busy" | "error" | null
  const getSessionStatus = (sessionId: string): "busy" | "error" | null => {
    const status = sessionStatuses[sessionId];
    if (status?.type === "busy" || status?.type === "running") {
      return "busy";
    }
    // For active session, check if last message had error
    if (sessionId === activeSessionId && lastAssistantHasError) {
      return "error";
    }
    return null;
  };
  const scrollRef = useRef<HTMLDivElement>(null);
  const prevMessagesLength = useRef(0);

  // Reverse messages so newest appears at top, coming down
  const reversedMessages = useMemo(() => {
    return [...messages].reverse();
  }, [messages]);

  // Auto-scroll to top when new messages arrive (since newest is at top)
  useEffect(() => {
    if (messages.length > prevMessagesLength.current && scrollRef.current) {
      scrollRef.current.scrollTo({
        top: 0,
        behavior: "smooth",
      });
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length]);

  // Resize window when expanding/collapsing
  const resizeWindow = useCallback(async (expand: boolean) => {
    try {
      const window = getCurrentWindow();
      const size = await window.innerSize();
      const targetHeight = expand ? Math.max(size.height, 500) : 120;
      await window.setSize(new LogicalSize(size.width, targetHeight));
    } catch (e) {
      console.error("Failed to resize window:", e);
    }
  }, []);

  useEffect(() => {
    resizeWindow(expanded);
  }, [expanded, resizeWindow]);

  const hasMessages = messages.length > 0;


  const handleSwitchThread = (sessionId: string) => {
    setActiveSession(sessionId);
    onExpand();
  };

  const handleDeleteThread = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // If deleting the active session, switch first to prevent stale data showing
    if (sessionId === activeSessionId) {
      const nextSession = sessions.find(s => s.id !== sessionId);
      setActiveSession(nextSession?.id ?? null);
    }

    // Clear caches for this session immediately
    queryClient.removeQueries({ queryKey: ["messages", sessionId] });
    queryClient.removeQueries({ queryKey: ["todos", sessionId] });

    // Delete on server
    deleteSession.mutate(sessionId);
  };

  // Collapsed state - show thread chips only if there are titled sessions
  if (!expanded) {
    // Don't render anything if no sessions have titles
    if (!currentHasTitle && otherSessions.length === 0) {
      return null;
    }

    return (
      <div className="mt-2 px-2 animate-in fade-in duration-200">
        <div className="flex flex-wrap gap-2 items-start">
          {/* Current thread chip - only if it has a title */}
          {currentHasTitle && activeSessionId && (
            <div className="flex items-center">
              <button
                onClick={onExpand}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-100 rounded-2xl rounded-tl-md bg-zinc-800 shadow-lg hover:bg-zinc-700 transition-colors"
              >
                <StatusDot status={getSessionStatus(activeSessionId)} />
                <MessageSquare className="h-3 w-3" />
                <span>{currentSession?.title}</span>
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => handleDeleteThread(activeSessionId, e)}
                className="ml-1 p-0.5 rounded-full bg-zinc-400/30 backdrop-blur hover:bg-zinc-400/50 transition-colors"
              >
                <X className="h-2.5 w-2.5 text-white" />
              </button>
            </div>
          )}

          {/* Other thread chips - only those with titles */}
          {otherSessions.slice(0, 4).map((session) => (
            <div key={session.id} className="flex items-center">
              <button
                onClick={() => handleSwitchThread(session.id)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 rounded-2xl rounded-tl-md bg-zinc-800/60 shadow-lg hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
              >
                <StatusDot status={getSessionStatus(session.id)} />
                <MessageSquare className="h-3 w-3" />
                <span>{session.title}</span>
              </button>
              <button
                onClick={(e) => handleDeleteThread(session.id, e)}
                className="ml-1 p-0.5 rounded-full bg-zinc-400/30 backdrop-blur hover:bg-zinc-400/50 transition-colors"
              >
                <X className="h-2.5 w-2.5 text-white" />
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Expanded state - show messages
  return (
    <div
      className={cn(
        "flex-1 mt-2 overflow-hidden",
        "animate-in slide-in-from-top-2 fade-in duration-200"
      )}
    >
      {/* Thread chip - only shows if current session has a title */}
      {currentHasTitle && activeSessionId && (
        <div className="flex items-center px-2 mb-2">
          <button
            onClick={onCollapse}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-100 rounded-2xl rounded-tl-md bg-zinc-800 shadow-lg hover:bg-zinc-700 transition-colors"
          >
            <StatusDot status={getSessionStatus(activeSessionId)} />
            <MessageSquare className="h-3 w-3" />
            <span>{currentSession?.title}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => handleDeleteThread(activeSessionId, e)}
            className="ml-1 p-0.5 rounded-full bg-zinc-400/30 backdrop-blur hover:bg-zinc-400/50 transition-colors"
          >
            <X className="h-2.5 w-2.5 text-white" />
          </button>
        </div>
      )}

      <ScrollArea className="h-full" ref={scrollRef}>
        <div className="px-2 py-3 space-y-2">
          {/* Optimistic loading bubble - shown at top when waiting for response */}
          {waitingForResponse && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.25, ease: "easeOut" }}
              className="flex w-full justify-start"
            >
              <div className="px-3.5 py-2.5 rounded-2xl rounded-tl-md bg-zinc-800 text-zinc-100 shadow-lg">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                  <MessageSquare className="h-4 w-4 text-zinc-500" />
                </div>
              </div>
            </motion.div>
          )}

          {/* Messages displayed newest first (top), older below */}
          {reversedMessages.map((message, idx) => (
            <ChatMessage
              key={message.info.id || idx}
              message={message}
            />
          ))}

          {/* Show welcome hints at bottom if no data yet */}
          {!hasData && !hasMessages && <WelcomeHints />}

          {/* If we have data but no conversation, show a prompt */}
          {hasData && !hasMessages && <DataReadyHint />}
        </div>
      </ScrollArea>
    </div>
  );
}

// Status dot for session chips
function StatusDot({ status }: { status: "busy" | "error" | null }) {
  if (!status) return null;

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

  return null;
}

function WelcomeHints() {
  return (
    <div className="flex flex-col gap-3 py-8">
      <p className="text-sm text-muted-foreground/70 text-center mb-2">
        Get started by giving me some data
      </p>
      <div className="flex flex-wrap gap-2 justify-center">
        <HintChip icon={FileUp} label="Drop a file" />
        <HintChip icon={Link} label="Paste a URL" />
        <HintChip icon={Database} label="Connect a database" />
      </div>
    </div>
  );
}

function DataReadyHint() {
  return (
    <div className="py-8 text-center">
      <p className="text-sm text-muted-foreground/70">
        Your data is ready. Ask me anything about it!
      </p>
    </div>
  );
}

function HintChip({ icon: Icon, label }: { icon: typeof FileUp; label: string }) {
  return (
    <div className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-muted-foreground/60 rounded-full border border-white/10 bg-white/5 backdrop-blur-sm">
      <Icon className="h-3 w-3" />
      <span>{label}</span>
    </div>
  );
}
