/**
 * FloatingChat - Persistent floating chat sidebar
 *
 * A standalone chat window that:
 * - Shows all threads with tab switching
 * - Can create new threads
 * - Always on top, draggable
 * - Works independently of main workbook window
 */

import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import {
  ChevronDown,
  GripVertical,
  Loader2,
  Minus,
  Plus,
  Send,
  Square,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createOpencodeClient } from "@opencode-ai/sdk/client";

// ============================================================================
// Types
// ============================================================================

interface Message {
  id: string;
  sessionID: string;
  role: "user" | "assistant";
  time: { created: number; updated: number };
}

interface Part {
  id: string;
  type: string;
  text?: string;
  messageID: string;
  sessionID: string;
}

interface MessageWithParts {
  info: Message;
  parts: Part[];
}

interface Session {
  id: string;
  title?: string;
  parentID?: string;
  time: { created: number; updated: number };
}

interface SessionStatus {
  type: "idle" | "busy" | "running" | "waiting" | "retry";
}

// ============================================================================
// API Client
// ============================================================================

const OPENCODE_PORT = 55300;

function createClient(directory: string) {
  return createOpencodeClient({
    baseUrl: `http://localhost:${OPENCODE_PORT}`,
    directory,
  });
}

// ============================================================================
// Component
// ============================================================================

