import { useEffect, useRef, useLayoutEffect } from "react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useUIStore } from "@/stores/ui";
import { useMessages } from "@/hooks/useSession";
import { ChatMessage } from "@/components/ChatMessage";

interface ChatThreadProps {
  onCollapse: () => void;
}

export function ChatThread({ onCollapse: _onCollapse }: ChatThreadProps) {
  const { activeSessionId } = useUIStore();
  const { data: messages = [], isLoading } = useMessages(activeSessionId);
  const bottomRef = useRef<HTMLDivElement>(null);
  const hasScrolledRef = useRef(false);

  // Scroll to bottom helper
  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    bottomRef.current?.scrollIntoView({ behavior, block: "end" });
  };

  // Scroll to bottom on new messages
  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom(hasScrolledRef.current ? "smooth" : "instant");
      hasScrolledRef.current = true;
    }
  }, [messages.length]);

  // Scroll to bottom on mount (after animation settles)
  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      scrollToBottom("instant");
    }, 250); // Wait for expand animation
    return () => clearTimeout(timer);
  }, []);

  if (!activeSessionId) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        Start a conversation
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="h-64 flex items-center justify-center text-muted-foreground text-sm">
        Loading...
      </div>
    );
  }

  return (
    <ScrollArea className="h-64">
      <div className="p-3 space-y-3">
        {messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No messages yet
          </div>
        ) : (
          messages.map((message) => (
            <ChatMessage key={message.info.id} message={message} />
          ))
        )}
        {/* Scroll anchor */}
        <div ref={bottomRef} />
      </div>
    </ScrollArea>
  );
}
