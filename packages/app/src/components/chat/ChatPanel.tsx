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

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronLeft, Layers } from "lucide-react";
import { ChatMessage } from "@/components/ChatMessage";
import { ThinkingIndicator } from "@/components/ui/thinking-indicator";
import { LinkClickHandler } from "@/hooks/useLinkNavigation";
import { ChatInput, type ChatInputRef } from "./ChatInput";
import { ThreadList } from "./ThreadList";
import { type SessionStatus } from "./StatusDot";
import {
  useSessions,
  useMessages,
  useSendMessage,
  useSessionStatuses,
  useCreateSession,
  useDeleteSession,
  useAbortSession,
} from "@/hooks/useSession";
import type { Session } from "@/lib/api";

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
}: ChatPanelProps) {
  // Use controlled or uncontrolled input
  const [uncontrolledInputValue, setUncontrolledInputValue] = useState("");
  const [uncontrolledPendingFiles, setUncontrolledPendingFiles] = useState<string[]>([]);

  const inputValue = controlledInputValue ?? uncontrolledInputValue;
  const setInputValue = controlledOnInputChange ?? setUncontrolledInputValue;
  const pendingFiles = controlledPendingFiles ?? uncontrolledPendingFiles;
  const setPendingFiles = controlledOnPendingFilesChange ?? setUncontrolledPendingFiles;

  const scrollRef = useRef<HTMLDivElement>(null);
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

  // Filter and sort sessions
  const sessions = useMemo(() => {
    return allSessions
      .filter((s) => !s.parentID && s.title)
      .sort((a, b) => b.time.updated - a.time.updated);
  }, [allSessions]);

  const foregroundSessions = useMemo(() => {
    return sessions.filter((s) => {
      const sp = s as Session & { parentID?: string };
      return s.title && !sp.parentID;
    });
  }, [sessions]);

  const backgroundSessions = useMemo(() => {
    return sessions.filter((s) => (s as Session & { parentID?: string }).parentID);
  }, [sessions]);

  const activeSession = sessions.find((s) => s.id === sessionId);

  // Status helpers
  const getSessionStatus = useCallback(
    (id: string): SessionStatus => {
      const status = sessionStatuses[id];
      if (status?.type === "busy" || status?.type === "running") return "busy";
      return null;
    },
    [sessionStatuses]
  );

  const activeStatus = sessionId ? sessionStatuses[sessionId] : null;
  const isBusy = activeStatus?.type === "busy" || activeStatus?.type === "running";

  // Scroll to bottom when new messages arrive
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
          sendMessageMutation.mutate({ sessionId: newSession.id, content });
        },
      });
    } else {
      sendMessageMutation.mutate({ sessionId, content });
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
    [deleteSessionMutation, sessionId, onSessionSelect]
  );

  const handleBack = useCallback(() => {
    onSessionSelect(null);
    onBack?.();
  }, [onSessionSelect, onBack]);

  // Check if we're showing messages or thread list
  const showMessages = sessionId && messages.length > 0;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Content area */}
      <AnimatePresence mode="wait">
        {showMessages ? (
          /* Messages view */
          <motion.div
            key="messages"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            ref={scrollRef}
            className="flex-1 overflow-y-auto min-h-0 flex flex-col"
          >
            <LinkClickHandler className="flex flex-col gap-3 mt-auto p-3">
              {messages.map((msg) => (
                <ChatMessage
                  key={msg.info.id}
                  message={msg}
                  compact={compact}
                  tailDown={tailDown}
                />
              ))}
              <AnimatePresence>
                {isBusy && messages[messages.length - 1]?.info.role === "user" && (
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
              <span className="max-w-[120px] truncate">
                {activeSession?.title || "Thread"}
              </span>
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
