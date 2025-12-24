import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { convertFileSrc } from "@tauri-apps/api/core";
import { GripVertical, Image, Send, X, Maximize2, Minimize2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
}

export function ChatWidget() {
  const [screenshotPath, setScreenshotPath] = useState<string | null>(null);
  const [screenshotUrl, setScreenshotUrl] = useState<string | null>(null);
  const [widgetId, setWidgetId] = useState<string>("");
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [showScreenshot, setShowScreenshot] = useState(true);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Parse query params on mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const screenshot = params.get("screenshot");
    const id = params.get("widget-id");

    if (screenshot) {
      const path = decodeURIComponent(screenshot);
      setScreenshotPath(path);
      // Convert to asset URL for display
      setScreenshotUrl(convertFileSrc(path));
    }

    if (id) {
      setWidgetId(id);
    }

    // Focus input on mount
    setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
  }, []);

  // Handle escape to close
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        await handleClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [widgetId]);

  const handleClose = async () => {
    try {
      if (widgetId) {
        await invoke("close_chat_widget", { widgetId });
      } else {
        const win = getCurrentWindow();
        await win.close();
      }
    } catch (err) {
      console.error("Failed to close widget:", err);
      const win = getCurrentWindow();
      await win.close();
    }
  };

  const handleDragStart = async (e: React.MouseEvent) => {
    e.preventDefault();
    try {
      const win = getCurrentWindow();
      await win.startDragging();
    } catch (err) {
      console.error("Failed to start dragging:", err);
    }
  };

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: crypto.randomUUID(),
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      // TODO: Connect to OpenCode API
      // For now, just simulate a response
      await new Promise((resolve) => setTimeout(resolve, 1000));

      const assistantMessage: Message = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: `I see you've captured a screenshot. Let me analyze it...\n\n(Screenshot path: ${screenshotPath || "none"})`,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error("Failed to send message:", err);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, screenshotPath]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-background/95 backdrop-blur-lg rounded-xl overflow-hidden border border-border shadow-2xl">
      {/* Header - draggable */}
      <div className="flex items-center justify-between bg-card/80 border-b border-border px-2 py-1.5 shrink-0">
        {/* Drag handle */}
        <div
          onMouseDown={handleDragStart}
          className="flex items-center gap-1.5 cursor-grab active:cursor-grabbing flex-1"
        >
          <GripVertical className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Quick Chat</span>
        </div>

        {/* Controls */}
        <div className="flex items-center gap-0.5">
          {screenshotUrl && (
            <button
              onClick={() => setShowScreenshot(!showScreenshot)}
              className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
              title={showScreenshot ? "Hide screenshot" : "Show screenshot"}
            >
              <Image className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1 rounded hover:bg-accent text-muted-foreground hover:text-accent-foreground transition-colors"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? (
              <Minimize2 className="h-3.5 w-3.5" />
            ) : (
              <Maximize2 className="h-3.5 w-3.5" />
            )}
          </button>
          <button
            onClick={handleClose}
            className="p-1 rounded hover:bg-destructive text-muted-foreground hover:text-destructive-foreground transition-colors"
            title="Close"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Screenshot preview */}
      {screenshotUrl && showScreenshot && (
        <div className="shrink-0 p-2 border-b border-border bg-muted/30">
          <div className="relative rounded-lg overflow-hidden border border-border max-h-32">
            <img
              src={screenshotUrl}
              alt="Captured screenshot"
              className="w-full h-full object-contain"
            />
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {messages.length === 0 && (
          <div className="text-center text-muted-foreground text-xs py-4">
            Ask a question about the screenshot...
          </div>
        )}

        {messages.map((msg) => (
          <div
            key={msg.id}
            className={`text-sm rounded-lg px-3 py-2 ${
              msg.role === "user"
                ? "bg-primary text-primary-foreground ml-4"
                : "bg-muted mr-4"
            }`}
          >
            {msg.content}
          </div>
        ))}

        {isLoading && (
          <div className="bg-muted mr-4 rounded-lg px-3 py-2 text-sm">
            <div className="flex items-center gap-1.5">
              <div className="h-1.5 w-1.5 bg-foreground/50 rounded-full animate-bounce" />
              <div className="h-1.5 w-1.5 bg-foreground/50 rounded-full animate-bounce [animation-delay:0.2s]" />
              <div className="h-1.5 w-1.5 bg-foreground/50 rounded-full animate-bounce [animation-delay:0.4s]" />
            </div>
          </div>
        )}
      </div>

      {/* Input */}
      <div className="shrink-0 p-2 border-t border-border bg-card/50">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about this screenshot..."
            className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring min-h-[36px] max-h-24"
            rows={1}
            disabled={isLoading}
          />
          <button
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
            className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

export default ChatWidget;
