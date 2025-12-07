import { useState, useRef, useEffect, useCallback } from "react";
import { useSendMessage, useAbortSession, useSessionStatuses, useSessions, useCreateSession, useDeleteSession } from "@/hooks/useSession";
import { useUIStore } from "@/stores/ui";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ArrowUp, Square, Loader2, GripVertical, Hand, Settings, Plus, Database, Clock, MessageSquare, X, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { listen } from "@tauri-apps/api/event";
import { useWorkbook, useWorkbooks } from "@/hooks/useWorkbook";

interface ToolbarProps {
  expanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  hasData: boolean;
}

export function Toolbar({ expanded, onExpandChange, hasData }: ToolbarProps) {
  const [input, setInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const hasHandledDrop = useRef(false); // Prevent duplicate drops
  const { activeSessionId, activeWorkbookId, setActiveWorkbook, setActiveSession } = useUIStore();
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const sendMessage = useSendMessage(activeSessionId);
  const abortSession = useAbortSession(activeSessionId);

  // Session/thread management
  const { data: sessions = [] } = useSessions();
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  // Fetch current workbook and all workbooks for the dropdown
  const { data: activeWorkbook } = useWorkbook(activeWorkbookId);
  const { data: workbooks = [] } = useWorkbooks();

  // Recent workbooks (excluding current, sorted by last opened)
  const recentWorkbooks = workbooks
    .filter((wb) => wb.id !== activeWorkbookId)
    .slice(0, 5);

  const status = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";


  // Handle Tauri file drop events (gives us actual file paths)
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setupListeners = async () => {
      const unlistenDrop = await listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
        // Prevent duplicate handling
        if (hasHandledDrop.current) return;
        hasHandledDrop.current = true;
        setTimeout(() => { hasHandledDrop.current = false; }, 500);

        const filePaths = event.payload.paths;
        if (!activeSessionId || filePaths.length === 0) return;

        setIsDragging(false);

        // Expand the panel to show the conversation
        onExpandChange(true);

        // Get just the file names for display
        const fileNames = filePaths.map((p) => p.split("/").pop() || p);
        const fileList = fileNames.join(", ");

        // Build a persistent ingest prompt for the agent with safety constraints
        const tmpDir = "/tmp/hands-ingest";
        const ingestPrompt = `I just dropped ${filePaths.length === 1 ? "a file" : `${filePaths.length} files`} for you to ingest:

Files: ${fileList}
Full paths: ${filePaths.join(", ")}

Please help me load this data into my PostgreSQL database. Be VERY persistent and thorough:

1. First, read and examine the file(s) to understand the format and structure (CSV, JSON, etc.)
2. Infer an appropriate table schema from the data - choose good column names and types
3. Create the table(s) in PostgreSQL using the hands_sql tool
4. Load ALL the data into the table(s) - process every single row, don't stop until complete
5. Verify the data was loaded correctly by querying the table and counting rows

CRITICAL FILE SAFETY RULES:
- NEVER modify, edit, or delete the source files (${filePaths.join(", ")})
- If you need to write any code or scripts, ONLY write to: ${tmpDir}
- If you need to copy files for processing, copy them to: ${tmpDir}
- You may READ source files but NEVER WRITE to them
- Create ${tmpDir} if it doesn't exist before writing anything

If you encounter ANY errors, debug and retry. Do NOT give up until every row of data is successfully loaded into the database. If a batch fails, try smaller batches. If there are encoding issues, handle them. Be relentless.

When you are completely done loading the data, ask me if I want to clean up the temporary files in ${tmpDir}.`;

        sendMessage.mutate(ingestPrompt);
      });
      unlisteners.push(unlistenDrop);

      const unlistenEnter = await listen("tauri://drag-enter", () => {
        setIsDragging(true);
      });
      unlisteners.push(unlistenEnter);

      const unlistenLeave = await listen("tauri://drag-leave", () => {
        setIsDragging(false);
      });
      unlisteners.push(unlistenLeave);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [activeSessionId]); // Minimal dependencies - refs used for mutable values

  // Drag & drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only set dragging to false if we're leaving the drop zone entirely
    if (dropRef.current && !dropRef.current.contains(e.relatedTarget as Node)) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    // Don't handle here - Tauri's drag-drop event handles it with full paths
    // The web API only gives file names, not paths
  }, []);

  const handleSubmit = async () => {
    if (!input.trim() || isBusy || !activeSessionId) return;

    const message = input.trim();
    setInput("");

    // Expand the panel when user sends a message
    if (!expanded) {
      onExpandChange(true);
    }

    sendMessage.mutate(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    // Escape to collapse
    if (e.key === "Escape" && expanded) {
      onExpandChange(false);
    }
  };

  const handleAbort = () => {
    if (activeSessionId) {
      abortSession.mutate();
    }
  };

  const handleNewThread = () => {
    createSession.mutate({}, {
      onSuccess: (newSession) => {
        setActiveSession(newSession.id);
        setMenuOpen(false);
      }
    });
  };

  const handleSwitchThread = (sessionId: string) => {
    setActiveSession(sessionId);
    setMenuOpen(false);
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

  const placeholder = hasData
    ? "Ask anything about your data..."
    : "Tell me about your data source...";

  return (
    <div
      ref={dropRef}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      className={cn(
        "flex items-center w-full h-[52px] gap-2 px-2 bg-background backdrop-blur-xl rounded-2xl border shadow-lg shrink-0",
        isDragging
          ? "border-primary bg-primary/10"
          : "border-border/50"
      )}
    >
      {/* Drag handle */}
      <div
        data-tauri-drag-region
        className="h-full flex items-center px-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/60"
      >
        <GripVertical className="h-4 w-4 pointer-events-none" />
      </div>

      {/* Logo / Menu - always visible */}
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="h-10 w-10 rounded-xl shrink-0 hover:bg-muted"
          >
            <Hand className="h-6 w-6" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-64">
          {/* Current workbook info */}
          {activeWorkbook && (
            <>
              <div className="px-2 py-2">
                <div className="font-medium text-sm">{activeWorkbook.name}</div>
                <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
                  <Database className="h-3 w-3" />
                  <span>Local PostgreSQL</span>
                </div>
                {activeWorkbook.description && (
                  <div className="text-xs text-muted-foreground mt-1 line-clamp-2">
                    {activeWorkbook.description}
                  </div>
                )}
              </div>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Threads section */}
          {sessions.length > 0 && (
            <>
              <DropdownMenuSub>
                <DropdownMenuSubTrigger>
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Threads
                  <span className="ml-auto text-xs text-muted-foreground">{sessions.length}</span>
                </DropdownMenuSubTrigger>
                <DropdownMenuSubContent className="w-56">
                  {sessions.map((session) => (
                    <DropdownMenuItem
                      key={session.id}
                      onClick={() => handleSwitchThread(session.id)}
                      className="flex items-center justify-between group"
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {session.id === activeSessionId && (
                          <Check className="h-3 w-3 text-primary shrink-0" />
                        )}
                        <span className="truncate">
                          {session.title || `Thread ${session.id.slice(0, 6)}`}
                        </span>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 opacity-0 group-hover:opacity-100 shrink-0"
                        onClick={(e) => handleDeleteThread(session.id, e)}
                      >
                        <X className="h-3 w-3" />
                      </Button>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={handleNewThread}>
                    <Plus className="h-4 w-4 mr-2" />
                    New Thread
                  </DropdownMenuItem>
                </DropdownMenuSubContent>
              </DropdownMenuSub>
              <DropdownMenuSeparator />
            </>
          )}

          {/* Recent workbooks */}
          {recentWorkbooks.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>
                <Clock className="h-4 w-4 mr-2" />
                Recent Workbooks
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-48">
                {recentWorkbooks.map((wb) => (
                  <DropdownMenuItem
                    key={wb.id}
                    onClick={() => setActiveWorkbook(wb.id, wb.directory)}
                  >
                    {wb.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}

          <DropdownMenuItem>
            <Plus className="h-4 w-4 mr-2" />
            New Workbook
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Input section */}
      <div className="flex-1 flex items-center gap-2">
        <input
          ref={inputRef}
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (!expanded) onExpandChange(true);
          }}
          placeholder={placeholder}
          disabled={!activeSessionId}
          className={cn(
            "flex-1 bg-transparent py-2 text-sm",
            "placeholder:text-muted-foreground/60 focus:outline-none"
          )}
        />

        {isBusy ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 shrink-0 rounded-lg"
            onClick={handleAbort}
          >
            <Square className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-8 w-8 shrink-0 rounded-lg transition-colors",
              input.trim() && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            disabled={!input.trim() || !activeSessionId || sendMessage.isPending}
            onClick={handleSubmit}
          >
            {sendMessage.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        )}
      </div>
    </div>
  );
}
