import { useState, useRef, KeyboardEvent } from "react";
import { Send, Loader2, Square } from "lucide-react";
import { useUIStore } from "@/stores/ui";
import { useSendMessage, useAbortSession, useCreateSession, useSessionStatus } from "@/hooks/useSession";

interface ChatToolbarProps {
  expanded: boolean;
  onExpandChange: (expanded: boolean) => void;
}

export function ChatToolbar({ expanded, onExpandChange }: ChatToolbarProps) {
  const [input, setInput] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const { activeSessionId, setActiveSession } = useUIStore();
  const sendMessage = useSendMessage();
  const abortSession = useAbortSession(activeSessionId);
  const createSession = useCreateSession();
  const sessionStatus = useSessionStatus(activeSessionId);

  const isBusy = sessionStatus?.type === "busy" || sendMessage.isPending;

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (!trimmed || isBusy) return;

    // Expand on submit
    if (!expanded) {
      onExpandChange(true);
    }

    // Create session if needed
    let sessionId = activeSessionId;
    if (!sessionId) {
      try {
        const newSession = await createSession.mutateAsync({});
        sessionId = newSession.id;
        setActiveSession(sessionId);
      } catch (err) {
        console.error("[chat] Failed to create session:", err);
        return;
      }
    }

    setInput("");

    try {
      await sendMessage.mutateAsync({
        sessionId,
        content: trimmed,
      });
    } catch (err) {
      console.error("[chat] Failed to send message:", err);
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
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
    <div className="flex items-center gap-2 p-2">
      <input
        ref={inputRef}
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        onKeyDown={handleKeyDown}
        onFocus={() => !expanded && onExpandChange(true)}
        placeholder="Ask anything..."
        className="flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none px-2 py-1.5"
      />
      {isBusy ? (
        <button
          onClick={handleAbort}
          className="p-2 rounded-lg bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors"
        >
          <Square className="h-4 w-4" />
        </button>
      ) : (
        <button
          onClick={handleSubmit}
          disabled={!input.trim()}
          className="p-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {sendMessage.isPending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      )}

      {/* Status indicator */}
      <div
        className={`h-2 w-2 rounded-full ${
          isBusy ? "bg-green-500 animate-pulse" : "bg-green-500"
        }`}
        title={isBusy ? "Working..." : "Ready"}
      />
    </div>
  );
}
