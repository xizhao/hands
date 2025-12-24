/**
 * SubagentSummary - Inline display for subagent/subtask runs
 *
 * Shows a compact summary of a running or completed subagent task
 * with an option to open it in an adjacent thread chip.
 */

import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, Bot, CheckCircle2, ChevronRight, ExternalLink, Loader2 } from "lucide-react";
import { useState } from "react";
import { useActiveSession } from "@/hooks/useNavState";
import { useMessages, useSessionStatuses, useSessions } from "@/hooks/useSession";
import type { Session } from "@/lib/api";
import { cn, MSG_FONT } from "@/lib/utils";

interface SubagentSummaryProps {
  agentName: string;
  sessionId: string; // Parent session ID - used to find child session
  messageId: string;
  compact?: boolean;
}

export function SubagentSummary({
  agentName,
  sessionId,
  messageId,
  compact = false,
}: SubagentSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: sessions = [] } = useSessions();
  const { data: statuses = {} } = useSessionStatuses();
  const { setSession } = useActiveSession();

  const _baseFont = compact ? MSG_FONT.baseCompact : MSG_FONT.base;
  const labelFont = compact ? MSG_FONT.labelCompact : MSG_FONT.label;
  const _metaFont = compact ? MSG_FONT.metaCompact : MSG_FONT.meta;

  // Find child session for this agent invocation
  // Child sessions have parentID matching the parent session
  const childSession = sessions.find(
    (s) => (s as Session & { parentID?: string }).parentID === sessionId,
  ) as (Session & { parentID?: string }) | undefined;

  const childSessionId = childSession?.id;
  const childStatus = childSessionId ? statuses[childSessionId] : null;

  // Determine status
  const isRunning = childStatus?.type === "busy" || childStatus?.type === "running";
  const hasError = childStatus?.type === "retry";
  const isComplete = !isRunning && !hasError && childSessionId;
  const activeForm =
    childStatus?.type === "busy" ? (childStatus as { activeForm?: string }).activeForm : undefined;

  // Get summary from child session messages if available
  const { data: childMessages = [] } = useMessages(childSessionId || null);
  const lastAssistantMessage = childMessages.filter((m) => m.info.role === "assistant").pop();
  const summary = lastAssistantMessage?.parts?.find((p) => p.type === "text")?.text?.slice(0, 100);

  const handleOpenInThread = () => {
    if (childSessionId) {
      setSession(childSessionId);
    }
  };

  return (
    <div
      className={cn(
        "rounded-lg border bg-muted/30",
        compact ? "px-2 py-1.5" : "px-3 py-2",
        "transition-colors hover:bg-muted/50",
      )}
    >
      {/* Header row */}
      <div className="flex items-center gap-2">
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 flex-1 text-left"
        >
          {/* Status icon */}
          {isRunning ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin text-blue-500" />
          ) : hasError ? (
            <AlertCircle className="h-3.5 w-3.5 text-destructive" />
          ) : isComplete ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-green-500" />
          ) : (
            <Bot className="h-3.5 w-3.5 text-muted-foreground" />
          )}

          {/* Status text */}
          <span className={cn("text-muted-foreground", labelFont)}>
            {isRunning
              ? activeForm || "Working..."
              : hasError
                ? "Failed"
                : isComplete
                  ? "Completed"
                  : "Pending"}
          </span>

          {/* Expand chevron */}
          <ChevronRight
            className={cn(
              "h-3 w-3 text-muted-foreground transition-transform ml-auto",
              expanded && "rotate-90",
            )}
          />
        </button>

        {/* Open in thread button */}
        {childSessionId && (
          <button
            onClick={handleOpenInThread}
            className={cn(
              "flex items-center gap-1 px-1.5 py-0.5 rounded text-muted-foreground",
              "hover:text-foreground hover:bg-muted transition-colors",
              labelFont,
            )}
            title="Open in thread"
          >
            <ExternalLink className="h-3 w-3" />
            <span className="hidden sm:inline">Open</span>
          </button>
        )}
      </div>

      {/* Expanded content */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className={cn("pt-2 mt-2 border-t border-border/50", labelFont)}>
              {summary ? (
                <p className="text-muted-foreground line-clamp-3">{summary}...</p>
              ) : isRunning ? (
                <p className="text-muted-foreground italic">Working on task...</p>
              ) : !childSessionId ? (
                <p className="text-muted-foreground italic">Waiting to start...</p>
              ) : (
                <p className="text-muted-foreground italic">No output yet</p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
