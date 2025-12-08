import { useState, useRef, useEffect, useCallback } from "react";
import { useSendMessage, useAbortSession, useSessionStatuses, useSessions, useCreateSession, useDeleteSession } from "@/store/hooks";
import { api } from "@/lib/api";
import { useServer } from "@/hooks/useServer";
import { useUIStore } from "@/stores/ui";
import { useBackgroundStore } from "@/stores/background";
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
import { ArrowUp, Square, Loader2, GripVertical, Hand, Settings, Plus, Database, FolderOpen, Check, Trash2, Radio, Clock, Route, BarChart3, ExternalLink, Pencil, AlertCircle, AlertTriangle, FileCode, Sparkles, BookOpen, Cpu, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { useWorkbook, useWorkbooks, useCreateWorkbook, useUpdateWorkbook, useDeleteWorkbook, useStartDevServer, useStopDevServer, useDevServerStatus, useDevServerRoutes, useWorkbookDatabase, useEvalResult } from "@/hooks/useWorkbook";
import { getAllWebviewWindows } from "@tauri-apps/api/webviewWindow";

interface ToolbarProps {
  expanded: boolean;
  onExpandChange: (expanded: boolean) => void;
  hasData: boolean;
  onOpenSettings: () => void;
}

export function Toolbar({ expanded, onExpandChange, hasData, onOpenSettings }: ToolbarProps) {
  const [input, setInput] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const hasHandledDrop = useRef(false); // Prevent duplicate drops
  const { activeSessionId, activeWorkbookId, setActiveWorkbook, setActiveSession } = useUIStore();
  const { addTask } = useBackgroundStore();
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const sendMessage = useSendMessage();
  const abortSession = useAbortSession(activeSessionId);
  const { isConnected, isConnecting, isRestarting, restartServer } = useServer();

  // Session/thread management
  const { data: sessions = [] } = useSessions();
  const createSession = useCreateSession();
  const deleteSession = useDeleteSession();

  // Fetch current workbook and all workbooks for the dropdown
  const { data: activeWorkbook } = useWorkbook(activeWorkbookId);
  const { data: workbooks = [] } = useWorkbooks();
  const createWorkbook = useCreateWorkbook();
  const updateWorkbook = useUpdateWorkbook();
  const deleteWorkbook = useDeleteWorkbook();

  // Editing state for workbook rename
  const [editingWorkbookId, setEditingWorkbookId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  // Dev server management
  const startDevServer = useStartDevServer();
  const stopDevServer = useStopDevServer();
  const { data: devServerStatus } = useDevServerStatus(activeWorkbookId);
  const { data: devServerRoutes } = useDevServerRoutes(activeWorkbookId);
  const { data: workbookDatabase } = useWorkbookDatabase(activeWorkbookId);
  const { data: evalResult } = useEvalResult(activeWorkbookId);

  // Compute diagnostics counts
  const tsErrors = evalResult?.typescript?.errors?.length ?? 0;
  const tsWarnings = evalResult?.typescript?.warnings?.length ?? 0;
  const formatErrors = evalResult?.format?.errors?.length ?? 0;
  const unusedCount = (evalResult?.unused?.exports?.length ?? 0) + (evalResult?.unused?.files?.length ?? 0);
  const hasIssues = tsErrors > 0 || tsWarnings > 0 || formatErrors > 0 || unusedCount > 0;

  // Auto-start dev server when workbook changes
  useEffect(() => {
    if (activeWorkbook && !devServerStatus?.running) {
      startDevServer.mutate({
        workbookId: activeWorkbook.id,
        directory: activeWorkbook.directory,
      });
    }
  }, [activeWorkbook?.id]); // Only trigger on workbook ID change

  const status = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";


  // Handle Tauri file drop events (gives us actual file paths)
  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    const setupListeners = async () => {
      const unlistenDrop = await listen<{ paths: string[] }>("tauri://drag-drop", async (event) => {
        console.log("Drop event received:", event.payload);

        // Prevent duplicate handling
        if (hasHandledDrop.current) return;
        hasHandledDrop.current = true;
        setTimeout(() => { hasHandledDrop.current = false; }, 500);

        const filePaths = event.payload.paths;
        if (filePaths.length === 0) return;

        setIsDragging(false);

        // Create a background session for file import
        // This runs independently without blocking the main thread
        try {
          const fileNames = filePaths.map(p => p.split("/").pop() || p);
          const title = fileNames.length === 1
            ? `Import ${fileNames[0]}`
            : `Import ${fileNames.length} files`;

          // Create a new session for the background import
          const bgSession = await api.sessions.create({ title });

          // Track it in the background store
          addTask({
            id: bgSession.id,
            type: "import",
            title,
            status: "running",
            startedAt: Date.now(),
          });

          // Start the import with the import agent
          const importPrompt = `Import these files into the database:\n${filePaths.join("\n")}`;
          await api.promptWithAgent(bgSession.id, importPrompt, "import");
        } catch (err) {
          console.error("Failed to start background import:", err);
        }
      });
      unlisteners.push(unlistenDrop);

      const unlistenEnter = await listen("tauri://drag-enter", () => {
        console.log("Drag enter");
        setIsDragging(true);
      });
      unlisteners.push(unlistenEnter);

      const unlistenLeave = await listen("tauri://drag-leave", () => {
        console.log("Drag leave");
        setIsDragging(false);
      });
      unlisteners.push(unlistenLeave);
    };

    setupListeners();

    return () => {
      unlisteners.forEach((unlisten) => unlisten());
    };
  }, [addTask]); // Background session creation doesn't depend on active session

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

  // Build system prompt with workbook context
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
- Use the postgres package with DATABASE_URL env var for database queries
- Create API routes in src/index.ts
- Create charts in charts/ directory`;
  };

  const handleSubmit = async () => {
    if (!input.trim() || isBusy || !isConnected) return;

    const message = input.trim();
    setInput("");

    // Expand the panel when user sends a message
    if (!expanded) {
      onExpandChange(true);
    }

    const system = getSystemPrompt();

    // If no session exists, create one first then send message
    if (!activeSessionId) {
      createSession.mutate({}, {
        onSuccess: (newSession) => {
          setActiveSession(newSession.id);
          // Send message to the new session with its ID
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

  const handleSwitchWorkbook = async (workbookId: string, directory: string) => {
    // Close all spawned webview windows
    try {
      const windows = await getAllWebviewWindows();
      for (const win of windows) {
        // Only close webview windows we spawned (they have webview_ prefix)
        if (win.label.startsWith("webview_")) {
          await win.close();
        }
      }
    } catch (err) {
      console.error("Failed to close webview windows:", err);
    }

    // Stop current dev server
    if (activeWorkbookId) {
      stopDevServer.mutate(activeWorkbookId);
    }

    // Switch to new workbook (this also clears activeSessionId)
    // TanStack DB collections will be refreshed on next sync
    setActiveWorkbook(workbookId, directory);
    setMenuOpen(false);
  };

  const handleNewWorkbook = () => {
    // Create a new workbook with a default name
    const name = `Workbook ${workbooks.length + 1}`;
    createWorkbook.mutate({ name }, {
      onSuccess: (newWorkbook) => {
        handleSwitchWorkbook(newWorkbook.id, newWorkbook.directory);
      }
    });
  };

  const handleStartRename = (wb: { id: string; name: string }) => {
    setEditingWorkbookId(wb.id);
    setEditingName(wb.name);
  };

  const handleSaveRename = () => {
    if (!editingWorkbookId || !editingName.trim()) {
      setEditingWorkbookId(null);
      return;
    }
    const wb = workbooks.find(w => w.id === editingWorkbookId);
    if (wb) {
      updateWorkbook.mutate({ ...wb, name: editingName.trim() });
    }
    setEditingWorkbookId(null);
  };

  const handleDeleteWorkbook = async (workbookId: string) => {
    // If deleting active workbook, switch to another one first
    if (workbookId === activeWorkbookId) {
      const otherWorkbook = workbooks.find(w => w.id !== workbookId);
      if (otherWorkbook) {
        await handleSwitchWorkbook(otherWorkbook.id, otherWorkbook.directory);
      } else {
        setActiveWorkbook(null, null);
      }
    }
    deleteWorkbook.mutate(workbookId);
  };

  const handleClearAllData = async () => {
    // Clear active session first to stop showing messages
    setActiveSession(null);
    setMenuOpen(false);

    // Abort all running sessions first
    await Promise.all(sessions.map((session) =>
      api.abort(session.id).catch(() => {})
    ));

    // Delete all sessions on the server
    // TanStack DB collections will be updated via SSE events
    await Promise.all(sessions.map((session) => deleteSession.mutateAsync(session.id)));
  };

  // Open a URL in a webview window
  const openInWebview = async (url: string, title?: string) => {
    try {
      await invoke("open_webview", { url, title });
    } catch (err) {
      console.error("Failed to open webview:", err);
    }
  };

  // Build URL for a route
  const getRouteUrl = (path: string) => {
    const baseUrl = devServerRoutes?.url || "http://localhost:8787";
    return `${baseUrl}${path}`;
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
        className="h-full flex items-center pl-1 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground/60"
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
          {/* Workbooks section */}
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderOpen className="h-4 w-4 mr-2" />
              <span className="truncate flex-1">{activeWorkbook?.name || "Workbooks"}</span>
              <span className="ml-auto text-xs text-muted-foreground">{workbooks.length}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-64">
              {workbooks.map((wb) => (
                <div key={wb.id} className="flex items-center gap-1 px-2 py-1.5 hover:bg-accent rounded-sm group">
                  {editingWorkbookId === wb.id ? (
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      onBlur={handleSaveRename}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleSaveRename();
                        if (e.key === "Escape") setEditingWorkbookId(null);
                      }}
                      className="flex-1 bg-background border rounded px-2 py-0.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
                      autoFocus
                      onClick={(e) => e.stopPropagation()}
                    />
                  ) : (
                    <>
                      <button
                        onClick={() => handleSwitchWorkbook(wb.id, wb.directory)}
                        className="flex items-center gap-2 flex-1 min-w-0 text-left"
                      >
                        {wb.id === activeWorkbookId ? (
                          <Check className="h-3 w-3 text-primary shrink-0" />
                        ) : (
                          <span className="w-3" />
                        )}
                        <span className="truncate text-sm">{wb.name}</span>
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStartRename(wb); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-muted rounded transition-opacity"
                      >
                        <Pencil className="h-3 w-3 text-muted-foreground" />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDeleteWorkbook(wb.id); }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-destructive/20 rounded transition-opacity"
                      >
                        <Trash2 className="h-3 w-3 text-destructive" />
                      </button>
                    </>
                  )}
                </div>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleNewWorkbook}>
                <Plus className="h-4 w-4 mr-2" />
                New Workbook
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem onClick={async () => {
            setMenuOpen(false);
            try {
              await invoke("open_docs");
            } catch (err) {
              console.error("Failed to open docs:", err);
            }
          }}>
            <BookOpen className="h-4 w-4 mr-2" />
            Documentation
          </DropdownMenuItem>

          <DropdownMenuItem onClick={() => { setMenuOpen(false); onOpenSettings(); }}>
            <Settings className="h-4 w-4 mr-2" />
            Settings
          </DropdownMenuItem>

          {sessions.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleClearAllData}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All Data
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Charts - always visible on left */}
      {devServerRoutes?.charts && devServerRoutes.charts.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <BarChart3 className="h-3.5 w-3.5 text-orange-400" />
              <span>{devServerRoutes.charts.length}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {devServerRoutes.charts.map((chart, i) => (
              <DropdownMenuItem
                key={i}
                onClick={() => openInWebview(getRouteUrl(`/charts/${chart.id}`), chart.title)}
                className="flex items-center gap-2"
              >
                <BarChart3 className="h-3 w-3 text-orange-400 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-xs truncate">{chart.title}</div>
                </div>
                <ExternalLink className="h-3 w-3 opacity-50 shrink-0" />
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Scheduled Jobs - always visible on left */}
      {devServerRoutes?.crons && devServerRoutes.crons.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <Clock className="h-3.5 w-3.5 text-purple-400" />
              <span>{devServerRoutes.crons.length}</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            {devServerRoutes.crons.map((cron, i) => (
              <DropdownMenuItem key={i} className="font-mono text-xs">
                <Clock className="h-3 w-3 mr-2 text-purple-400" />
                {cron.cron}
                {cron.description && (
                  <span className="ml-2 text-muted-foreground">{cron.description}</span>
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

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
            disabled={!input.trim() || !isConnected || sendMessage.isPending || createSession.isPending}
            onClick={handleSubmit}
          >
            {sendMessage.isPending || createSession.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowUp className="h-4 w-4" />
            )}
          </Button>
        )}

        {/* Status indicator - far right after submit button */}
        {activeWorkbook && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <div className="flex h-5 w-5 items-center justify-center cursor-pointer group">
                <span className={cn(
                  "inline-flex rounded-full h-2 w-2 transition-transform group-hover:scale-125",
                  tsErrors > 0 ? "bg-red-500" :
                  (tsWarnings > 0 || unusedCount > 0) ? "bg-yellow-500" :
                  devServerStatus?.running ? "bg-green-500" : "bg-zinc-500"
                )} />
              </div>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-72 p-0">
              {/* Tabs */}
              <div className="flex border-b border-border">
                <button className="flex-1 px-3 py-2 text-sm font-medium text-foreground border-b-2 border-primary flex items-center justify-center gap-1.5">
                  <span className={cn(
                    "inline-flex rounded-full h-1.5 w-1.5",
                    devServerStatus?.running ? "bg-green-500" : "bg-zinc-500"
                  )} />
                  Local
                </button>
                <button className="flex-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-not-allowed">
                  Production
                  <span className="ml-1 text-[10px] text-muted-foreground/60">soon</span>
                </button>
              </div>

              {/* Local content */}
              <div className="p-1">
                {/* PostgreSQL Status */}
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <Database className="h-4 w-4 text-blue-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">PostgreSQL</div>
                      <div className="text-xs text-muted-foreground">
                        {workbookDatabase ? `${workbookDatabase.database_name} on port ${workbookDatabase.port}` : "Connecting..."}
                      </div>
                    </div>
                    <span className="inline-flex rounded-full h-2 w-2 bg-green-500" />
                  </div>
                </div>

                <DropdownMenuSeparator />

                {/* Dev Server Status */}
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <Radio className="h-4 w-4 text-purple-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">Dev Server</div>
                      <div className="text-xs text-muted-foreground">
                        {devServerStatus?.running ? devServerRoutes?.url || "http://localhost:8787" : "Not running"}
                      </div>
                    </div>
                    <span className={cn(
                      "inline-flex rounded-full h-2 w-2",
                      devServerStatus?.running ? "bg-green-500" : "bg-zinc-500"
                    )} />
                  </div>
                </div>

                <DropdownMenuSeparator />

                {/* OpenCode AI Server Status */}
                <div className="px-2 py-2">
                  <div className="flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-orange-400" />
                    <div className="flex-1">
                      <div className="text-sm font-medium">OpenCode</div>
                      <div className="text-xs text-muted-foreground">
                        {isRestarting ? "Restarting..." :
                         isConnecting ? "Connecting..." :
                         isConnected ? "http://localhost:4096" : "Disconnected"}
                      </div>
                    </div>
                    <span className={cn(
                      "inline-flex rounded-full h-2 w-2",
                      isRestarting || isConnecting ? "bg-yellow-500 animate-pulse" :
                      isConnected ? "bg-green-500" : "bg-red-500"
                    )} />
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        restartServer();
                      }}
                      disabled={isRestarting}
                      className={cn(
                        "p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors",
                        isRestarting && "opacity-50 cursor-not-allowed"
                      )}
                      title="Restart OpenCode server"
                    >
                      <RotateCw className={cn("h-3 w-3", isRestarting && "animate-spin")} />
                    </button>
                  </div>
                </div>

                {/* API Routes submenu */}
                {devServerRoutes?.routes && devServerRoutes.routes.length > 0 && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuSub>
                      <DropdownMenuSubTrigger className="flex items-center gap-2">
                        <Route className="h-4 w-4 text-blue-400" />
                        <span>API Routes</span>
                        <span className="ml-auto text-xs text-muted-foreground">{devServerRoutes.routes.length}</span>
                      </DropdownMenuSubTrigger>
                      <DropdownMenuSubContent className="w-64 max-h-80 overflow-y-auto">
                        {devServerRoutes.routes.map((route, i) => (
                          <DropdownMenuItem
                            key={i}
                            onClick={() => openInWebview(getRouteUrl(route.path), `${route.method} ${route.path}`)}
                            className="flex items-center gap-2 font-mono text-xs"
                          >
                            <span className={cn(
                              "text-[10px] px-1.5 py-0.5 rounded font-medium shrink-0",
                              route.method === "GET" && "bg-green-500/20 text-green-400",
                              route.method === "POST" && "bg-blue-500/20 text-blue-400",
                              route.method === "PUT" && "bg-yellow-500/20 text-yellow-400",
                              route.method === "DELETE" && "bg-red-500/20 text-red-400",
                              route.method === "PATCH" && "bg-purple-500/20 text-purple-400"
                            )}>
                              {route.method}
                            </span>
                            <span className="flex-1 truncate">{route.path}</span>
                            <ExternalLink className="h-3 w-3 opacity-50 shrink-0" />
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuSub>
                  </>
                )}

                {/* Diagnostics section */}
                {hasIssues && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-1.5">
                      <div className="text-xs font-medium text-muted-foreground mb-1.5">Code Quality</div>

                      {/* TypeScript Errors */}
                      {tsErrors > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="flex items-center gap-2 text-red-400">
                            <AlertCircle className="h-3.5 w-3.5" />
                            <span className="text-sm">{tsErrors} error{tsErrors !== 1 ? 's' : ''}</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-80 max-h-64 overflow-y-auto">
                            {evalResult?.typescript?.errors?.map((diag, i) => (
                              <div key={i} className="px-2 py-1.5 text-xs border-b border-border/50 last:border-0">
                                <div className="font-mono text-muted-foreground truncate">
                                  {diag.file}:{diag.line}:{diag.column}
                                </div>
                                <div className="text-red-400 mt-0.5">{diag.message}</div>
                                {diag.code && (
                                  <div className="text-muted-foreground/60 mt-0.5">{diag.code}</div>
                                )}
                              </div>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}

                      {/* TypeScript Warnings */}
                      {tsWarnings > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="flex items-center gap-2 text-yellow-400">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            <span className="text-sm">{tsWarnings} warning{tsWarnings !== 1 ? 's' : ''}</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-80 max-h-64 overflow-y-auto">
                            {evalResult?.typescript?.warnings?.map((diag, i) => (
                              <div key={i} className="px-2 py-1.5 text-xs border-b border-border/50 last:border-0">
                                <div className="font-mono text-muted-foreground truncate">
                                  {diag.file}:{diag.line}:{diag.column}
                                </div>
                                <div className="text-yellow-400 mt-0.5">{diag.message}</div>
                                {diag.code && (
                                  <div className="text-muted-foreground/60 mt-0.5">{diag.code}</div>
                                )}
                              </div>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}

                      {/* Unused Code */}
                      {unusedCount > 0 && (
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="flex items-center gap-2 text-muted-foreground">
                            <FileCode className="h-3.5 w-3.5" />
                            <span className="text-sm">{unusedCount} unused</span>
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-64 max-h-64 overflow-y-auto">
                            {evalResult?.unused?.files?.map((file, i) => (
                              <div key={`file-${i}`} className="px-2 py-1 text-xs font-mono text-muted-foreground">
                                <span className="text-yellow-400/60">file:</span> {file}
                              </div>
                            ))}
                            {evalResult?.unused?.exports?.map((exp, i) => (
                              <div key={`exp-${i}`} className="px-2 py-1 text-xs font-mono text-muted-foreground">
                                <span className="text-blue-400/60">export:</span> {exp}
                              </div>
                            ))}
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      )}
                    </div>
                  </>
                )}

                {/* All clear indicator */}
                {!hasIssues && evalResult && (
                  <>
                    <DropdownMenuSeparator />
                    <div className="px-2 py-2 flex items-center gap-2 text-green-400">
                      <Sparkles className="h-4 w-4" />
                      <span className="text-sm">No issues</span>
                    </div>
                  </>
                )}

                {/* Open dev server in browser */}
                {devServerStatus?.running && devServerRoutes?.url && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={() => openInWebview(devServerRoutes.url, "Dev Server")}
                      className="flex items-center gap-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>Open in Preview</span>
                    </DropdownMenuItem>
                  </>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}
