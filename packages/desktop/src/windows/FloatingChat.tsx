/**
 * FloatingChat - Floating chat window for a single thread
 *
 * A lightweight overlay window that:
 * - Shows one OpenCode thread/session
 * - Can be opened from anywhere (capture, keyboard shortcut, etc.)
 * - Has dock button to move thread to main workbook editor
 */

import { invoke } from "@tauri-apps/api/core";
import { emit } from "@tauri-apps/api/event";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { ArrowUpRight, Loader2, Send, X } from "lucide-react";
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
  time: { created: number; updated: number };
}

interface SessionStatus {
  type: "idle" | "busy" | "running" | "waiting" | "retry";
}

// ============================================================================
// API Client
// ============================================================================

// Matches PORT_OPENCODE in lib.rs (55 * 1000 + 300)
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const queryClient = useQueryClient();

  // Parse query params
  const { sessionId, workbookDir } = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    return {
      sessionId: params.get("session-id") || "",
      workbookDir: params.get("workbook-dir") || "",
    };
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

  // Emit opened event on mount, closed on unmount
  useEffect(() => {
    if (sessionId) {
      emit("floating-chat-opened", { sessionId, workbookDir });
    }
    return () => {
      if (sessionId) {
        emit("floating-chat-closed", { sessionId, workbookDir });
      }
    };
  }, [sessionId, workbookDir]);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // ========== Queries ==========

  // Fetch session info
  const sessionQuery = useQuery({
    queryKey: ["floating-session", sessionId, workbookDir],
    queryFn: async () => {
      if (!client || !sessionId) return null;
      const result = await client.session.get({ path: { id: sessionId } });
      return result.data as Session;
    },
    enabled: !!client && !!sessionId,
  });

  // Fetch messages
  const messagesQuery = useQuery({
    queryKey: ["floating-messages", sessionId, workbookDir],
    queryFn: async () => {
      if (!client || !sessionId) return [];
      const result = await client.session.messages({ path: { id: sessionId } });
      return result.data as MessageWithParts[];
    },
    enabled: !!client && !!sessionId,
    refetchInterval: 2000, // Poll for updates
  });

  // Fetch session status
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

  const status = statusQuery.data?.[sessionId];
  const isBusy = status?.type === "busy" || status?.type === "running";

  // ========== Mutations ==========

  const sendMessage = useMutation({
    mutationFn: async (content: string) => {
      if (!client || !sessionId) throw new Error("No client/session");
      return client.session.promptAsync({
        path: { id: sessionId },
        body: {
          parts: [{ type: "text", text: content }],
          agent: "hands",
        },
      });
    },
    onMutate: async (content) => {
      // Optimistic update
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
    onSettled: () => {
      queryClient.invalidateQueries({
        queryKey: ["floating-messages", sessionId, workbookDir],
      });
    },
  });

  // ========== Handlers ==========

  const handleClose = useCallback(async () => {
    try {
      const win = getCurrentWindow();
      await win.close();
    } catch (err) {
      console.error("Failed to close:", err);
    }
  }, []);

  const handleDock = useCallback(async () => {
    try {
      // Emit event for workbook to pick up
      await emit("dock-floating-chat", {
        sessionId,
        workbookDir,
      });

      // Open workbook window
      const workbookId = workbookDir.split("/").pop() || "";
      await invoke("open_workbook_window", { workbookId });

      // Close this floating chat
      await handleClose();
    } catch (err) {
      console.error("Failed to dock:", err);
    }
  }, [sessionId, workbookDir, handleClose]);

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

    sendMessage.mutate(content);
    setInputValue("");
  }, [inputValue, isBusy, sendMessage]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
    if (e.key === "Escape") {
      handleClose();
    }
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesQuery.data]);

  const messages = messagesQuery.data ?? [];
  const sessionTitle = sessionQuery.data?.title || "Chat";

  return (
    <div
      className="h-screen w-screen flex flex-col bg-transparent"
      onClick={handleClose}
    >
      <div
        className="flex flex-col h-full bg-card/95 backdrop-blur-sm rounded-lg shadow-2xl border border-border overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/50"
          onMouseDown={handleDragStart}
        >
          {/* Session title chip */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isBusy && (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              )}
              <span className="text-sm font-medium text-foreground truncate">
                {sessionTitle}
              </span>
            </div>
          </div>

          {/* Dock button */}
          <button
            onClick={handleDock}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Open in workbook"
          >
            <ArrowUpRight className="h-4 w-4" />
          </button>

          {/* Close button */}
          <button
            onClick={handleClose}
            onMouseDown={(e) => e.stopPropagation()}
            className="p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
            title="Close (Esc)"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-3 space-y-3">
          {messages.length === 0 && !messagesQuery.isLoading && (
            <div className="text-center text-muted-foreground text-sm py-8">
              Start a conversation...
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.info.id} message={msg} />
          ))}

          {isBusy && messages[messages.length - 1]?.info.role === "user" && (
            <div className="flex justify-start">
              <div className="px-3 py-2 bg-muted rounded-lg">
                <span className="text-sm text-muted-foreground italic">
                  Thinking...
                </span>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="p-3 border-t border-border bg-muted/30">
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              className="flex-1 resize-none bg-background text-foreground text-sm rounded-lg px-3 py-2 border border-border focus:outline-none focus:ring-1 focus:ring-ring"
              style={{ minHeight: "36px", maxHeight: "120px" }}
            />
            <button
              onClick={handleSend}
              disabled={!inputValue.trim() || isBusy}
              className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isBusy ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
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

  // Extract text content from parts
  const textContent = message.parts
    .filter((p) => p.type === "text" && p.text)
    .map((p) => p.text)
    .join("\n");

  // Count tool calls
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
