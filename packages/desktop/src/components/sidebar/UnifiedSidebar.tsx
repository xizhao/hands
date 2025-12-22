/**
 * UnifiedSidebar - Shows chat when thread open, browse when closed
 *
 * Simple toggle:
 * - Active session → Chat view (input, chips, messages)
 * - No session → Browse view (pages, sources, tables, actions)
 */

import { invoke } from "@tauri-apps/api/core";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Database,
  Hand,
  Layers,
  Loader2,
  Paperclip,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { ChatMessage } from "@/components/ChatMessage";
import { ChatSettings } from "@/components/ChatSettings";
import { Button } from "@/components/ui/button";
import { ShimmerText } from "@/components/ui/thinking-indicator";
import { ATTACHMENT_TYPE, useChatState } from "@/hooks/useChatState";
import { useActiveSession } from "@/hooks/useNavState";
import { useRuntimeProcess } from "@/hooks/useRuntimeState";
import { useServer } from "@/hooks/useServer";
import {
  useAbortSession,
  useCreateSession,
  useDeleteSession,
  useMessages,
  useSendMessage,
  useSessionStatuses,
  useSessions,
} from "@/hooks/useSession";
import { useWorkbook, useWorkbookDatabase } from "@/hooks/useWorkbook";
import { fillTemplate, PROMPTS } from "@/lib/prompts";
import type { Session } from "@/lib/api";
import { cn } from "@/lib/utils";
import { NotebookSidebar } from "./NotebookSidebar";

interface CopyFilesResult {
  copied_files: string[];
  data_dir: string;
}

type SessionWithParent = Session & { parentID?: string };

interface UnifiedSidebarProps {
  compact?: boolean;
  onSelectItem?: (type: "page" | "source" | "table" | "action", id: string) => void;
}

