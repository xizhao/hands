import { useState, useRef, useEffect } from "react";
import { useSendMessage, useAbortSession, useSessionStatuses, useCreateSession } from "@/hooks/useSession";
import { useServer } from "@/hooks/useServer";
import { useUIStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square, Loader2, Hand } from "lucide-react";
import { cn } from "@/lib/utils";
import { useWorkbook, useDevServerStatus, useDevServerRoutes, useWorkbookDatabase, useStartDevServer } from "@/hooks/useWorkbook";
import { ChatSettings } from "@/components/ChatSettings";

interface ChatBarProps {
  expanded: boolean;
  onExpandChange: (expanded: boolean) => void;
}

export function ChatBar({ expanded, onExpandChange }: ChatBarProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const { activeSessionId, activeWorkbookId, setActiveSession, setRuntimePort } = useUIStore();
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
    if (activeWorkbook && !devServerStatus?.runtime_port && !startDevServer.isPending) {
      startDevServer.mutate({
        workbookId: activeWorkbook.id,
        directory: activeWorkbook.directory,
      });
    }
  }, [activeWorkbook?.id, devServerStatus?.runtime_port, startDevServer.isPending]);

  // Update UIStore with runtime port
  useEffect(() => {
    if (devServerStatus?.runtime_port) {
      setRuntimePort(devServerStatus.runtime_port);
    }
  }, [devServerStatus?.runtime_port, setRuntimePort]);

  const status = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";

  // System prompt with workbook context
  const getSystemPrompt = () => {
    if (!activeWorkbook) return undefined;

    const dbInfo = workbookDatabase
      ? `Database: PostgreSQL on port ${workbookDatabase.port}, database "${workbookDatabase.database_name}"`
      : "Database: PostgreSQL (connecting...)";

    const serverInfo = devServerStatus?.running && devServerRoutes?.url
      ? `Dev Server: ${devServerRoutes.url}`
      : "Dev Server: Not running";

    return `You are working in the "${activeWorkbook.name}" workbook.
${activeWorkbook.description ? `Description: ${activeWorkbook.description}` : ""}

## Environment
- Working Directory: ${activeWorkbook.directory}
- ${dbInfo}
- ${serverInfo}

## Project Structure
- \`src/index.ts\` - Main worker with API routes (Hono framework)
- \`charts/\` - Data visualizations (React + Recharts)
- \`config/\` - Integration configurations

## Guidelines
- Use SchemaRead to view database tables and columns before writing queries
- Use psql to execute SQL queries
- Create API routes in src/index.ts
- Create charts in charts/ directory`;
  };

  const handleSubmit = async () => {
    if (!input.trim() || isBusy || !isConnected) return;

    const message = input.trim();
    setInput("");

    if (!expanded) {
      onExpandChange(true);
    }

    const system = getSystemPrompt();

    if (!activeSessionId) {
      createSession.mutate({}, {
        onSuccess: (newSession) => {
          setActiveSession(newSession.id);
          sendMessage.mutate({ sessionId: newSession.id, content: message, system });
        }
      });
      return;
    }

    sendMessage.mutate({ sessionId: activeSessionId, content: message, system });
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
      className="flex items-center gap-2 px-2 py-2 rounded-xl border border-border/40 bg-background/80 backdrop-blur-sm"
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

      {/* Input */}
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          if (!expanded) onExpandChange(true);
        }}
        placeholder="Ask anything..."
        className="flex-1 bg-transparent py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none"
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
            input.trim() && "bg-primary text-primary-foreground hover:bg-primary/90"
          )}
          disabled={!input.trim() || !isConnected || sendMessage.isPending || createSession.isPending}
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
