/**
 * UnifiedSidebar - Arc-style sidebar with workbook header + chat + browse
 *
 * Features:
 * - Workbook dropdown header with traffic light offset
 * - Single input that serves as both search and chat
 * - As you type, filters the NotebookSidebar content in place
 * - Enter sends as chat prompt
 * - Shows chat messages when thread is active
 * - Responsive 2-column layout when wide enough
 */

import { ChatMessage } from "@/components/ChatMessage";
import { ChatSettings } from "@/components/ChatSettings";
import { SaveStatusIndicator } from "@/components/SaveStatusIndicator";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
} from "@/components/ui/popover";
import { ShimmerText } from "@/components/ui/thinking-indicator";
import { ATTACHMENT_TYPE, useChatState } from "@/hooks/useChatState";
import { resetSidebarState } from "./notebook/hooks/useSidebarState";
import { useNeedsTrafficLightOffset } from "@/hooks/useFullscreen";
import { useActiveSession, useClearNavigation } from "@/hooks/useNavState";
import { useRuntimeProcess } from "@/hooks/useRuntimeState";
import { useServer } from "@/hooks/useServer";
import {
  useAbortSession,
  useCreateSession,
  useDeleteSession,
  useMessages,
  useSendMessage,
  useSessions,
  useSessionStatus,
  useSessionStatuses,
} from "@/hooks/useSession";
import {
  useCreateWorkbook,
  useOpenWorkbook,
  useUpdateWorkbook,
  useWorkbook,
  useWorkbookDatabase,
  useWorkbooks,
} from "@/hooks/useWorkbook";
import type { Session } from "@/lib/api";
import type { Workbook } from "@/lib/workbook";
import { fillTemplate, PROMPTS } from "@/lib/prompts";
import { cn } from "@/lib/utils";
import { STDLIB_QUICK_REF } from "@hands/core/docs";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useRouter } from "@tanstack/react-router";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowUp,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Database,
  File,
  Folder,
  Hand,
  Home,
  Layers,
  Loader2,
  MessageSquare,
  Paperclip,
  Plus,
  Square,
  X,
} from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { NotebookSidebar } from "./NotebookSidebar";

// Memoized tab bar to prevent re-renders when dropdown opens
interface ThreadTabBarProps {
  sessions: Session[];
  sessionStatuses: Record<string, { type: string; activeForm?: string }>;
  activeSessionId: string | null;
  onSwitchThread: (id: string) => void;
  onDeleteThread: (id: string, e: React.MouseEvent) => void;
  compact?: boolean;
  isTwoColumn: boolean;
  needsPopover: boolean;
}

