/**
 * ChatPanel - Reusable chat interface component
 *
 * Used by:
 * - FloatingChat (standalone window)
 * - UnifiedSidebar (embedded in workbook)
 *
 * Features:
 * - Thread list view (when no session selected)
 * - Messages view (when session selected)
 * - Input bar with attachments
 * - Back navigation
 */

import { AnimatePresence, motion } from "framer-motion";
import { CheckCircle2, ChevronLeft, Circle, Layers, Loader2 } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";
import { StickToBottom } from "use-stick-to-bottom";
import { ChatMessage } from "@/components/ChatMessage";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { LinkClickHandler } from "@/hooks/useLinkNavigation";
import {
  useAbortSession,
  useCreateSession,
  useDeleteSession,
  useMessages,
  useSendMessage,
  useSessionStatuses,
  useSessions,
} from "@/hooks/useSession";
import type { Session } from "@/lib/api";
import { cn } from "@/lib/utils";
import { ChatInput, type ChatInputRef } from "./ChatInput";
import type { SessionStatus } from "./StatusDot";
import { ThreadList } from "./ThreadList";

/** Todo item for inline display */
export interface TodoItem {
  content: string;
  status: "pending" | "in_progress" | "completed";
  activeForm?: string;
}

/** Editor context for AI awareness */
export interface EditorContext {
  /** Type of content being viewed */
  type: "page" | "table" | "none";
  /** ID of the page or table (if applicable) */
  id?: string;
  /** Human-readable name */
  name?: string;
}

export interface ChatPanelProps {
  /** Currently selected session ID */
  sessionId: string | null;
  /** Callback when session selection changes */
  onSessionSelect: (id: string | null) => void;
  /** Compact mode for sidebar embedding */
  compact?: boolean;
  /** Show back button when in thread view */
  showBackButton?: boolean;
  /** Callback for back button */
  onBack?: () => void;
  /** Tail direction for chat bubbles */
  tailDown?: boolean;
  /** Additional class name */
  className?: string;
  /** Input value (controlled) */
  inputValue?: string;
  /** Input change handler (controlled) */
  onInputChange?: (value: string) => void;
  /** Pending files for attachments */
  pendingFiles?: string[];
  /** Pending files change handler */
  onPendingFilesChange?: (files: string[]) => void;
  /** STT recording state */
  isRecording?: boolean;
  /** STT preview text */
  sttPreview?: string;
  /** Input focus handler */
  onInputFocus?: () => void;
  /** Input blur handler */
  onInputBlur?: () => void;
  /** Editor context - what the user is currently viewing */
  editorContext?: EditorContext;
  /** Todos for the current session (optional - for inline display) */
  todos?: TodoItem[];
}

