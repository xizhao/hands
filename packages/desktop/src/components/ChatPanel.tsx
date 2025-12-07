import { useEffect, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useUIStore } from "@/stores/ui";
import { useMessages, useSessions, useSessionStatuses, useTodos } from "@/hooks/useSession";
import { ScrollArea } from "@/components/ui/scroll-area";
import { ChatMessage, MessageSkeleton, MessageProgress } from "@/components/ChatMessage";
import type { ToolPart } from "@/lib/api";
import { ChatInput } from "@/components/ChatInput";
import { PermissionDialog } from "@/components/PermissionDialog";
import { MessageSquare, AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export function ChatPanel() {
  const { activeSessionId } = useUIStore();
  const { data: sessions = [] } = useSessions();
  const { data: messages = [], isLoading } = useMessages(activeSessionId);
  const { data: statuses = {} } = useSessionStatuses();
  const { data: todos = [] } = useTodos(activeSessionId);
  const scrollRef = useRef<HTMLDivElement>(null);

  const activeSession = sessions.find((s) => s.id === activeSessionId);
  const sessionStatus = activeSessionId ? statuses[activeSessionId] : null;
  const isRunning = sessionStatus?.type === "running" || sessionStatus?.type === "busy";
  const isWaiting = sessionStatus?.type === "waiting";
  const isRetry = sessionStatus?.type === "retry";

  // Get the active task from todos for status display
  const activeTask = todos.find((t) => t.status === "in_progress");

  // Extract tool parts from the last assistant message for progress display
  const lastMessage = messages[messages.length - 1];
  const toolsFromLastMessage = useMemo(() => {
    if (!lastMessage || lastMessage.info.role !== "assistant") return [];
    return (lastMessage.parts || [])
      .filter((p): p is ToolPart => p.type === "tool")
      .map(p => ({ name: p.tool, status: p.state.status }));
  }, [lastMessage]);

  // Auto-scroll to bottom when messages change or when running
  useEffect(() => {
    const scrollToBottom = () => {
      if (scrollRef.current) {
        const scrollElement = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
        if (scrollElement) {
          scrollElement.scrollTop = scrollElement.scrollHeight;
        }
      }
    };
    // Small delay to ensure content is rendered
    const timer = setTimeout(scrollToBottom, 50);
    return () => clearTimeout(timer);
  }, [messages, isRunning]);

  if (!activeSessionId) {
    return (
      <div className="w-[400px] flex flex-col border-r border-border">
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center text-muted-foreground">
            <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No session selected</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-[400px] flex flex-col border-r border-border">
      <ScrollArea className="flex-1" ref={scrollRef}>
        {isLoading ? (
          <div className="p-4 space-y-4">
            <MessageSkeleton />
            <MessageSkeleton isAssistant />
          </div>
        ) : messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center p-6">
            <h2 className="text-base font-medium mb-1">
              {activeSession?.title || "New session"}
            </h2>
            <p className="text-sm text-muted-foreground text-center">
              Describe what you want to build
            </p>
          </div>
        ) : (
          <div className="px-4">
            {messages.map((message, index) => {
              const isLastMessage = index === messages.length - 1;
              const isAssistantMessage = message.info.role === "assistant";
              const isStreaming = isRunning && isLastMessage && isAssistantMessage;

              return (
                <ChatMessage
                  key={message.info.id}
                  message={message}
                  isStreaming={isStreaming}
                />
              );
            })}

            {/* Permission Dialog */}
            {isWaiting && sessionStatus.permission && activeSessionId && (
              <PermissionDialog
                sessionId={activeSessionId}
                permission={sessionStatus.permission}
              />
            )}

            {/* Retry Error */}
            {isRetry && (
              <div className="mx-4 my-3 rounded-lg border border-red-500/30 bg-red-500/5 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-red-600 dark:text-red-400">
                      Error occurred
                    </p>
                    <p className="text-xs text-red-500/80 mt-0.5">
                      {sessionStatus.error}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 text-red-600 hover:text-red-700 hover:bg-red-500/10"
                  >
                    <RefreshCw className="h-3 w-3" />
                    Retry
                  </Button>
                </div>
              </div>
            )}

            {/* Running Status with tool progress */}
            <AnimatePresence>
              {isRunning && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <MessageProgress
                    tools={toolsFromLastMessage}
                    currentStatus={
                      sessionStatus.type === "busy" && sessionStatus.activeForm
                        ? sessionStatus.activeForm
                        : activeTask?.content
                    }
                    isThinking={toolsFromLastMessage.length === 0}
                  />
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}
      </ScrollArea>

      <ChatInput />
    </div>
  );
}
