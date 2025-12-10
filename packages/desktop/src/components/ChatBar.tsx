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
import { ArrowUp, Hand, Loader2, Square, X, Paperclip, Blocks } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

interface ChatBarProps {
  expanded: boolean;
  onExpandChange: (expanded: boolean) => void;
}

interface CopyFilesResult {
  copied_files: string[];
  data_dir: string;
}

export function ChatBar({ expanded, onExpandChange }: ChatBarProps) {
  const [input, setInput] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const {
    activeSessionId,
    activeWorkbookId,
    setActiveSession,
    setRuntimePort,
    pendingAttachment,
    setPendingAttachment,
    autoSubmitPending,
    setAutoSubmitPending,
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

  const handleSubmit = useCallback(async () => {
    // Allow sending with just attachment (no text required)
    const hasContent = input.trim() || pendingAttachment;
    if (!hasContent || isBusy || !isConnected) return;

    const userText = input.trim();
    setInput("");
    setIsUploadingFile(!!pendingAttachment);

    // Reset textarea height
    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    if (!expanded) {
      onExpandChange(true);
    }

    const system = getSystemPrompt();

    // Build message content based on attachment type
    let finalMessage = userText;
    if (pendingAttachment) {
      if (pendingAttachment.type === "block") {
        // Block attachment - include block:// URI
        const blockUri = `block://${pendingAttachment.blockId}`;
        finalMessage = userText
          ? `${userText}\n\n[Attached block: ${blockUri}]`
          : `[Attached block: ${blockUri}]`;
        setPendingAttachment(null);
      } else if (pendingAttachment.type === "file" && activeWorkbookId) {
        // File attachment - copy to workbook and include path
        try {
          const buffer = await pendingAttachment.file.arrayBuffer();
          const bytes = Array.from(new Uint8Array(buffer));
          const result = await invoke<CopyFilesResult>("write_file_to_workbook", {
            workbookId: activeWorkbookId,
            fileData: { filename: pendingAttachment.name, bytes },
          });

          const filePath = result.copied_files[0];
          if (filePath) {
            finalMessage = userText
              ? `${userText}\n\n[Attached file: ${filePath}]`
              : `[Attached file: ${filePath}]`;
          }
        } catch (err) {
          console.error("[ChatBar] Failed to copy attachment:", err);
        }
        setPendingAttachment(null);
      }
    }
    setIsUploadingFile(false);

    if (!activeSessionId) {
      createSession.mutate(
        {},
        {
          onSuccess: (newSession) => {
            setActiveSession(newSession.id);
            sendMessage.mutate({
              sessionId: newSession.id,
              content: finalMessage,
              system,
            });
          },
        }
      );
      return;
    }

    sendMessage.mutate({
      sessionId: activeSessionId,
      content: finalMessage,
      system,
    });
  }, [input, pendingAttachment, isBusy, isConnected, expanded, activeWorkbookId, activeSessionId, onExpandChange, getSystemPrompt, setPendingAttachment, createSession, setActiveSession, sendMessage]);

  // Auto-submit when file is dropped or block error fix is triggered
  useEffect(() => {
    if (autoSubmitPending && pendingAttachment && isConnected && !isBusy) {
      setAutoSubmitPending(false);

      if (pendingAttachment.type === "file") {
        // File drops: import prompt
        setInput("Import this data and make it useful");
      } else if (pendingAttachment.type === "block" && pendingAttachment.errorContext) {
        // Block error fix: include block ID and error context in prompt
        setInput(`Fix the error in block "${pendingAttachment.blockId}": ${pendingAttachment.errorContext}`);
      } else {
        // Other cases: don't auto-submit
        return;
      }

      // Submit on next tick after input is set
      setTimeout(() => handleSubmit(), 0);
    }
  }, [autoSubmitPending, pendingAttachment, isConnected, isBusy, setAutoSubmitPending, handleSubmit]);

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

  const hasContent = input.trim() || pendingAttachment;

  return (
    <div
      data-chat-bar
      className="flex flex-col gap-1 px-2 py-2 rounded-xl border border-border/40 bg-background/80 backdrop-blur-sm overflow-visible"
    >
      {/* Attachment chip - show when file or block is attached */}
      {pendingAttachment && (
        <div className="flex items-center gap-1 px-1">
          <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/50 text-xs">
            {pendingAttachment.type === "block" ? (
              <Blocks className="h-3 w-3 text-muted-foreground" />
            ) : (
              <Paperclip className="h-3 w-3 text-muted-foreground" />
            )}
            <span className="max-w-[200px] truncate">{pendingAttachment.name}</span>
            <button
              onClick={() => setPendingAttachment(null)}
              className="p-0.5 rounded hover:bg-accent transition-colors"
            >
              <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
            </button>
          </div>
        </div>
      )}

      {/* Input row */}
      <div className="flex items-end gap-2">
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
          placeholder={pendingAttachment ? "Add a message (optional)..." : "Ask anything..."}
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
              hasContent &&
                "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            disabled={
              !hasContent ||
              !isConnected ||
              sendMessage.isPending ||
              createSession.isPending ||
              isUploadingFile
            }
            onClick={handleSubmit}
          >
            {sendMessage.isPending || createSession.isPending || isUploadingFile ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ArrowUp className="h-3.5 w-3.5" />
            )}
        </Button>
      )}
      </div>
    </div>
  );
}