export function FloatingChat() {
  const [inputValue, setInputValue] = useState("");
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [showAllThreads, setShowAllThreads] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  // Parse workbook dir from query params
  const workbookDir = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get("workbook-dir") || "";
  }, []);

  // Create API client
  const client = useMemo(
    () => (workbookDir ? createClient(workbookDir) : null),
    [workbookDir]
  );

  // Add dark mode class
  useEffect(() => {
    document.documentElement.classList.add("dark");
    return () => document.documentElement.classList.remove("dark");
  }, []);

  // Focus input on mount and when switching sessions
  useEffect(() => {
    inputRef.current?.focus();
  }, [activeSessionId]);

  // Listen for workbook to request focus on a session
  useEffect(() => {
    const unlisten = listen<{ sessionId: string }>(
      "floating-chat-focus-session",
      (event) => {
        setActiveSessionId(event.payload.sessionId);
      }
    );
    return () => {
      unlisten.then((fn) => fn());
    };
  }, []);

  // ========== Queries ==========

  // Fetch all sessions
  const sessionsQuery = useQuery({
    queryKey: ["floating-sessions", workbookDir],
    queryFn: async () => {
      if (!client) return [];
      const result = await client.session.list();
      return (result.data as Session[]) || [];
    },
    enabled: !!client,
    refetchInterval: 3000,
  });

  // Filter to foreground sessions (no parentID)
  const sessions = useMemo(() => {
    return (sessionsQuery.data || [])
      .filter((s) => !s.parentID && s.title)
      .sort((a, b) => b.time.updated - a.time.updated);
  }, [sessionsQuery.data]);

  // Fetch messages for active session
  const messagesQuery = useQuery({
    queryKey: ["floating-messages", activeSessionId, workbookDir],
    queryFn: async () => {
      if (!client || !activeSessionId) return [];
      const result = await client.session.messages({
        path: { id: activeSessionId },
      });
      return result.data as MessageWithParts[];
    },
    enabled: !!client && !!activeSessionId,
    refetchInterval: 1500,
  });

  // Fetch session statuses
  const statusQuery = useQuery({
    queryKey: ["floating-status", workbookDir],
    queryFn: async () => {
      if (!client) return {};
      const result = await client.session.status();
      return result.data as Record<string, SessionStatus>;
    },
    enabled: !!client,
    refetchInterval: 1000,
  });

  const activeStatus = activeSessionId
    ? statusQuery.data?.[activeSessionId]
    : null;
  const isBusy =
    activeStatus?.type === "busy" || activeStatus?.type === "running";

  // Check if any session is busy
  const anyBusy = useMemo(() => {
    const statuses = statusQuery.data || {};
    return Object.values(statuses).some(
      (s) => s.type === "busy" || s.type === "running"
    );
  }, [statusQuery.data]);

  // ========== Mutations ==========

  const createSession = useMutation({
    mutationFn: async () => {
      if (!client) throw new Error("No client");
      const result = await client.session.create({});
      return result.data as Session;
    },
    onSuccess: (newSession) => {
      setActiveSessionId(newSession.id);
      queryClient.invalidateQueries({
        queryKey: ["floating-sessions", workbookDir],
      });
    },
  });

  const sendMessage = useMutation({
    mutationFn: async ({
      sessionId,
      content,
    }: {
      sessionId: string;
      content: string;
    }) => {
      if (!client) throw new Error("No client");
      return client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: content }],
        },
      });
    },
    onMutate: async ({ sessionId, content }) => {
      const now = Date.now();
      const optimisticMessage: MessageWithParts = {
        info: {
          id: `optimistic-${now}`,
          sessionID: sessionId,
          role: "user",
          time: { created: now, updated: now },
        },
        parts: [
          {
            id: `optimistic-part-${now}`,
            type: "text",
            text: content,
            messageID: `optimistic-${now}`,
            sessionID: sessionId,
          },
        ],
      };

      queryClient.setQueryData<MessageWithParts[]>(
        ["floating-messages", sessionId, workbookDir],
        (old) => [...(old ?? []), optimisticMessage]
      );
    },
    onSettled: (_, __, { sessionId }) => {
      queryClient.invalidateQueries({
        queryKey: ["floating-messages", sessionId, workbookDir],
      });
    },
  });

  const abortSession = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!client) throw new Error("No client");
      return client.session.abort({ path: { id: sessionId } });
    },
  });

  const deleteSession = useMutation({
    mutationFn: async (sessionId: string) => {
      if (!client) throw new Error("No client");
      return client.session.delete({ path: { id: sessionId } });
    },
    onSuccess: (_, deletedId) => {
      if (activeSessionId === deletedId) {
        setActiveSessionId(null);
      }
      queryClient.invalidateQueries({
        queryKey: ["floating-sessions", workbookDir],
      });
    },
  });

  // ========== Handlers ==========

  const handleMinimize = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      await win.minimize();
    } catch (err) {
      console.error("Failed to minimize:", err);
    }
  }, []);

  const handleClose = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      await win.hide();
    } catch (err) {
      console.error("Failed to hide:", err);
    }
  }, []);

  const handleDragStart = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const win = getCurrentWindow();
      await win.startDragging();
    } catch (err) {
      console.error("Failed to start dragging:", err);
    }
  };

  const handleSend = useCallback(() => {
    const content = inputValue.trim();
    if (!content || isBusy) return;

    if (!activeSessionId) {
      // Create new session and send
      createSession.mutate(undefined, {
        onSuccess: (newSession) => {
          sendMessage.mutate({ sessionId: newSession.id, content });
        },
      });
    } else {
      sendMessage.mutate({ sessionId: activeSessionId, content });
    }
    setInputValue("");
  }, [inputValue, isBusy, activeSessionId, createSession, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleAbort = useCallback(() => {
    if (activeSessionId) {
      abortSession.mutate(activeSessionId);
    }
  }, [activeSessionId, abortSession]);

  // Scroll to top on new messages (with flex-col-reverse, top is newest)
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [messagesQuery.data]);

  const messages = messagesQuery.data ?? [];
  const activeSession = sessions.find((s) => s.id === activeSessionId);

  // Get visible threads (first 3 + active if not in first 3)
  const visibleThreads = useMemo(() => {
    const first3 = sessions.slice(0, 3);
    if (activeSessionId && !first3.find((s) => s.id === activeSessionId)) {
      const active = sessions.find((s) => s.id === activeSessionId);
      if (active) return [...first3.slice(0, 2), active];
    }
    return first3;
  }, [sessions, activeSessionId]);

  const hasMoreThreads = sessions.length > 3;

  return (
    <div className="h-screen w-screen flex flex-col bg-transparent">
      <div className="flex flex-col h-full bg-card/95 backdrop-blur-md rounded-xl shadow-2xl border border-border/50 overflow-hidden">
        {/* Header - draggable with grip on left */}
        <div
          className="flex items-center gap-1.5 px-2 py-1.5 border-b border-border/50 bg-muted/30"
          onMouseDown={handleDragStart}
        >
          {/* Drag handle on left */}
          <div className="flex items-center cursor-grab active:cursor-grabbing shrink-0">
            <GripVertical className="h-4 w-4 text-muted-foreground/50" />
          </div>

          {/* Thread tabs */}
          <div className="flex items-center gap-0.5 flex-1 min-w-0 overflow-hidden">
            {visibleThreads.map((session) => {
              const isActive = session.id === activeSessionId;
              const status = statusQuery.data?.[session.id];
              const sessionBusy =
                status?.type === "busy" || status?.type === "running";

              return (
                <button
                  key={session.id}
                  onClick={() => setActiveSessionId(session.id)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className={`group flex items-center gap-1 px-2 py-1 text-xs rounded-md transition-all max-w-[100px] ${
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {sessionBusy && (
                    <span className="relative flex h-1.5 w-1.5 shrink-0">
                      <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative rounded-full h-1.5 w-1.5 bg-green-500" />
                    </span>
                  )}
                  <span className="truncate">{session.title || "Chat"}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSession.mutate(session.id);
                    }}
                    className="p-0.5 rounded opacity-0 group-hover:opacity-60 hover:!opacity-100 hover:bg-accent shrink-0"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </button>
              );
            })}

            {/* More threads dropdown */}
            {hasMoreThreads && (
              <div className="relative">
                <button
                  onClick={() => setShowAllThreads(!showAllThreads)}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="flex items-center gap-0.5 px-1.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50"
                >
                  {anyBusy && (
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative rounded-full h-1.5 w-1.5 bg-green-500" />
                    </span>
                  )}
                  <span>+{sessions.length - 3}</span>
                  <ChevronDown className="h-3 w-3" />
                </button>

                {showAllThreads && (
                  <div className="absolute top-full left-0 mt-1 bg-popover border border-border rounded-lg shadow-lg z-50 min-w-[150px] py-1">
                    {sessions.slice(3).map((session) => (
                      <button
                        key={session.id}
                        onClick={() => {
                          setActiveSessionId(session.id);
                          setShowAllThreads(false);
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent truncate"
                      >
                        {session.title || "Chat"}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* New thread button */}
            <button
              onClick={() => createSession.mutate()}
              onMouseDown={(e) => e.stopPropagation()}
              disabled={createSession.isPending}
              className="p-1 text-muted-foreground hover:text-foreground rounded-md hover:bg-muted/50 shrink-0"
              title="New thread"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Window controls */}
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={handleMinimize}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <Minus className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={handleClose}
              onMouseDown={(e) => e.stopPropagation()}
              className="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Messages - flex-col-reverse so newest at top, scroll down for older */}
        <div ref={messagesEndRef} className="flex-1 overflow-y-auto p-3">
          <div className="flex flex-col-reverse gap-2">
            {isBusy && messages[messages.length - 1]?.info.role === "user" && (
              <div className="flex justify-start">
                <div className="px-3 py-2 bg-muted rounded-lg">
                  <span className="text-sm text-muted-foreground italic">
                    Thinking...
                  </span>
                </div>
              </div>
            )}

            {messages.map((msg) => (
              <MessageBubble key={msg.info.id} message={msg} />
            ))}

            {activeSessionId && messages.length === 0 && !messagesQuery.isLoading && (
              <div className="text-center text-muted-foreground text-sm py-8">
                {activeSession?.title || "New conversation"}
              </div>
            )}

            {!activeSessionId && sessions.length > 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                Select a thread or start a new one
              </div>
            )}

            {!activeSessionId && sessions.length === 0 && (
              <div className="text-center text-muted-foreground text-sm py-8">
                Start a conversation...
              </div>
            )}
          </div>
        </div>

        {/* Input */}
        <div className="p-2 border-t border-border/50 bg-muted/20">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                activeSessionId ? "Type a message..." : "Start a new chat..."
              }
              rows={1}
              className="flex-1 resize-none bg-background text-foreground text-sm rounded-lg px-3 py-2 border border-border/50 focus:outline-none focus:ring-1 focus:ring-ring/50"
              style={{ minHeight: "36px", maxHeight: "100px" }}
            />
            {isBusy ? (
              <button
                onClick={handleAbort}
                className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
                title="Stop"
              >
                <Square className="h-4 w-4" />
              </button>
            ) : (
              <button
                onClick={handleSend}
                disabled={!inputValue.trim()}
                className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {sendMessage.isPending || createSession.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Message Bubble Component
// ============================================================================

function MessageBubble({ message }: { message: MessageWithParts }) {
  const isUser = message.info.role === "user";

  const textContent = message.parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n");

  const toolCount = message.parts.filter((p) => p.type === "tool").length;

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] px-3 py-2 rounded-lg ${
          isUser
            ? "bg-primary text-primary-foreground rounded-br-sm"
            : "bg-muted text-foreground rounded-bl-sm"
        }`}
      >
        {textContent && (
          <p className="text-sm whitespace-pre-wrap break-words">{textContent}</p>
        )}

        {toolCount > 0 && !isUser && (
          <div className="text-xs text-muted-foreground mt-1">
            {toolCount} tool {toolCount === 1 ? "call" : "calls"}
          </div>
        )}

        {!textContent && toolCount === 0 && (
          <span className="text-sm text-muted-foreground italic">
            (empty message)
          </span>
        )}
      </div>
    </div>
  );
}

export default FloatingChat;