export function ChatPanel({
  sessionId,
  onSessionSelect,
  compact = false,
  showBackButton = true,
  onBack,
  tailDown = false,
  className = "",
  inputValue: controlledInputValue,
  onInputChange: controlledOnInputChange,
  pendingFiles: controlledPendingFiles,
  onPendingFilesChange: controlledOnPendingFilesChange,
  isRecording = false,
  sttPreview = "",
  onInputFocus,
  onInputBlur,
  editorContext,
  todos = [],
}: ChatPanelProps) {
  // Use controlled or uncontrolled input
  const [uncontrolledInputValue, setUncontrolledInputValue] = useState("");
  const [uncontrolledPendingFiles, setUncontrolledPendingFiles] = useState<string[]>([]);

  const inputValue = controlledInputValue ?? uncontrolledInputValue;
  const setInputValue = controlledOnInputChange ?? setUncontrolledInputValue;
  const pendingFiles = controlledPendingFiles ?? uncontrolledPendingFiles;
  const setPendingFiles = controlledOnPendingFilesChange ?? setUncontrolledPendingFiles;

  const inputRef = useRef<ChatInputRef>(null);

  // Session hooks
  const { data: allSessions = [] } = useSessions();
  const { data: messages = [] } = useMessages(sessionId);
  const { data: sessionStatuses = {} } = useSessionStatuses();

  // Mutation hooks
  const createSessionMutation = useCreateSession();
  const sendMessageMutation = useSendMessage();
  const abortSessionMutation = useAbortSession(sessionId);
  const deleteSessionMutation = useDeleteSession();

  // Filter and sort sessions (top-level only, no parentId)
  const sessions = useMemo(() => {
    return allSessions
      .filter((s) => !s.parentId)
      .sort((a, b) => b.time.updated - a.time.updated);
  }, [allSessions]);

  const foregroundSessions = useMemo(() => {
    return sessions.filter((s) => {
      return !s.parentId;
    });
  }, [sessions]);

  const backgroundSessions = useMemo(() => {
    // Background sessions have parentId - filter from allSessions, not sessions
    return allSessions.filter((s) => s.parentId);
  }, [allSessions]);

  const activeSession = sessions.find((s) => s.id === sessionId);

  // Status helpers
  const getSessionStatus = useCallback(
    (id: string): SessionStatus => {
      const status = sessionStatuses[id];
      if (status?.type === "busy" || status?.type === "running") return "busy";
      return null;
    },
    [sessionStatuses],
  );

  const activeStatus = sessionId ? sessionStatuses[sessionId] : null;
  const isBusy = activeStatus?.type === "busy" || activeStatus?.type === "running";

  // Build system context string from editor context
  const systemContext = useMemo(() => {
    if (!editorContext || editorContext.type === "none") return undefined;
    const label = editorContext.type === "page" ? "page" : "table";
    const name = editorContext.name || editorContext.id || "unknown";
    return `The user is currently viewing the ${label} "${name}".`;
  }, [editorContext]);

  // Message handlers
  const handleSend = useCallback(() => {
    let content = inputValue.trim();
    if (!content && pendingFiles.length === 0) return;
    if (isBusy) return;

    // Add file imports
    if (pendingFiles.length > 0) {
      const filePrompt = `@import ${pendingFiles.join(" ")}`;
      content = content ? `${content}\n\n${filePrompt}` : filePrompt;
      setPendingFiles([]);
    }

    if (!content) return;

    if (!sessionId) {
      // Create new session and send
      createSessionMutation.mutate(undefined, {
        onSuccess: (newSession) => {
          onSessionSelect(newSession.id);
          sendMessageMutation.mutate({ sessionId: newSession.id, content, system: systemContext });
        },
      });
    } else {
      sendMessageMutation.mutate({ sessionId, content, system: systemContext });
    }

    setInputValue("");
  }, [
    inputValue,
    pendingFiles,
    isBusy,
    sessionId,
    createSessionMutation,
    sendMessageMutation,
    onSessionSelect,
    setInputValue,
    setPendingFiles,
    systemContext,
  ]);

  const handleAbort = useCallback(() => {
    if (sessionId) abortSessionMutation.mutate();
  }, [sessionId, abortSessionMutation]);

  const handleCreateSession = useCallback(() => {
    createSessionMutation.mutate(undefined, {
      onSuccess: (newSession) => {
        onSessionSelect(newSession.id);
      },
    });
  }, [createSessionMutation, onSessionSelect]);

  const handleDeleteSession = useCallback(
    (id: string) => {
      deleteSessionMutation.mutate(id);
      if (id === sessionId) {
        onSessionSelect(null);
      }
    },
    [deleteSessionMutation, sessionId, onSessionSelect],
  );

  const handleBack = useCallback(() => {
    onSessionSelect(null);
    onBack?.();
  }, [onSessionSelect, onBack]);

  // Check if we're showing messages or thread list
  // Show messages view when session is selected (even if empty - shows thinking indicator)
  const showMessages = !!sessionId;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Content area */}
      <AnimatePresence mode="wait">
        {showMessages ? (
          /* Messages view with auto-scroll to bottom during streaming */
          <motion.div
            key="messages"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex-1 min-h-0 relative"
          >
            <StickToBottom className="h-full overflow-y-auto" resize="smooth" initial="smooth">
              <StickToBottom.Content className="flex flex-col min-h-full">
                <LinkClickHandler className="flex flex-col gap-3 p-3 mt-auto">
                  {messages.map((msg) => (
                    <ChatMessage
                      key={msg.info.id}
                      message={msg}
                      compact={compact}
                      tailDown={tailDown}
                    />
                  ))}
                  <AnimatePresence>
                    {/* Show thinking when: busy OR last message is from user (waiting for response) */}
                    {(isBusy || messages[messages.length - 1]?.info.role === "user") && (
                      <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 10 }}
                        className="rounded-2xl rounded-bl-sm bg-secondary dark:bg-muted shadow-sm px-2.5 py-1.5 w-fit"
                      >
                        <ThinkingIndicator />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </LinkClickHandler>
              </StickToBottom.Content>
            </StickToBottom>
          </motion.div>
        ) : (
          /* Thread list view */
          <motion.div
            key="threads"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex-1 flex flex-col justify-end min-h-0 p-3"
          >
            <ThreadList
              sessions={foregroundSessions}
              backgroundSessions={backgroundSessions}
              activeSessionId={sessionId}
              onSessionSelect={onSessionSelect}
              onSessionDelete={handleDeleteSession}
              onCreateSession={handleCreateSession}
              getSessionStatus={getSessionStatus}
              isCreating={createSessionMutation.isPending}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Inline todos - when in messages view with active todos */}
      <AnimatePresence>
        {showMessages && todos.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="shrink-0 px-3 py-2 border-t border-border/50"
          >
            <div className="flex flex-col gap-1.5">
              {todos.map((todo, idx) => (
                <div
                  key={`${todo.content}-${idx}`}
                  className={cn(
                    "flex items-center gap-2 text-xs",
                    todo.status === "completed" && "text-muted-foreground"
                  )}
                >
                  {todo.status === "completed" ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  ) : todo.status === "in_progress" ? (
                    <Loader2 className="h-3.5 w-3.5 text-blue-500 animate-spin shrink-0" />
                  ) : (
                    <Circle className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  )}
                  <span className={cn(
                    "truncate",
                    todo.status === "in_progress" && "text-foreground font-medium"
                  )}>
                    {todo.status === "in_progress" && todo.activeForm
                      ? todo.activeForm
                      : todo.content}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Navigation bar - when in messages view */}
      <AnimatePresence>
        {showMessages && showBackButton && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="flex items-center gap-2 px-3 py-2 shrink-0"
          >
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 px-2 h-7 text-xs text-muted-foreground hover:text-foreground bg-secondary dark:bg-muted hover:bg-secondary/80 dark:hover:bg-muted/80 rounded-md transition-colors"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              <span className="max-w-[120px] truncate">{activeSession?.title || "Thread"}</span>
            </button>

            {/* Background jobs indicator */}
            {backgroundSessions.length > 0 && (
              <button
                onClick={handleBack}
                className="flex items-center gap-1.5 px-2 h-7 text-xs text-muted-foreground hover:text-foreground bg-secondary dark:bg-muted hover:bg-secondary/80 dark:hover:bg-muted/80 rounded-md transition-colors"
              >
                <Layers className="h-3.5 w-3.5" />
                <span>
                  {backgroundSessions.filter((s) => getSessionStatus(s.id) === "busy").length ||
                    backgroundSessions.length}
                </span>
                {backgroundSessions.some((s) => getSessionStatus(s.id) === "busy") && (
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute h-full w-full rounded-full bg-green-400 opacity-75" />
                    <span className="relative rounded-full h-1.5 w-1.5 bg-green-500" />
                  </span>
                )}
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Input bar */}
      <div className="shrink-0 px-3 pb-3">
        <div className="bg-secondary dark:bg-card border border-border rounded-xl px-2 py-1.5">
          <ChatInput
            ref={inputRef}
            value={inputValue}
            onChange={setInputValue}
            onSend={handleSend}
            onAbort={handleAbort}
            isBusy={isBusy}
            isSending={sendMessageMutation.isPending || createSessionMutation.isPending}
            isRecording={isRecording}
            sttPreview={sttPreview}
            pendingFiles={pendingFiles}
            onPendingFilesChange={setPendingFiles}
            onFocus={onInputFocus}
            onBlur={onInputBlur}
          />
        </div>
      </div>
    </div>
  );
}