export function UnifiedSidebar({ compact = false, onSelectItem }: UnifiedSidebarProps) {
  const chatState = useChatState();
  const { sessionId: activeSessionId, setSession: setActiveSession } = useActiveSession();
  const { workbookId: activeWorkbookId } = useRuntimeProcess();
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const { data: sessions = [] } = useSessions();
  const { data: messages = [], isLoading } = useMessages(activeSessionId);
  const { isConnected } = useServer();

  const sendMessage = useSendMessage();
  const createSession = useCreateSession();
  const abortSession = useAbortSession(activeSessionId);
  const deleteSession = useDeleteSession();

  const { data: activeWorkbook } = useWorkbook(activeWorkbookId);
  const { data: workbookDatabase } = useWorkbookDatabase(activeWorkbookId);

  const [input, setInput] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [showBackgroundSessions, setShowBackgroundSessions] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const status = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";
  const activeForm = status?.type === "busy" ? status.activeForm : undefined;

  // Check if waiting for response
  const lastMessage = messages[messages.length - 1];
  const lastAssistantMessage = messages.filter((m) => m.info.role === "assistant").pop();
  const hasAssistantContent = lastAssistantMessage?.parts?.some(
    (p) => p.type === "text" || p.type === "tool" || p.type === "reasoning",
  );
  const waitingForResponse =
    isBusy && (!lastAssistantMessage || !hasAssistantContent || lastMessage?.info.role === "user");

  // Show chat if there's an active session with messages, loading, or busy
  const showChat = !!activeSessionId && (messages.length > 0 || isLoading || isBusy);

  const getSystemPrompt = useCallback(() => {
    if (!activeWorkbook) return undefined;
    const dbInfo = workbookDatabase
      ? `PostgreSQL on port ${workbookDatabase.port}, database "${workbookDatabase.database_name}"`
      : "PostgreSQL (connecting...)";
    return `## Current Workbook Context
- **Workbook**: ${activeWorkbook.name}${activeWorkbook.description ? ` - ${activeWorkbook.description}` : ""}
- **Directory**: ${activeWorkbook.directory}
- **Database**: ${dbInfo}`;
  }, [activeWorkbook, workbookDatabase]);

  const handleSubmit = useCallback(async () => {
    const pendingAttachment = chatState.pendingAttachment;
    const hasContent = input.trim() || pendingAttachment;
    if (!hasContent || isBusy || !isConnected) return;

    const userText = input.trim();
    setInput("");
    setIsUploadingFile(!!pendingAttachment);

    if (inputRef.current) {
      inputRef.current.style.height = "auto";
    }

    const system = getSystemPrompt();

    let finalMessage = userText;
    if (pendingAttachment) {
      if (pendingAttachment.type === ATTACHMENT_TYPE.SOURCE) {
        const sourceUri = `source://${pendingAttachment.sourceId}`;
        finalMessage = userText ? `${userText}\n\n[Context: ${sourceUri}]` : `[Context: ${sourceUri}]`;
        chatState.setPendingAttachment(null);
      } else if (pendingAttachment.type === ATTACHMENT_TYPE.FILE && activeWorkbookId) {
        try {
          const buffer = await pendingAttachment.file.arrayBuffer();
          const bytes = Array.from(new Uint8Array(buffer));
          const result = await invoke<CopyFilesResult>("write_file_to_workbook", {
            workbookId: activeWorkbookId,
            fileData: { filename: pendingAttachment.name, bytes },
          });
          const filePath = result.copied_files[0];
          if (filePath) {
            finalMessage = userText ? `${userText}\n\n[Attached file: ${filePath}]` : `[Attached file: ${filePath}]`;
          }
        } catch (err) {
          console.error("[UnifiedSidebar] Failed to copy attachment:", err);
        }
        chatState.setPendingAttachment(null);
      } else if (pendingAttachment.type === ATTACHMENT_TYPE.FILEPATH) {
        finalMessage = fillTemplate("IMPORT_FILE", { filePath: pendingAttachment.filePath });
        chatState.setPendingAttachment(null);
      }
    }
    setIsUploadingFile(false);

    if (!activeSessionId) {
      createSession.mutate(
        {},
        {
          onSuccess: (newSession) => {
            setActiveSession(newSession.id);
            sendMessage.mutate({ sessionId: newSession.id, content: finalMessage, system });
          },
        },
      );
      return;
    }

    sendMessage.mutate({ sessionId: activeSessionId, content: finalMessage, system });
  }, [input, chatState, isBusy, isConnected, activeWorkbookId, activeSessionId, getSystemPrompt, createSession, setActiveSession, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAbort = () => {
    if (activeSessionId) abortSession.mutate();
  };

  // Auto-submit for file drops
  useEffect(() => {
    const pending = chatState.pendingAttachment;
    if (chatState.autoSubmitPending && pending && isConnected && !isBusy) {
      chatState.setAutoSubmitPending(false);
      if (pending.type === ATTACHMENT_TYPE.FILEPATH) {
        setTimeout(() => handleSubmit(), 0);
      } else if (pending.type === ATTACHMENT_TYPE.FILE) {
        setInput(PROMPTS.IMPORT_FILE);
        setTimeout(() => handleSubmit(), 0);
      }
    }
  }, [chatState, isConnected, isBusy, handleSubmit]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Session management
  const foregroundSessions = sessions.filter((s) => {
    const sp = s as SessionWithParent;
    return s.title && !sp.parentID;
  });
  const backgroundSessions = sessions.filter((s) => (s as SessionWithParent).parentID);

  const lastAssistantHasError = Boolean(
    lastAssistantMessage?.info?.role === "assistant" && (lastAssistantMessage.info as { error?: unknown }).error,
  );

  const getSessionStatus = (sessionId: string): "busy" | "error" | null => {
    const st = sessionStatuses[sessionId];
    if (st?.type === "busy" || st?.type === "running") return "busy";
    if (sessionId === activeSessionId && lastAssistantHasError) return "error";
    return null;
  };

  const allChips = foregroundSessions.slice(0, 5).map((s) => ({
    id: s.id,
    title: s.title || "",
    status: getSessionStatus(s.id),
    isCurrent: s.id === activeSessionId,
  }));

  const backgroundCount = backgroundSessions.length;
  const backgroundBusyCount = backgroundSessions.filter((s) => {
    const st = sessionStatuses[s.id];
    return st?.type === "busy" || st?.type === "running";
  }).length;

  const hasChips = allChips.length > 0 || backgroundCount > 0;
  const pendingAttachment = chatState.pendingAttachment;
  const hasContent = input.trim() || pendingAttachment;
  const sendError = sendMessage.error || createSession.error;
  const displayError = sendError || chatState.sessionError;

  const handleSwitchThread = (sessionId: string) => setActiveSession(sessionId);
  const handleDeleteThread = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession.mutate(sessionId);
    if (sessionId === activeSessionId) setActiveSession(null);
  };
  const handleCloseChat = () => setActiveSession(null);

  return (
    <div className="flex flex-col h-full">
      {/* Input bar - always visible */}
      <div className={cn("shrink-0 py-2", compact ? "px-2" : "px-3")}>
        {displayError && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded-md bg-red-500/10 text-xs text-red-500">
            <span className="truncate">
              {sendError instanceof Error ? sendError.message : chatState.sessionError?.message || "Failed to send"}
            </span>
            <button
              onClick={() => { sendMessage.reset(); createSession.reset(); chatState.clearSessionError(); }}
              className="p-0.5 rounded hover:bg-red-500/20 shrink-0"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        {pendingAttachment && (
          <div className="flex items-center gap-1 mb-2">
            <div className="flex items-center gap-1.5 px-2 py-1 rounded-md bg-accent/50 text-xs">
              {pendingAttachment.type === ATTACHMENT_TYPE.SOURCE ? (
                <Database className="h-3 w-3 text-muted-foreground" />
              ) : (
                <Paperclip className="h-3 w-3 text-muted-foreground" />
              )}
              <span className="max-w-[150px] truncate">{pendingAttachment.name}</span>
              <button onClick={() => chatState.setPendingAttachment(null)} className="p-0.5 rounded hover:bg-accent">
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
        )}

        <div className="flex items-end gap-2">
          <ChatSettings>
            <Button variant="ghost" size="icon" className={cn("h-8 w-8 shrink-0 rounded-lg", !isConnected && "text-red-400")}>
              <Hand className="h-5 w-5" />
            </Button>
          </ChatSettings>

          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={pendingAttachment ? "Add a message..." : "Ask anything..."}
            rows={1}
            className="flex-1 bg-transparent py-1 text-sm placeholder:text-muted-foreground/50 focus:outline-none resize-none overflow-y-auto max-h-[120px]"
          />

          {isBusy ? (
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0 rounded-lg" onClick={handleAbort}>
              <Square className="h-3.5 w-3.5" />
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className={cn("h-7 w-7 shrink-0 rounded-lg", hasContent && "bg-primary text-primary-foreground hover:bg-primary/90")}
              disabled={!hasContent || !isConnected || sendMessage.isPending || createSession.isPending || isUploadingFile}
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

      {/* Session chips */}
      {hasChips && (
        <div className={cn("shrink-0 flex items-center gap-1 py-1.5 border-b border-border/50", compact ? "px-2" : "px-3")}>
          <div className="flex flex-wrap gap-1 min-w-0 flex-1">
            {allChips.map((chip) => (
              <div key={chip.id} className="flex items-center">
                <button
                  onClick={() => handleSwitchThread(chip.id)}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded transition-colors",
                    chip.isCurrent ? "bg-muted text-foreground" : "text-muted-foreground hover:bg-muted/50",
                  )}
                >
                  <StatusDot status={chip.status} />
                  <span className={cn("truncate", compact ? "max-w-[50px]" : "max-w-[80px]")}>{chip.title}</span>
                </button>
                <button
                  onClick={(e) => handleDeleteThread(chip.id, e)}
                  className="p-0.5 rounded-full hover:bg-muted opacity-40 hover:opacity-100"
                >
                  <X className="h-2 w-2" />
                </button>
              </div>
            ))}
          </div>

          {backgroundCount > 0 && (
            <div className="relative shrink-0">
              <button
                onClick={() => setShowBackgroundSessions(!showBackgroundSessions)}
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded",
                  showBackgroundSessions ? "bg-muted/80" : "text-muted-foreground/50 hover:bg-muted/30",
                )}
              >
                <span className="tabular-nums">{backgroundCount}</span>
                {backgroundBusyCount > 0 ? (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative rounded-full h-2 w-2 bg-green-500" />
                  </span>
                ) : (
                  <Layers className="h-3 w-3 opacity-60" />
                )}
              </button>
              <AnimatePresence>
                {showBackgroundSessions && (
                  <motion.div
                    initial={{ opacity: 0, y: -5 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -5 }}
                    className="absolute top-full right-0 mt-1 min-w-[160px] rounded-lg border bg-background/95 backdrop-blur-xl shadow-lg z-50"
                  >
                    <div className="p-1 max-h-[200px] overflow-y-auto">
                      <div className="px-2 py-1 text-[9px] uppercase text-muted-foreground/50 font-medium">Background</div>
                      {backgroundSessions.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => { handleSwitchThread(session.id); setShowBackgroundSessions(false); }}
                          className="flex items-center gap-2 w-full px-2 py-1 text-[11px] rounded hover:bg-muted/50 text-left"
                        >
                          <StatusDot status={getSessionStatus(session.id)} />
                          <span className="truncate">{session.title || `Subtask ${session.id.slice(0, 6)}`}</span>
                        </button>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      )}

      {/* Content: Chat messages OR Browse */}
      <div className="flex-1 overflow-y-auto">
        {showChat ? (
          // Chat messages
          <div className={cn("space-y-1", compact ? "p-2" : "p-3")}>
            {messages.map((message, idx) => (
              <ChatMessage key={message.info.id || idx} message={message} compact />
            ))}
            {waitingForResponse && (
              <motion.div initial={{ opacity: 0, y: 5 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
                <div className="px-2.5 py-1.5 rounded-lg rounded-tl-sm bg-muted">
                  <ShimmerText text={activeForm || "Thinking..."} className="text-xs" />
                </div>
              </motion.div>
            )}
            <div ref={messagesEndRef} />
          </div>
        ) : (
          // Browse view
          <div className={cn(compact ? "p-2" : "p-3")}>
            <NotebookSidebar
              collapsed={false}
              fullWidth={!compact}
              preventNavigation={!compact}
              onSelectItem={onSelectItem}
            />
          </div>
        )}
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: "busy" | "error" | null }) {
  if (status === "busy") {
    return (
      <span className="relative flex h-1.5 w-1.5">
        <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
        <span className="relative rounded-full h-1.5 w-1.5 bg-green-500" />
      </span>
    );
  }
  if (status === "error") return <span className="rounded-full h-1.5 w-1.5 bg-red-500" />;
  return <span className="rounded-full h-1.5 w-1.5 bg-muted-foreground/40" />;
}
