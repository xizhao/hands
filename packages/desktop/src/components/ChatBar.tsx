import { ChatSettings } from "@/components/ChatSettings";
import { Button } from "@/components/ui/button";
import { useServer } from "@/hooks/useServer";
import {
  useAbortSession,
  useCreateSession,
  useSendMessage,
  useSessionStatuses,
} from "@/hooks/useSession";
import {
  useDevServerRoutes,
  useDevServerStatus,
  useStartDevServer,
  useWorkbook,
  useWorkbookDatabase,
} from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/ui";
import { ArrowUp, Hand, Loader2, Square } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface ChatBarProps {
  expanded: boolean;
  onExpandChange: (expanded: boolean) => void;
}

export function ChatBar({ expanded, onExpandChange }: ChatBarProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const {
    activeSessionId,
    activeWorkbookId,
    setActiveSession,
    setRuntimePort,
  } = useUIStore();
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const sendMessage = useSendMessage();
  const abortSession = useAbortSession(activeSessionId);
  const { isConnected } = useServer();

  // Session management
  const createSession = useCreateSession();

  // Workbook context
  const { data: activeWorkbook } = useWorkbook(activeWorkbookId);
  const startDevServer = useStartDevServer();
  const { data: devServerStatus } = useDevServerStatus(activeWorkbookId);
  const { data: devServerRoutes } = useDevServerRoutes(activeWorkbookId);
  const { data: workbookDatabase } = useWorkbookDatabase(activeWorkbookId);

  // Auto-start dev server when workbook changes
  useEffect(() => {
    if (
      activeWorkbook &&
      !devServerStatus?.runtime_port &&
      !startDevServer.isPending
    ) {
      startDevServer.mutate({
        workbookId: activeWorkbook.id,
        directory: activeWorkbook.directory,
      });
    }
  }, [
    activeWorkbook?.id,
    devServerStatus?.runtime_port,
    startDevServer.isPending,
  ]);

  // Update UIStore with runtime port
  useEffect(() => {
    if (devServerStatus?.runtime_port) {
      setRuntimePort(devServerStatus.runtime_port);
    }
  }, [devServerStatus?.runtime_port, setRuntimePort]);

  const status = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";

  // Dynamic context for the current workbook session
  const getSystemPrompt = () => {
    if (!activeWorkbook) return undefined;

    const dbInfo = workbookDatabase
      ? `PostgreSQL on port ${workbookDatabase.port}, database "${workbookDatabase.database_name}"`
      : "PostgreSQL (connecting...)";

    const serverInfo =
      devServerStatus?.running && devServerRoutes?.url
        ? devServerRoutes.url
        : "Not running";

    return `## Current Workbook Context
- **Workbook**: ${activeWorkbook.name}${activeWorkbook.description ? ` - ${activeWorkbook.description}` : ""}
- **Directory**: ${activeWorkbook.directory}
- **Database**: ${dbInfo}
- **Dev Server**: ${serverInfo}`;
  };

  const handleSubmit = async () => {
    if (!input.trim() || isBusy || !isConnected) return;

    const message = input.trim();
    setInput("");

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    if (!expanded) {
      onExpandChange(true);
    }

    const system = getSystemPrompt();

    if (!activeSessionId) {
      createSession.mutate(
        {},
        {
          onSuccess: (newSession) => {
            setActiveSession(newSession.id);
            sendMessage.mutate({
              sessionId: newSession.id,
              content: message,
              system,
            });
          },
        }
      );
      return;
    }

    sendMessage.mutate({
      sessionId: activeSessionId,
      content: message,
      system,
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape" && expanded) {
      onExpandChange(false);
    }
  };

  const handleAbort = () => {
    if (activeSessionId) {
      abortSession.mutate();
    }
  };

  return (
    <div
      data-chat-bar
      className="flex items-end gap-2 px-2 py-2 rounded-xl border border-border/40 bg-background/80 backdrop-blur-sm overflow-visible"
    >
      {/* OpenCode settings button */}
      <ChatSettings>
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-8 w-8 shrink-0 rounded-lg",
            !isConnected && "text-red-400"
          )}
        >
          <Hand className="h-5 w-5" />
        </Button>
      </ChatSettings>

      {/* Input - textarea for multiline with auto-resize and scroll */}
      <textarea
        ref={inputRef}
        value={input}
        onChange={(e) => {
          setInput(e.target.value);
          // Auto-resize textarea
          e.target.style.height = "auto";
          e.target.style.height = Math.min(e.target.scrollHeight, 120) + "px";
        }}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (!expanded) onExpandChange(true);
        }}
        placeholder="Ask anything..."
        rows={1}
        className="flex-1 bg-transparent py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none resize-none overflow-y-auto max-h-[120px] scrollbar-thin"
      />

      {/* Submit/Abort button */}
      {isBusy ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 rounded-lg"
          onClick={handleAbort}
        >
          <Square className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          variant="ghost"
          size="icon"
          className={cn(
            "h-7 w-7 shrink-0 rounded-lg transition-colors",
            input.trim() &&
              "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          disabled={
            !input.trim() ||
            !isConnected ||
            sendMessage.isPending ||
            createSession.isPending
          }
          onClick={handleSubmit}
        >
          {sendMessage.isPending || createSession.isPending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <ArrowUp className="h-3.5 w-3.5" />
          )}
        </Button>
      )}
    </div>
  );
}
