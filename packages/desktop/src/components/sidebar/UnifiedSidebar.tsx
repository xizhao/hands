/**
 * UnifiedSidebar - Search + Chat input with filtered sidebar
 *
 * Features:
 * - Single input that serves as both search and chat
 * - As you type, filters the NotebookSidebar content in place
 * - Enter sends as chat prompt
 * - Shows chat messages when thread is active
 */

import { ChatMessage } from "@/components/ChatMessage";
import { ChatSettings } from "@/components/ChatSettings";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
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
  useSessions,
  useSessionStatuses,
} from "@/hooks/useSession";
import { useWorkbook, useWorkbookDatabase } from "@/hooks/useWorkbook";
import type { Session } from "@/lib/api";
import { fillTemplate, PROMPTS } from "@/lib/prompts";
import { cn } from "@/lib/utils";
import { STDLIB_QUICK_REF } from "@hands/core/docs";
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
import { NotebookSidebar } from "./NotebookSidebar";

interface CopyFilesResult {
  copied_files: string[];
  data_dir: string;
}

type SessionWithParent = Session & { parentID?: string };

interface UnifiedSidebarProps {
  compact?: boolean;
  onSelectItem?: (
    type: "page" | "source" | "table" | "action",
    id: string
  ) => void;
}

export function UnifiedSidebar({
  compact = false,
  onSelectItem,
}: UnifiedSidebarProps) {
  const chatState = useChatState();
  const { sessionId: activeSessionId, setSession: setActiveSession } =
    useActiveSession();
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
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const expandedInputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track container width to skip popover when wide enough
  const POPOVER_WIDTH = 400;
  const needsPopover = containerWidth < POPOVER_WIDTH;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setContainerWidth(entry.contentRect.width);
      }
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const status = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";
  const activeForm = status?.type === "busy" ? status.activeForm : undefined;

  // Check if waiting for response
  const lastMessage = messages[messages.length - 1];
  const lastAssistantMessage = messages
    .filter((m) => m.info.role === "assistant")
    .pop();
  const hasAssistantContent = lastAssistantMessage?.parts?.some(
    (p) => p.type === "text" || p.type === "tool" || p.type === "reasoning"
  );
  const waitingForResponse =
    isBusy &&
    (!lastAssistantMessage ||
      !hasAssistantContent ||
      lastMessage?.info.role === "user");

  // Show chat if there's an active session with messages, loading, or busy
  const showChat =
    !!activeSessionId && (messages.length > 0 || isLoading || isBusy);

  // Filter query for NotebookSidebar (only when not in chat mode)
  const filterQuery = showChat ? "" : input.trim();

  const getSystemPrompt = useCallback(() => {
    if (!activeWorkbook) return undefined;
    const dbInfo = workbookDatabase
      ? `PostgreSQL on port ${workbookDatabase.port}, database "${workbookDatabase.database_name}"`
      : "PostgreSQL (connecting...)";
    return `## Current Workbook Context
- **Workbook**: ${activeWorkbook.name}${
      activeWorkbook.description ? ` - ${activeWorkbook.description}` : ""
    }
- **Directory**: ${activeWorkbook.directory}
- **Database**: ${dbInfo}

## MDX Response Format
For data questions, analysis, and visualizations that don't require file persistence, respond directly with MDX components (NO code fences). Your response will be rendered as rich interactive content.

### Process:
1. **First**, use the SQL tool (psql) to explore tables and verify data exists
2. **Then**, respond with MDX using queries you know will work

### When to use MDX responses:
- Answering questions about data ("How many users signed up last week?")
- Showing charts and visualizations ("Show me revenue by month")
- Displaying metrics and summaries ("What's the current order status breakdown?")
- Any Q&A that can be answered with a query + visualization

### MDX Component Reference
${STDLIB_QUICK_REF}

### Examples:
**User:** "How many orders this month?"
**Response:**
<LiveValue query="SELECT COUNT(*) FROM orders WHERE created_at >= date_trunc('month', now())" display="inline" /> orders this month.

**User:** "Show revenue by category"
**Response:**
<LiveValue query="SELECT category, SUM(amount) as revenue FROM orders GROUP BY category ORDER BY revenue DESC">
  <BarChart xKey="category" yKey="revenue" />
</LiveValue>

**User:** "Give me a dashboard of key metrics"
**Response:**
<Columns>
  <LiveValue query="SELECT COUNT(*) as value FROM users" label="Total Users" />
  <LiveValue query="SELECT SUM(amount) as value FROM orders" label="Revenue" format="currency" />
  <LiveValue query="SELECT COUNT(*) as value FROM orders WHERE status = 'pending'" label="Pending Orders" />
</Columns>

### Rules:
- Output MDX directly - NEVER wrap in code fences (\`\`\`mdx or \`\`\`)
- Use ONLY components from the reference above
- Wrap charts in LiveValue to provide SQL data
- For simple values, use display="inline" to embed in text
- Use Columns to arrange multiple metrics horizontally
- Write valid SQL for the PostgreSQL database`;
  }, [activeWorkbook, workbookDatabase]);

  const handleSubmit = useCallback(async () => {
    const pendingAttachment = chatState.pendingAttachment;
    const hasContent = input.trim() || pendingAttachment;
    if (!hasContent || isBusy || !isConnected) return;

    const userText = input.trim();
    setInput("");
    setIsUploadingFile(!!pendingAttachment);

    const system = getSystemPrompt();

    let finalMessage = userText;
    if (pendingAttachment) {
      if (pendingAttachment.type === ATTACHMENT_TYPE.SOURCE) {
        const sourceUri = `source://${pendingAttachment.sourceId}`;
        finalMessage = userText
          ? `${userText}\n\n[Context: ${sourceUri}]`
          : `[Context: ${sourceUri}]`;
        chatState.setPendingAttachment(null);
      } else if (
        pendingAttachment.type === ATTACHMENT_TYPE.FILE &&
        activeWorkbookId
      ) {
        try {
          const buffer = await pendingAttachment.file.arrayBuffer();
          const bytes = Array.from(new Uint8Array(buffer));
          const result = await invoke<CopyFilesResult>(
            "write_file_to_workbook",
            {
              workbookId: activeWorkbookId,
              fileData: { filename: pendingAttachment.name, bytes },
            }
          );
          const filePath = result.copied_files[0];
          if (filePath) {
            finalMessage = userText
              ? `${userText}\n\n[Attached file: ${filePath}]`
              : `[Attached file: ${filePath}]`;
          }
        } catch (err) {
          console.error("[UnifiedSidebar] Failed to copy attachment:", err);
        }
        chatState.setPendingAttachment(null);
      } else if (pendingAttachment.type === ATTACHMENT_TYPE.FILEPATH) {
        finalMessage = fillTemplate("IMPORT_FILE", {
          filePath: pendingAttachment.filePath,
        });
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
  }, [
    input,
    chatState,
    isBusy,
    isConnected,
    activeWorkbookId,
    activeSessionId,
    getSystemPrompt,
    createSession,
    setActiveSession,
    sendMessage,
  ]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === "Escape" && input) {
      e.preventDefault();
      setInput("");
    }
  };

  const handleAbort = () => {
    if (activeSessionId) abortSession.mutate();
  };

  // File picker - opens native dialog and sets filepath attachment
  const handlePickFile = useCallback(async () => {
    try {
      const filePath = await invoke<string | null>("pick_file");
      if (filePath) {
        const fileName = filePath.split("/").pop() || filePath;
        chatState.setPendingAttachment({
          type: ATTACHMENT_TYPE.FILEPATH,
          filePath,
          name: fileName,
        });
      }
    } catch (err) {
      console.error("[UnifiedSidebar] Failed to pick file:", err);
    }
  }, [chatState]);

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

  // Auto-scroll to top (newest messages are at top with flex-col-reverse)
  // Triggers both when messages change and when switching threads
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [messages.length, activeSessionId]);

  // Session management
  const foregroundSessions = sessions.filter((s) => {
    const sp = s as SessionWithParent;
    return s.title && !sp.parentID;
  });
  const backgroundSessions = sessions.filter(
    (s) => (s as SessionWithParent).parentID
  );

  const lastAssistantHasError = Boolean(
    lastAssistantMessage?.info?.role === "assistant" &&
      (lastAssistantMessage.info as { error?: unknown }).error
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

  const handleSwitchThread = (sessionId: string) => {
    // Toggle off if clicking the active session to go back to browse view
    if (sessionId === activeSessionId) {
      setActiveSession(null);
    } else {
      setActiveSession(sessionId);
    }
  };
  const handleDeleteThread = (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession.mutate(sessionId);
    if (sessionId === activeSessionId) setActiveSession(null);
  };

  // Determine placeholder text
  const placeholder = pendingAttachment
    ? "Add a message..."
    : showChat
    ? "Reply..."
    : "Search or ask anything...";

  return (
    <div ref={containerRef} className="flex flex-col h-full">
      {/* Input bar - always visible */}
      <div className={cn("shrink-0 py-2", compact ? "px-2" : "px-3")}>
        {displayError && (
          <div className="flex items-center gap-1.5 px-2 py-1.5 mb-2 rounded-md bg-red-500/10 text-xs text-red-500">
            <span className="truncate">
              {sendError instanceof Error
                ? sendError.message
                : chatState.sessionError?.message || "Failed to send"}
            </span>
            <button
              onClick={() => {
                sendMessage.reset();
                createSession.reset();
                chatState.clearSessionError();
              }}
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
              <span className="max-w-[150px] truncate">
                {pendingAttachment.name}
              </span>
              <button
                onClick={() => chatState.setPendingAttachment(null)}
                className="p-0.5 rounded hover:bg-accent"
              >
                <X className="h-3 w-3 text-muted-foreground" />
              </button>
            </div>
          </div>
        )}

        {/* Input bar - inline when wide enough, popover when narrow */}
        {needsPopover ? (
          <Popover open={isInputExpanded} onOpenChange={setIsInputExpanded}>
            <PopoverAnchor asChild>
              <div
                className="flex items-center gap-1.5 bg-background rounded-xl px-2 py-1.5 border border-border/40 cursor-text transition-all hover:border-border/60 hover:shadow-sm"
                onClick={() => setIsInputExpanded(true)}
              >
                <ChatSettings>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 shrink-0 rounded-lg",
                      !isConnected && "text-red-400"
                    )}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Hand className="h-4 w-4" />
                  </Button>
                </ChatSettings>

                <div
                  className={cn(
                    "flex-1 min-w-0 py-0.5 text-sm overflow-hidden text-ellipsis whitespace-nowrap",
                    input ? "text-foreground" : "text-muted-foreground/50"
                  )}
                >
                  {input || placeholder}
                </div>

                <button
                  className="p-1 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
                  onClick={(e) => {
                    e.stopPropagation();
                    handlePickFile();
                  }}
                  title="Attach file"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>

                {isBusy ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 rounded-full"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAbort();
                    }}
                  >
                    <Square className="h-3 w-3" />
                  </Button>
                ) : hasContent ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={
                      !isConnected ||
                      sendMessage.isPending ||
                      createSession.isPending ||
                      isUploadingFile
                    }
                    onClick={(e) => {
                      e.stopPropagation();
                      handleSubmit();
                    }}
                  >
                    {sendMessage.isPending ||
                    createSession.isPending ||
                    isUploadingFile ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowUp className="h-3 w-3" />
                    )}
                  </Button>
                ) : null}
              </div>
            </PopoverAnchor>

            <PopoverContent
              align="start"
              side="bottom"
              sideOffset={-42}
              className="w-[400px] p-0 border-border bg-background rounded-xl shadow-lg"
              onOpenAutoFocus={(e) => {
                e.preventDefault();
                expandedInputRef.current?.focus();
              }}
            >
              <div className="flex items-center gap-1.5 px-2 py-1.5">
                <ChatSettings>
                  <Button
                    variant="ghost"
                    size="icon"
                    className={cn(
                      "h-7 w-7 shrink-0 rounded-lg",
                      !isConnected && "text-red-400"
                    )}
                  >
                    <Hand className="h-4 w-4" />
                  </Button>
                </ChatSettings>

                <input
                  ref={expandedInputRef}
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsInputExpanded(false);
                    } else {
                      handleKeyDown(e);
                      if (e.key === "Enter" && !e.shiftKey) {
                        setIsInputExpanded(false);
                      }
                    }
                  }}
                  placeholder={placeholder}
                  className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
                />

                {isBusy ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 rounded-full"
                    onClick={handleAbort}
                  >
                    <Square className="h-3 w-3" />
                  </Button>
                ) : hasContent ? (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                    disabled={
                      !isConnected ||
                      sendMessage.isPending ||
                      createSession.isPending ||
                      isUploadingFile
                    }
                    onClick={() => {
                      handleSubmit();
                      setIsInputExpanded(false);
                    }}
                  >
                    {sendMessage.isPending ||
                    createSession.isPending ||
                    isUploadingFile ? (
                      <Loader2 className="h-3 w-3 animate-spin" />
                    ) : (
                      <ArrowUp className="h-3 w-3" />
                    )}
                  </Button>
                ) : null}
              </div>
            </PopoverContent>
          </Popover>
        ) : (
          /* Wide mode - inline input, no popover */
          <div className="flex items-center gap-1.5 bg-background rounded-xl px-2 py-1.5 border border-border/40">
            <ChatSettings>
              <Button
                variant="ghost"
                size="icon"
                className={cn(
                  "h-7 w-7 shrink-0 rounded-lg",
                  !isConnected && "text-red-400"
                )}
              >
                <Hand className="h-4 w-4" />
              </Button>
            </ChatSettings>

            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none"
            />

            <button
              className="p-1 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
              onClick={handlePickFile}
              title="Attach file"
            >
              <Paperclip className="h-3.5 w-3.5" />
            </button>

            {isBusy ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 rounded-full"
                onClick={handleAbort}
              >
                <Square className="h-3 w-3" />
              </Button>
            ) : hasContent ? (
              <Button
                variant="ghost"
                size="icon"
                className="h-6 w-6 shrink-0 rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
                disabled={
                  !isConnected ||
                  sendMessage.isPending ||
                  createSession.isPending ||
                  isUploadingFile
                }
                onClick={handleSubmit}
              >
                {sendMessage.isPending ||
                createSession.isPending ||
                isUploadingFile ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <ArrowUp className="h-3 w-3" />
                )}
              </Button>
            ) : null}
          </div>
        )}
      </div>

      {/* Session chips */}
      {hasChips && (
        <div
          className={cn(
            "shrink-0 flex items-center gap-1 py-1.5 border-b border-border/50",
            compact ? "px-2" : "px-3"
          )}
        >
          <div className="flex flex-wrap gap-1 min-w-0 flex-1">
            {allChips.map((chip) => (
              <div key={chip.id} className="flex items-center">
                <button
                  onClick={() => handleSwitchThread(chip.id)}
                  className={cn(
                    "flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded transition-colors",
                    chip.isCurrent
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:bg-muted/50"
                  )}
                >
                  <StatusDot status={chip.status} />
                  <span
                    className={cn(
                      "truncate",
                      compact ? "max-w-[50px]" : "max-w-[80px]"
                    )}
                  >
                    {chip.title}
                  </span>
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
                onClick={() =>
                  setShowBackgroundSessions(!showBackgroundSessions)
                }
                className={cn(
                  "flex items-center gap-1 px-1.5 py-0.5 text-[10px] rounded",
                  showBackgroundSessions
                    ? "bg-muted/80"
                    : "text-muted-foreground/50 hover:bg-muted/30"
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
                      <div className="px-2 py-1 text-[9px] uppercase text-muted-foreground/50 font-medium">
                        Background
                      </div>
                      {backgroundSessions.map((session) => (
                        <button
                          key={session.id}
                          onClick={() => {
                            handleSwitchThread(session.id);
                            setShowBackgroundSessions(false);
                          }}
                          className="flex items-center gap-2 w-full px-2 py-1 text-[11px] rounded hover:bg-muted/50 text-left"
                        >
                          <StatusDot status={getSessionStatus(session.id)} />
                          <span className="truncate">
                            {session.title ||
                              `Subtask ${session.id.slice(0, 6)}`}
                          </span>
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
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
        {showChat ? (
          // Chat messages - reversed (newest on top), thinking state at bottom
          <div
            className={cn(
              "flex flex-col-reverse gap-1",
              compact ? "p-2" : "p-3"
            )}
          >
            {messages.map((message, idx) => (
              <ChatMessage
                key={message.info.id || idx}
                message={message}
                compact
              />
            ))}
            {waitingForResponse && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <ShimmerText
                  text={activeForm || "Thinking..."}
                  className="text-xs text-muted-foreground"
                />
              </motion.div>
            )}
          </div>
        ) : (
          // Browse view - NotebookSidebar with filter query
          <div className={cn(compact ? "p-2" : "p-3")}>
            <NotebookSidebar
              filterQuery={filterQuery}
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
  if (status === "error")
    return <span className="rounded-full h-1.5 w-1.5 bg-red-500" />;
  return <span className="rounded-full h-1.5 w-1.5 bg-muted-foreground/40" />;
}