const ThreadTabBar = memo(function ThreadTabBar({
  sessions,
  sessionStatuses,
  activeSessionId,
  onSwitchThread,
  onDeleteThread,
  compact = false,
  isTwoColumn,
  needsPopover,
}: ThreadTabBarProps) {
  const foregroundSessions = sessions.filter((s) => {
    const sp = s as Session & { parentID?: string };
    return s.title && !sp.parentID;
  });
  const backgroundSessions = sessions.filter(
    (s) => (s as Session & { parentID?: string }).parentID
  );

  const allThreads = [...foregroundSessions, ...backgroundSessions];
  const hasThreads = allThreads.length > 0;
  const isHomeActive = !activeSessionId;
  const backgroundCount = backgroundSessions.length;

  const getSessionStatus = (sessionId: string): "busy" | "error" | null => {
    const st = sessionStatuses[sessionId];
    if (st?.type === "busy" || st?.type === "running") return "busy";
    return null;
  };

  const allChips = foregroundSessions.slice(0, 5).map((s) => ({
    id: s.id,
    title: s.title || "",
    status: getSessionStatus(s.id),
    isCurrent: s.id === activeSessionId,
  }));

  return (
    <div
      className={cn(
        "shrink-0 flex items-center gap-0.5 h-9",
        compact ? "px-2" : "px-3"
      )}
    >
      {/* Home tab - only in single-column mode */}
      {!isTwoColumn && (
        <button
          onClick={() => onSwitchThread("")}
          className={cn(
            "flex items-center gap-1.5 px-2.5 h-7 text-xs font-medium rounded-md transition-all",
            isHomeActive
              ? "bg-background text-foreground shadow-sm border border-border/50"
              : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
          )}
        >
          <Home className="h-3.5 w-3.5" />
          {!needsPopover && <span>Home</span>}
        </button>
      )}

      {/* Compact mode: Current thread tab + overflow dropdown */}
      {needsPopover && hasThreads && (
        <>
          {!isHomeActive && activeSessionId && (
            <div className="group flex items-center gap-1 px-2 h-7 text-xs font-medium rounded-md bg-background text-foreground shadow-sm border border-border/50 min-w-0 max-w-[120px]">
              <button
                onClick={() => onSwitchThread(activeSessionId)}
                className="flex items-center gap-1.5 min-w-0 flex-1"
              >
                <StatusDot status={getSessionStatus(activeSessionId)} />
                <span className="truncate">
                  {allThreads.find((s) => s.id === activeSessionId)?.title || "Thread"}
                </span>
              </button>
              <button
                onClick={(e) => onDeleteThread(activeSessionId, e)}
                className="p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity shrink-0"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}

          {allThreads.length > (isHomeActive ? 0 : 1) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-1 px-1.5 h-7 text-xs rounded-md transition-all",
                    "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  )}
                >
                  {allThreads.some((s) => {
                    if (s.id === activeSessionId) return false;
                    const st = sessionStatuses[s.id];
                    return st?.type === "busy" || st?.type === "running";
                  }) && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative rounded-full h-1.5 w-1.5 bg-green-500" />
                    </span>
                  )}
                  <span className="tabular-nums">
                    {isHomeActive ? allThreads.length : allThreads.length - 1}
                  </span>
                  <ChevronDown className="h-3 w-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[200px]">
                {allThreads
                  .filter((s) => s.id !== activeSessionId)
                  .map((session) => (
                    <DropdownMenuItem
                      key={session.id}
                      onClick={() => onSwitchThread(session.id)}
                      className="flex items-center gap-2"
                    >
                      <StatusDot status={getSessionStatus(session.id)} />
                      <span className="flex-1 truncate text-[13px]">
                        {session.title || `Thread ${session.id.slice(0, 6)}`}
                      </span>
                    </DropdownMenuItem>
                  ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </>
      )}

      {/* Wide mode: Arc-style thread tabs */}
      {!needsPopover && hasThreads && (
        <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-x-auto">
          {allChips.slice(0, 4).map((chip) => (
            <div
              key={chip.id}
              className={cn(
                "group flex items-center gap-1.5 px-2.5 h-7 text-xs font-medium rounded-md transition-all min-w-0",
                chip.isCurrent
                  ? "bg-background text-foreground shadow-sm border border-border/50"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              )}
            >
              <button
                onClick={() => onSwitchThread(chip.id)}
                className="flex items-center gap-1.5 min-w-0"
              >
                <StatusDot status={chip.status} />
                <span className="truncate max-w-[100px]">{chip.title}</span>
              </button>
              <button
                onClick={(e) => onDeleteThread(chip.id, e)}
                className="p-0.5 rounded hover:bg-accent opacity-0 group-hover:opacity-60 hover:!opacity-100 transition-opacity"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}

          {(allChips.length > 4 || backgroundCount > 0) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 px-2 h-7 text-xs text-muted-foreground hover:text-foreground hover:bg-muted/50 rounded-md">
                  <span className="tabular-nums">+{allChips.length - 4 + backgroundCount}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                {allChips.slice(4).map((chip) => (
                  <DropdownMenuItem
                    key={chip.id}
                    onClick={() => onSwitchThread(chip.id)}
                    className="flex items-center gap-2"
                  >
                    <StatusDot status={chip.status} />
                    <span className="flex-1 truncate text-[13px]">{chip.title}</span>
                  </DropdownMenuItem>
                ))}
                {backgroundSessions.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1 text-[10px] uppercase text-muted-foreground/50 font-medium">
                      Background
                    </div>
                    {backgroundSessions.map((session) => (
                      <DropdownMenuItem
                        key={session.id}
                        onClick={() => onSwitchThread(session.id)}
                        className="flex items-center gap-2"
                      >
                        <StatusDot status={getSessionStatus(session.id)} />
                        <span className="flex-1 truncate text-[13px]">
                          {session.title || `Subtask ${session.id.slice(0, 6)}`}
                        </span>
                      </DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      )}
    </div>
  );
});

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
  const router = useRouter();
  const chatState = useChatState();
  const { sessionId: activeSessionId, setSession: setActiveSession } =
    useActiveSession();
  const { workbookId: activeWorkbookId } = useRuntimeProcess();
  // Use targeted selector for active session status to avoid re-renders from other sessions
  const { data: activeStatus } = useSessionStatus(activeSessionId);
  // Keep full statuses for tab bar chips
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const { data: sessions = [] } = useSessions();
  const { data: messages = [], isLoading } = useMessages(activeSessionId);
  const { isConnected } = useServer();

  // Workbook management
  const { data: workbooks } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const openWorkbook = useOpenWorkbook();
  const updateWorkbook = useUpdateWorkbook();
  const clearNavigation = useClearNavigation();
  const needsTrafficLightOffset = useNeedsTrafficLightOffset();

  // Current workbook
  const currentWorkbook = workbooks?.find((w) => w.id === activeWorkbookId);
  const titleInputRef = useRef<HTMLSpanElement>(null);

  const sendMessage = useSendMessage();
  const createSession = useCreateSession();
  const abortSession = useAbortSession(activeSessionId);
  const deleteSession = useDeleteSession();

  const { data: activeWorkbook } = useWorkbook(activeWorkbookId);
  const { data: workbookDatabase } = useWorkbookDatabase(activeWorkbookId);

  const [input, setInput] = useState("");
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isInputExpanded, setIsInputExpanded] = useState(false);
  const [containerWidth, setContainerWidth] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const expandedInputRef = useRef<HTMLTextAreaElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Track container width for responsive layout
  const POPOVER_WIDTH = 400;
  const TWO_COLUMN_WIDTH = 600; // Width threshold for 2-column layout
  const needsPopover = containerWidth < POPOVER_WIDTH;
  const isTwoColumn = containerWidth >= TWO_COLUMN_WIDTH;

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

  // Listen for capture action prompts from the capture panel
  useEffect(() => {
    const unlisten = listen<{
      workbookId: string;
      prompt: string;
      actionType: string;
      label: string;
    }>("capture-action-prompt", (event) => {
      const { workbookId, prompt } = event.payload;

      // Only handle if this is the target workbook
      if (workbookId !== activeWorkbookId) return;

      console.log("[UnifiedSidebar] Received capture action:", event.payload);

      // Create a new session and send the prompt
      createSession.mutate(
        {},
        {
          onSuccess: (newSession) => {
            setActiveSession(newSession.id);
            sendMessage.mutate({
              sessionId: newSession.id,
              content: prompt,
            });
          },
        }
      );
    });

    return () => {
      unlisten.then((fn) => fn());
    };
  }, [activeWorkbookId, createSession, setActiveSession, sendMessage]);

  const isBusy = activeStatus?.type === "busy" || activeStatus?.type === "running";
  const activeForm = activeStatus?.type === "busy" ? activeStatus.activeForm : undefined;

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

  // Folder picker - opens native dialog and sets folder path attachment
  const handlePickFolder = useCallback(async () => {
    try {
      const folderPath = await invoke<string | null>("pick_folder");
      if (folderPath) {
        const folderName = folderPath.split("/").pop() || folderPath;
        chatState.setPendingAttachment({
          type: ATTACHMENT_TYPE.FILEPATH,
          filePath: folderPath,
          name: folderName,
        });
      }
    } catch (err) {
      console.error("[UnifiedSidebar] Failed to pick folder:", err);
    }
  }, [chatState]);

  // Workbook handlers
  const handleSwitchWorkbook = useCallback(
    (workbook: Workbook) => {
      clearNavigation();
      resetSidebarState();
      openWorkbook.mutate(workbook);
    },
    [clearNavigation, openWorkbook]
  );

  const handleCreateWorkbook = useCallback(() => {
    createWorkbook.mutate(
      { name: "Untitled Workbook" },
      {
        onSuccess: (newWorkbook) => {
          clearNavigation();
          resetSidebarState();
          openWorkbook.mutate(newWorkbook, {
            onSuccess: () => {
              router.navigate({
                to: "/pages/$pageId",
                params: { pageId: "welcome" },
              });
            },
          });
        },
      }
    );
  }, [clearNavigation, createWorkbook, openWorkbook, router]);

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


  // UI state
  const pendingAttachment = chatState.pendingAttachment;
  const hasContent = input.trim() || pendingAttachment;
  const sendError = sendMessage.error || createSession.error;
  const displayError = sendError || chatState.sessionError;

  // Determine placeholder text
  const placeholder = pendingAttachment
    ? "Add a message..."
    : showChat
    ? "Reply..."
    : "Search or ask anything...";

  // ============================================================================
  // Render Helpers
  // ============================================================================

  // Workbook header with traffic light offset
  const workbookHeader = (
    <div
      data-tauri-drag-region
      className={cn(
        "shrink-0 flex items-center gap-1 h-10",
        needsTrafficLightOffset ? "pl-[80px] pr-3" : "px-3"
      )}
    >
      {/* Editable workbook title */}
      <span
        ref={titleInputRef}
        contentEditable
        suppressContentEditableWarning
        onBlur={(e) => {
          const newName = e.currentTarget.textContent?.trim() || "";
          if (currentWorkbook && newName && newName !== currentWorkbook.name) {
            updateWorkbook.mutate({
              ...currentWorkbook,
              name: newName,
              updated_at: Date.now(),
            });
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            e.currentTarget.textContent = currentWorkbook?.name ?? "Untitled";
            e.currentTarget.blur();
          }
        }}
        className={cn(
          "px-1 py-0.5 text-sm font-medium bg-transparent rounded-sm cursor-text",
          "outline-none truncate max-w-[140px]",
          "hover:bg-accent/50",
          "focus:bg-background focus:ring-1 focus:ring-ring/20"
        )}
        spellCheck={false}
      >
        {currentWorkbook?.name ?? "Untitled"}
      </span>

      {/* Workbook switcher dropdown */}
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center justify-center w-5 h-5 rounded-sm text-muted-foreground/70 hover:text-muted-foreground hover:bg-accent/50">
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          {workbooks?.map((wb) => (
            <DropdownMenuItem
              key={wb.id}
              onClick={() => handleSwitchWorkbook(wb)}
              className="flex items-center justify-between"
            >
              <span className="truncate text-[13px]">{wb.name}</span>
              {wb.id === activeWorkbookId && (
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleCreateWorkbook}>
            <Plus className="h-3.5 w-3.5 mr-2" />
            <span className="text-[13px]">New Notebook</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Right side: save status + navigation */}
      <div className="ml-auto flex items-center gap-1">
        <SaveStatusIndicator />
        <button
          onClick={() => router.history.back()}
          className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          title="Go back"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => router.history.forward()}
          className="p-1 text-muted-foreground/60 hover:text-muted-foreground transition-colors"
          title="Go forward"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );

  // Error display
  const errorDisplay = displayError && (
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
  );

  // Attachment preview
  const attachmentPreview = pendingAttachment && (
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
  );

  // Input bar - inline when wide enough, popover when narrow
  const inputElement = needsPopover ? (
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

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      className="p-1 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
                      onClick={(e) => e.stopPropagation()}
                      title="Attach file or folder"
                    >
                      <Paperclip className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="w-[140px]">
                    <DropdownMenuItem onClick={handlePickFile}>
                      <File className="h-3.5 w-3.5 mr-2" />
                      <span className="text-[13px]">File</span>
                    </DropdownMenuItem>
                    <DropdownMenuItem onClick={handlePickFolder}>
                      <Folder className="h-3.5 w-3.5 mr-2" />
                      <span className="text-[13px]">Folder</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

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
              <div className="flex items-start gap-1.5 px-2 py-1.5">
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

                <textarea
                  ref={expandedInputRef}
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    // Auto-resize
                    e.target.style.height = "auto";
                    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") {
                      setIsInputExpanded(false);
                    } else if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      handleSubmit();
                      setIsInputExpanded(false);
                    }
                  }}
                  placeholder={placeholder}
                  rows={1}
                  className="flex-1 min-w-0 bg-transparent text-sm placeholder:text-muted-foreground/50 focus:outline-none resize-none py-1"
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

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="p-1 shrink-0 text-muted-foreground/50 hover:text-muted-foreground"
                  title="Attach file or folder"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-[140px]">
                <DropdownMenuItem onClick={handlePickFile}>
                  <File className="h-3.5 w-3.5 mr-2" />
                  <span className="text-[13px]">File</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={handlePickFolder}>
                  <Folder className="h-3.5 w-3.5 mr-2" />
                  <span className="text-[13px]">Folder</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

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
        )
  ;

  // Stable callbacks for ThreadTabBar
  const handleSwitchThreadStable = useCallback((id: string) => {
    if (id === "") {
      setActiveSession(null);
    } else if (id === activeSessionId) {
      setActiveSession(null);
    } else {
      setActiveSession(id);
    }
  }, [activeSessionId, setActiveSession]);

  const handleDeleteThreadStable = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    deleteSession.mutate(id);
    if (id === activeSessionId) setActiveSession(null);
  }, [activeSessionId, deleteSession, setActiveSession]);

  // Memoized tab bar component
  const tabBar = (
    <ThreadTabBar
      sessions={sessions}
      sessionStatuses={sessionStatuses}
      activeSessionId={activeSessionId}
      onSwitchThread={handleSwitchThreadStable}
      onDeleteThread={handleDeleteThreadStable}
      compact={compact}
      isTwoColumn={isTwoColumn}
      needsPopover={needsPopover}
    />
  );

  // Auto-scroll to top (newest messages are at top with flex-col-reverse)
  useEffect(() => {
    if (messagesContainerRef.current) {
      messagesContainerRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [messages.length, activeSessionId]);

  // Chat messages content
  const chatContent = (
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
  );

  // Browse content (NotebookSidebar)
  const browseContent = (
    <div className={cn(compact ? "p-2" : "p-3")}>
      <NotebookSidebar
        filterQuery={filterQuery}
        onSelectItem={onSelectItem}
      />
    </div>
  );

  // ============================================================================
  // Render
  // ============================================================================

  // Two-column layout: Chat on left, Browse on right
  if (isTwoColumn) {
    return (
      <div ref={containerRef} className="flex flex-col h-full w-full">
        {/* Workbook header with traffic light offset */}
        {workbookHeader}

        <div className="flex flex-1 min-h-0">
          {/* Left column: Chat */}
          <div className="flex flex-col w-1/2 border-r border-border/50">
            {/* Input bar */}
            <div className={cn("shrink-0 py-2", compact ? "px-2" : "px-3")}>
              {errorDisplay}
              {attachmentPreview}
              {inputElement}
            </div>

            {/* Tab bar */}
            {tabBar}

            {/* Chat messages or empty state */}
            <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
              {showChat ? chatContent : (
                <div className="flex items-center justify-center h-full text-muted-foreground/50 text-sm">
                  Start a conversation
                </div>
              )}
            </div>
          </div>

          {/* Right column: Browse */}
          <div className="flex flex-col w-1/2 overflow-y-auto">
            {browseContent}
          </div>
        </div>
      </div>
    );
  }

  // Single-column layout: Chat overlays browse when active
  return (
    <div ref={containerRef} className="flex flex-col h-full w-full">
      {/* Workbook header with traffic light offset */}
      {workbookHeader}

      {/* Input bar */}
      <div className={cn("shrink-0 py-2", compact ? "px-2" : "px-3")}>
        {errorDisplay}
        {attachmentPreview}
        {inputElement}
      </div>

      {/* Tab bar */}
      {tabBar}

      {/* Content: Chat messages OR Browse */}
      <div ref={messagesContainerRef} className="flex-1 overflow-y-auto">
        {showChat ? chatContent : browseContent}
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
