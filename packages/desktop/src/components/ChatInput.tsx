import { useState, useRef, useCallback, useEffect } from "react";
import { useUIStore } from "@/stores/ui";
import { useSendMessage, useAbortSession, useSessionStatuses } from "@/hooks/useSession";
import { Button } from "@/components/ui/button";
import { ArrowUp, Square, Shield } from "lucide-react";
import { cn } from "@/lib/utils";

export function ChatInput() {
  const [input, setInput] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { activeSessionId } = useUIStore();
  const { data: sessionStatuses = {} } = useSessionStatuses();
  const sendMessage = useSendMessage(activeSessionId);
  const abortSession = useAbortSession(activeSessionId);

  const status = activeSessionId ? sessionStatuses[activeSessionId] : null;
  const isBusy = status?.type === "busy" || status?.type === "running";
  const isWaiting = status?.type === "waiting";

  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, []);

  useEffect(() => {
    adjustTextareaHeight();
  }, [input, adjustTextareaHeight]);

  const handleSubmit = async () => {
    if (!input.trim() || isBusy || !activeSessionId) return;

    const message = input.trim();
    setInput("");
    // Model is now configured via OpenCode config, not per-request
    sendMessage.mutate(message);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handleAbort = () => {
    if (activeSessionId) {
      abortSession.mutate();
    }
  };

  return (
    <div className="p-3 border-t border-border">
      {/* Waiting for permission indicator */}
      {isWaiting && (
        <div className="flex items-center gap-2 text-xs text-yellow-600 dark:text-yellow-400 mb-2 px-1">
          <Shield className="h-3 w-3" />
          <span>Waiting for permission approval above...</span>
        </div>
      )}

      <div className={cn(
        "flex items-end gap-2 rounded-md border bg-background p-1.5",
        isWaiting ? "border-yellow-500/30" : "border-border"
      )}>
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isWaiting ? "Approve permission to continue..." : "Message..."}
          disabled={!activeSessionId || isWaiting}
          className={cn(
            "flex-1 resize-none bg-transparent py-1 px-2 text-sm",
            "placeholder:text-muted-foreground focus:outline-none",
            "min-h-[28px] max-h-[120px]",
            isWaiting && "opacity-50"
          )}
          rows={1}
        />

        {isBusy ? (
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 shrink-0"
            onClick={handleAbort}
          >
            <Square className="h-3.5 w-3.5" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className={cn(
              "h-7 w-7 shrink-0",
              input.trim() && "bg-primary text-primary-foreground hover:bg-primary/90"
            )}
            disabled={!input.trim() || !activeSessionId || sendMessage.isPending}
            onClick={handleSubmit}
          >
            <ArrowUp className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
    </div>
  );
}
