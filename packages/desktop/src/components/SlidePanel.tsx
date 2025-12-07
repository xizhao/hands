import { useEffect, useRef, useMemo, useCallback } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessages, useSessions, useDeleteSession } from "@/hooks/useSession";
import { useUIStore } from "@/stores/ui";
import { ChatMessage } from "@/components/ChatMessage";
import { cn } from "@/lib/utils";
import { Database, FileUp, Link, ChevronDown, ChevronUp, MessageSquare, X } from "lucide-react";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

interface SlidePanelProps {
  expanded: boolean;
  hasData: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}

export function SlidePanel({ expanded, hasData, onCollapse, onExpand }: SlidePanelProps) {
  const { activeSessionId, setActiveSession } = useUIStore();
  const { data: messages = [] } = useMessages(activeSessionId);
  const { data: sessions = [] } = useSessions();
  const deleteSession = useDeleteSession();

  // Get current session info
  const currentSession = sessions.find(s => s.id === activeSessionId);

  // Other sessions for switching - only those with titles
  const otherSessions = sessions.filter(s => s.id !== activeSessionId && s.title);

  // Check if current session has a title
  const currentHasTitle = Boolean(currentSession?.title);
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
    deleteSession.mutate(sessionId, {
      onSuccess: () => {
        // If we deleted the active session, switch to another one
        if (sessionId === activeSessionId && sessions.length > 1) {
          const nextSession = sessions.find(s => s.id !== sessionId);
          if (nextSession) {
            setActiveSession(nextSession.id);
          }
        }
      }
    });
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
          {currentHasTitle && (
            <div className="flex items-center">
              <button
                onClick={onExpand}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-100 rounded-2xl rounded-tl-md bg-zinc-800 shadow-lg hover:bg-zinc-700 transition-colors"
              >
                <MessageSquare className="h-3 w-3" />
                <span>{currentSession?.title}</span>
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => handleDeleteThread(activeSessionId!, e)}
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
      {currentHasTitle && (
        <div className="flex items-center px-2 mb-2">
          <button
            onClick={onCollapse}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-100 rounded-2xl rounded-tl-md bg-zinc-800 shadow-lg hover:bg-zinc-700 transition-colors"
          >
            <MessageSquare className="h-3 w-3" />
            <span>{currentSession?.title}</span>
            <ChevronDown className="h-3 w-3" />
          </button>
          <button
            onClick={(e) => handleDeleteThread(activeSessionId!, e)}
            className="ml-1 p-0.5 rounded-full bg-zinc-400/30 backdrop-blur hover:bg-zinc-400/50 transition-colors"
          >
            <X className="h-2.5 w-2.5 text-white" />
          </button>
        </div>
      )}

      <ScrollArea className="h-full" ref={scrollRef}>
        <div className="px-2 py-3 space-y-2">
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
