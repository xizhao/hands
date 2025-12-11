/**
 * TaskToolSummary - Inline display for task tool invocations
 *
 * Shows a compact summary of a running or completed task with:
 * - Description as the collapsed header
 * - Pulsating indicator for running state
 * - Live streaming updates from child session
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, ChevronRight, CheckCircle2, AlertCircle, ExternalLink, Loader2 } from "lucide-react";
import { cn, MSG_FONT } from "@/lib/utils";
import { useSessions, useSessionStatuses, useMessages } from "@/hooks/useSession";
import { useActiveSession } from "@/hooks/useNavState";
import type { Session, ToolPart } from "@/lib/api";
import { ShimmerText } from "@/components/ui/thinking-indicator";

interface TaskToolSummaryProps {
  part: ToolPart;
  sessionId: string;  // Parent session ID
  compact?: boolean;
}

// Type helper for sessions with parentID
type SessionWithParent = Session & { parentID?: string };

export function TaskToolSummary({ part, sessionId, compact = false }: TaskToolSummaryProps) {
  const [expanded, setExpanded] = useState(false);
  const { data: sessions = [] } = useSessions();
  const { data: statuses = {} } = useSessionStatuses();
  const { setSession } = useActiveSession();

  const labelFont = compact ? MSG_FONT.labelCompact : MSG_FONT.label;
  const metaFont = compact ? MSG_FONT.metaCompact : MSG_FONT.meta;

  // Extract task input
  const input = part.state.input as {
    description?: string;
    prompt?: string;
  } | undefined;

  const description = input?.description || "Subtask";

  // Find child session for this task
  // Child sessions have parentID matching the parent session
  // We try to match by finding the most recent child session
  // TODO: Better matching if multiple tasks are running (could use tool invocation time)
  const childSessions = sessions.filter(s => {
    const sessionWithParent = s as SessionWithParent;
    return sessionWithParent.parentID === sessionId;
  });

  // Get the most recent child session (assuming tasks create sessions in order)
  const childSession = childSessions[childSessions.length - 1] as SessionWithParent | undefined;
  const childSessionId = childSession?.id;
  const childStatus = childSessionId ? statuses[childSessionId] : null;

  // Tool state (pending/running/completed/error from the tool itself)
  const toolState = part.state.status;
  const isToolRunning = toolState === "running" || toolState === "pending";
  const isToolError = toolState === "error";
  const isToolCompleted = toolState === "completed";

  // Child session state
  const isChildRunning = childStatus?.type === "busy" || childStatus?.type === "running";
  const hasChildError = childStatus?.type === "retry";
  const activeForm = childStatus?.type === "busy" ? (childStatus as { activeForm?: string }).activeForm : undefined;

  // Combined state: running if either tool or child is running
  const isRunning = isToolRunning || isChildRunning;
  const isCompleted = isToolCompleted && !isChildRunning;
  const hasError = isToolError || hasChildError;

  // Get summary from child session messages if available
  const { data: childMessages = [] } = useMessages(childSessionId || null);
  const lastAssistantMessage = childMessages.filter(m => m.info.role === "assistant").pop();
  const summaryPart = lastAssistantMessage?.parts?.find(p => p.type === "text");
  const summary = summaryPart && "text" in summaryPart ? (summaryPart.text as string)?.slice(0, 150) : undefined;

  // Tool output for completed tasks
  const toolOutput = isToolCompleted && "output" in part.state
    ? (part.state.output as string | undefined)?.slice(0, 200)
    : undefined;

  const handleOpenInThread = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (childSessionId) {
      setSession(childSessionId);
    }
  };

  return (
    <div className={cn(
      "py-0.5"
    )}>
      {/* Header row */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setExpanded(!expanded)}
          className={cn(
            "flex items-center gap-1.5 text-muted-foreground/60",
            "hover:text-muted-foreground transition-colors",
            labelFont
          )}
        >
          {/* Status icon with pulsating indicator for running */}
          {isRunning ? (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
            </span>
          ) : hasError ? (
            <AlertCircle className="h-2.5 w-2.5 text-destructive" />
          ) : isCompleted ? (
            <CheckCircle2 className="h-2.5 w-2.5 text-green-500" />
          ) : (
            <GitBranch className="h-2.5 w-2.5" />
          )}

          {/* Description as header */}
          <span className={cn(
            "truncate max-w-[200px]",
            isRunning && "text-green-400"
          )}>
            {description}
          </span>

          {/* Status text or active form */}
          {isRunning && activeForm && (
            <span className={cn("text-muted-foreground/40 truncate max-w-[100px]", metaFont)}>
              · {activeForm}
            </span>
          )}

          {/* Expand chevron */}
          <ChevronRight className={cn(
            "h-2.5 w-2.5 transition-transform",
            expanded && "rotate-90"
          )} />
        </button>

        {/* Open in thread button - only when we have a child session */}
        {childSessionId && (
          <button
            onClick={handleOpenInThread}
            className={cn(
              "flex items-center gap-0.5 px-1 py-0.5 rounded text-muted-foreground/40",
              "hover:text-muted-foreground hover:bg-muted/50 transition-colors",
              metaFont
            )}
            title="Open in thread"
          >
            <ExternalLink className="h-2.5 w-2.5" />
          </button>
        )}
      </div>

      {/* Streaming status when running (below header) */}
      {isRunning && activeForm && (
        <div className="ml-4 mt-0.5">
          <ShimmerText
            text={activeForm}
            className={cn("text-green-400/70", metaFont)}
          />
        </div>
      )}

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
            <div className={cn(
              "ml-4 mt-1.5 p-2 rounded-lg bg-background/30",
              "font-mono space-y-1.5",
              metaFont
            )}>
              {/* Summary from child session */}
              {summary && (
                <div>
                  <span className={cn("text-muted-foreground/40 uppercase", metaFont)}>output: </span>
                  <span className="text-muted-foreground/70 break-words">
                    {summary}{summary.length >= 150 && "..."}
                  </span>
                </div>
              )}

              {/* Tool output for completed without child summary */}
              {!summary && toolOutput && (
                <div>
                  <span className={cn("text-muted-foreground/40 uppercase", metaFont)}>result: </span>
                  <span className="text-muted-foreground/70 break-words">
                    {toolOutput}{toolOutput.length >= 200 && "..."}
                  </span>
                </div>
              )}

              {/* Error message */}
              {hasError && part.state.status === "error" && (
                <div className="text-red-400">
                  {part.state.error}
                </div>
              )}

              {/* Loading state */}
              {isRunning && !summary && !activeForm && (
                <div className="flex items-center gap-1.5 text-muted-foreground/50 italic">
                  <Loader2 className="h-3 w-3 animate-spin" />
                  <span>Working on task...</span>
                </div>
              )}

              {/* Pending state */}
              {!isRunning && !isCompleted && !hasError && !summary && (
                <div className="text-muted-foreground/50 italic">
                  Waiting to start...
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
