import { useState, useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { motion, AnimatePresence } from "framer-motion";
import { MessageSquare, Minus } from "lucide-react";
import { ChatToolbar } from "./ChatToolbar";
import { ChatThread } from "./ChatThread";

export function FloatingChat() {
  const [isVisible, setIsVisible] = useState(true);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);

  // Track window focus
  useEffect(() => {
    let unsubscribe: (() => void) | null = null;

    const setupListener = async () => {
      const window = getCurrentWindow();
      const unlisten = await window.onFocusChanged(({ payload: focused }) => {
        setIsVisible(focused);
      });
      unsubscribe = unlisten;
    };

    setupListener();

    return () => {
      unsubscribe?.();
    };
  }, []);

  if (!isVisible) return null;

  // Minimized state - just a small button
  if (isMinimized) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.8 }}
        className="fixed bottom-4 right-4 z-50"
      >
        <button
          onClick={() => setIsMinimized(false)}
          className="p-3 rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
        >
          <MessageSquare className="h-5 w-5" />
        </button>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 100, opacity: 0 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-4 left-4 right-4 z-50 max-w-2xl mx-auto"
      >
        <div className="bg-background/95 backdrop-blur-xl rounded-2xl border border-border shadow-2xl overflow-hidden">
          {/* Header with minimize/close */}
          <div className="flex items-center justify-between px-3 py-2 border-b border-border/50 bg-muted/30">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Chat</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setIsMinimized(true)}
                className="p-1 hover:bg-muted rounded transition-colors"
              >
                <Minus className="h-3.5 w-3.5 text-muted-foreground" />
              </button>
            </div>
          </div>

          {/* Chat thread (expanded) */}
          <AnimatePresence>
            {isExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                <ChatThread onCollapse={() => setIsExpanded(false)} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Input toolbar */}
          <ChatToolbar
            expanded={isExpanded}
            onExpandChange={setIsExpanded}
          />
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
