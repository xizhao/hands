import { useEffect, useRef, useMemo, useCallback, useState } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useMessages, useSessions, useDeleteSession, useSessionStatuses } from "@/store/hooks";
import { api } from "@/lib/api";
import { useUIStore } from "@/stores/ui";
import { useBackgroundStore } from "@/stores/background";
import { ChatMessage } from "@/components/ChatMessage";
import { cn } from "@/lib/utils";
import { Database, FileUp, Link, ChevronDown, ChevronUp, ChevronRight, MessageSquare, X, Loader2, Brain } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { getCurrentWindow, LogicalSize } from "@tauri-apps/api/window";

interface ThreadProps {
  expanded: boolean;
  hasData: boolean;
  onCollapse: () => void;
  onExpand: () => void;
}

export function Thread({ expanded, hasData, onCollapse, onExpand }: ThreadProps) {
  const { activeSessionId, setActiveSession } = useUIStore();
  const { tasks: backgroundTasks, removeTask } = useBackgroundStore();
  const { data: messages = [] } = useMessages(activeSessionId);
  const { data: sessions = [] } = useSessions();
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const deleteSession = useDeleteSession();
  const [bgTasksExpanded, setBgTasksExpanded] = useState(false);

  // Get background task IDs for filtering
  const backgroundTaskIds = new Set(Object.keys(backgroundTasks));
  const backgroundTaskList = Object.values(backgroundTasks);

  // Check if the current session is busy (loading)
  const currentStatus = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = currentStatus?.type === "busy" || currentStatus?.type === "running";
  const activeForm = currentStatus?.type === "busy" ? currentStatus.activeForm : undefined;

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

  // Other sessions for switching - only those with titles, excluding background tasks
  const otherSessions = sessions.filter(s => s.id !== activeSessionId && s.title && !backgroundTaskIds.has(s.id));

  // Check if current session is a background task
  const isCurrentBackground = activeSessionId ? backgroundTaskIds.has(activeSessionId) : false;
  const currentBackgroundTask = activeSessionId ? backgroundTasks[activeSessionId] : null;

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

  const handleDeleteThread = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Abort any running execution first
    try {
      await api.abort(sessionId);
    } catch {
      // Ignore abort errors (session might not be running)
    }

    // If deleting the active session, switch first to prevent stale data showing
    if (sessionId === activeSessionId) {
      const nextSession = sessions.find(s => s.id !== sessionId);
      setActiveSession(nextSession?.id ?? null);
    }

    // Delete on server - TanStack DB collections will be updated via SSE events
    deleteSession.mutate(sessionId);
  };

  // Handler to view a background task (just switches to it, keeps it in background store)
  const handleSelectBackgroundTask = (taskId: string) => {
    setActiveSession(taskId);
    onExpand();
  };

  // Collapsed state - show thread chips only if there are sessions or background tasks
  if (!expanded) {
    const hasVisibleChips = currentHasTitle || isCurrentBackground || otherSessions.length > 0 || backgroundTaskList.length > 0;
    if (!hasVisibleChips) {
      return null;
    }

    return (
      <div className="mt-2 px-2 animate-in fade-in duration-200">
        <div className="flex flex-wrap gap-2 items-start">
          {/* Current thread chip - regular session with title */}
          {currentHasTitle && activeSessionId && !isCurrentBackground && (
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

          {/* Current thread chip - if viewing a background task */}
          {isCurrentBackground && currentBackgroundTask && activeSessionId && (
            <div className="flex items-center">
              <button
                onClick={onExpand}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 rounded-2xl rounded-tl-md bg-zinc-700/50 shadow-lg hover:bg-zinc-600/50 transition-colors border border-zinc-500/20"
              >
                {currentBackgroundTask.status === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                ) : (
                  <FileUp className="h-3 w-3 text-zinc-400" />
                )}
                <span className="opacity-80">{currentBackgroundTask.title}</span>
                <ChevronUp className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession.mutate(activeSessionId);
                  removeTask(activeSessionId);
                  setActiveSession(null);
                }}
                className="ml-1 p-0.5 rounded-full bg-zinc-400/30 backdrop-blur hover:bg-zinc-400/50 transition-colors"
              >
                <X className="h-2.5 w-2.5 text-white" />
              </button>
            </div>
          )}

          {/* Other foreground thread chips */}
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

          {/* Background tasks - collapsible if more than 1 */}
          {(() => {
            const otherBgTasks = backgroundTaskList.filter(t => t.id !== activeSessionId);
            const runningCount = otherBgTasks.filter(t => t.status === "running").length;

            if (otherBgTasks.length === 0) return null;

            // If only 1 task, show it directly
            if (otherBgTasks.length === 1) {
              const task = otherBgTasks[0];
              return (
                <div className="flex items-center">
                  <button
                    onClick={() => handleSelectBackgroundTask(task.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 rounded-2xl rounded-tl-md bg-zinc-700/30 shadow-lg hover:bg-zinc-600/40 transition-colors border border-zinc-500/10"
                  >
                    {task.status === "running" ? (
                      <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />
                    ) : task.status === "error" ? (
                      <span className="inline-flex rounded-full h-2 w-2 bg-red-500" />
                    ) : (
                      <FileUp className="h-3 w-3 text-zinc-500" />
                    )}
                    <span className="opacity-70">{task.progress || task.title}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession.mutate(task.id);
                      removeTask(task.id);
                    }}
                    className="ml-1 p-0.5 rounded-full bg-zinc-400/30 backdrop-blur hover:bg-zinc-400/50 transition-colors"
                  >
                    <X className="h-2.5 w-2.5 text-white" />
                  </button>
                </div>
              );
            }

            // Multiple tasks - show collapsible
            return (
              <div className="flex flex-col gap-1.5">
                <button
                  onClick={() => setBgTasksExpanded(!bgTasksExpanded)}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 rounded-2xl rounded-tl-md bg-zinc-700/30 shadow-lg hover:bg-zinc-600/40 transition-colors border border-zinc-500/10"
                >
                  <ChevronRight className={cn("h-3 w-3 transition-transform", bgTasksExpanded && "rotate-90")} />
                  {runningCount > 0 && <Loader2 className="h-3 w-3 animate-spin text-zinc-500" />}
                  <span className="opacity-70">{otherBgTasks.length} background tasks</span>
                </button>
                <AnimatePresence>
                  {bgTasksExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0, height: 0 }}
                      className="flex flex-wrap gap-1.5 pl-2"
                    >
                      {otherBgTasks.map((task) => (
                        <div key={task.id} className="flex items-center">
                          <button
                            onClick={() => handleSelectBackgroundTask(task.id)}
                            className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-zinc-400 rounded-xl bg-zinc-700/20 hover:bg-zinc-600/30 transition-colors"
                          >
                            {task.status === "running" ? (
                              <Loader2 className="h-2.5 w-2.5 animate-spin text-zinc-500" />
                            ) : task.status === "error" ? (
                              <span className="inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                            ) : (
                              <FileUp className="h-2.5 w-2.5 text-zinc-500" />
                            )}
                            <span className="opacity-70 max-w-[100px] truncate">{task.progress || task.title}</span>
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteSession.mutate(task.id);
                              removeTask(task.id);
                            }}
                            className="ml-0.5 p-0.5 rounded-full bg-zinc-400/20 hover:bg-zinc-400/40 transition-colors"
                          >
                            <X className="h-2 w-2 text-zinc-400" />
                          </button>
                        </div>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })()}
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
      {/* Other threads and background tasks - always visible at top when expanded */}
      {(otherSessions.length > 0 || backgroundTaskList.filter(t => t.id !== activeSessionId).length > 0) && (
        <div className="flex flex-wrap gap-1.5 px-2 mb-2">
          {/* Other foreground threads */}
          {otherSessions.slice(0, 3).map((session) => (
            <div key={session.id} className="flex items-center">
              <button
                onClick={() => handleSwitchThread(session.id)}
                className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-zinc-400 rounded-xl bg-zinc-800/60 hover:bg-zinc-700 hover:text-zinc-100 transition-colors"
              >
                <StatusDot status={getSessionStatus(session.id)} />
                <MessageSquare className="h-3 w-3" />
                <span className="max-w-[100px] truncate">{session.title}</span>
              </button>
              <button
                onClick={(e) => handleDeleteThread(session.id, e)}
                className="ml-0.5 p-0.5 rounded-full bg-zinc-400/20 hover:bg-zinc-400/40 transition-colors"
              >
                <X className="h-2 w-2 text-zinc-400" />
              </button>
            </div>
          ))}

          {/* Background tasks - collapsible if more than 1 */}
          {(() => {
            const otherBgTasks = backgroundTaskList.filter(t => t.id !== activeSessionId);
            const runningCount = otherBgTasks.filter(t => t.status === "running").length;

            if (otherBgTasks.length === 0) return null;

            // If only 1 task, show it directly
            if (otherBgTasks.length === 1) {
              const task = otherBgTasks[0];
              return (
                <div className="flex items-center">
                  <button
                    onClick={() => handleSelectBackgroundTask(task.id)}
                    className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-zinc-400 rounded-xl bg-zinc-700/30 hover:bg-zinc-600/40 transition-colors"
                  >
                    {task.status === "running" ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin text-zinc-500" />
                    ) : task.status === "error" ? (
                      <span className="inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                    ) : (
                      <FileUp className="h-2.5 w-2.5 text-zinc-500" />
                    )}
                    <span className="opacity-70 max-w-[100px] truncate">{task.progress || task.title}</span>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession.mutate(task.id);
                      removeTask(task.id);
                    }}
                    className="ml-0.5 p-0.5 rounded-full bg-zinc-400/20 hover:bg-zinc-400/40 transition-colors"
                  >
                    <X className="h-2 w-2 text-zinc-400" />
                  </button>
                </div>
              );
            }

            // Multiple tasks - show collapsible counter
            return (
              <>
                <button
                  onClick={() => setBgTasksExpanded(!bgTasksExpanded)}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-zinc-400 rounded-xl bg-zinc-700/30 hover:bg-zinc-600/40 transition-colors"
                >
                  <ChevronRight className={cn("h-2.5 w-2.5 transition-transform", bgTasksExpanded && "rotate-90")} />
                  {runningCount > 0 && <Loader2 className="h-2.5 w-2.5 animate-spin text-zinc-500" />}
                  <span className="opacity-70">{otherBgTasks.length} bg</span>
                </button>
                <AnimatePresence>
                  {bgTasksExpanded && otherBgTasks.map((task) => (
                    <motion.div
                      key={task.id}
                      initial={{ opacity: 0, scale: 0.9 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.9 }}
                      className="flex items-center"
                    >
                      <button
                        onClick={() => handleSelectBackgroundTask(task.id)}
                        className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-zinc-400 rounded-xl bg-zinc-700/20 hover:bg-zinc-600/30 transition-colors"
                      >
                        {task.status === "running" ? (
                          <Loader2 className="h-2.5 w-2.5 animate-spin text-zinc-500" />
                        ) : task.status === "error" ? (
                          <span className="inline-flex rounded-full h-1.5 w-1.5 bg-red-500" />
                        ) : (
                          <FileUp className="h-2.5 w-2.5 text-zinc-500" />
                        )}
                        <span className="opacity-70 max-w-[80px] truncate">{task.progress || task.title}</span>
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteSession.mutate(task.id);
                          removeTask(task.id);
                        }}
                        className="ml-0.5 p-0.5 rounded-full bg-zinc-400/20 hover:bg-zinc-400/40 transition-colors"
                      >
                        <X className="h-2 w-2 text-zinc-400" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </>
            );
          })()}
        </div>
      )}

      {/* Thread chip - shows current session or background task */}
      {activeSessionId && (currentHasTitle || isCurrentBackground) && (
        <div className="flex items-center px-2 mb-2">
          {isCurrentBackground && currentBackgroundTask ? (
            <>
              <button
                onClick={onCollapse}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-300 rounded-2xl rounded-tl-md bg-zinc-700/50 shadow-lg hover:bg-zinc-600/50 transition-colors border border-zinc-500/20"
              >
                {currentBackgroundTask.status === "running" ? (
                  <Loader2 className="h-3 w-3 animate-spin text-zinc-400" />
                ) : (
                  <FileUp className="h-3 w-3 text-zinc-400" />
                )}
                <span className="opacity-80">{currentBackgroundTask.title}</span>
                <ChevronDown className="h-3 w-3" />
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  deleteSession.mutate(activeSessionId);
                  removeTask(activeSessionId);
                  setActiveSession(null);
                  onCollapse();
                }}
                className="ml-1 p-0.5 rounded-full bg-zinc-400/30 backdrop-blur hover:bg-zinc-400/50 transition-colors"
              >
                <X className="h-2.5 w-2.5 text-white" />
              </button>
            </>
          ) : currentHasTitle ? (
            <>
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
            </>
          ) : null}
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
                  {activeForm?.toLowerCase().includes("reason") || activeForm?.toLowerCase().includes("think") ? (
                    <>
                      <Brain className="h-4 w-4 text-purple-400 animate-pulse" />
                      <span className="text-xs text-purple-400">{activeForm}</span>
                    </>
                  ) : activeForm ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                      <span className="text-xs text-zinc-400">{activeForm}</span>
                    </>
                  ) : (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin text-zinc-400" />
                      <span className="text-xs text-zinc-500">Thinking...</span>
                    </>
                  )}
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
