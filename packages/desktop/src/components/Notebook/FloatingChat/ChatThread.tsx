import { useEffect, useRef } from "react";
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
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

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

  // Reverse messages so newest is at bottom
  const sortedMessages = [...messages].reverse();

  return (
    <ScrollArea className="h-64" ref={scrollRef}>
      <div className="p-3 space-y-3">
        {sortedMessages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No messages yet
          </div>
        ) : (
          sortedMessages.map((message) => (
            <ChatMessage key={message.info.id} message={message} />
          ))
        )}
      </div>
    </ScrollArea>
  );
}
