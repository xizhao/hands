/**
 * ValidationPanel - Shows validation results for sources
 *
 * Displays status, agent output, and action buttons.
 */

import { cn } from "@/lib/utils";
import type { BackgroundTaskState, BackgroundTaskResult } from "@/hooks/useBackgroundTask";
import type { MessageWithParts } from "@/lib/api";
import {
  CheckCircle,
  XCircle,
  CircleNotch,
  Robot,
  CaretDown,
  CaretRight,
  Wrench,
  ArrowClockwise,
} from "@phosphor-icons/react";
import { useState } from "react";

interface ValidationPanelProps {
  state: BackgroundTaskState;
  onValidate: () => void;
  onFix?: () => void;
  className?: string;
}

export function ValidationPanel({
  state,
  onValidate,
  onFix,
  className,
}: ValidationPanelProps) {
  const [expanded, setExpanded] = useState(true);
  const { status, messages, result } = state;

  // Don't show panel if idle and never run
  if (status === "idle" && !result && messages.length === 0) {
    return (
      <div className={cn("flex items-center gap-2", className)}>
        <button
          onClick={onValidate}
          className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
            "bg-purple-500/10 hover:bg-purple-500/20 text-purple-400"
          )}
        >
          <Robot weight="duotone" className="h-4 w-4" />
          Validate
        </button>
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border", className)}>
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-muted/50 transition-colors"
      >
        {expanded ? (
          <CaretDown weight="bold" className="h-4 w-4 text-muted-foreground" />
        ) : (
          <CaretRight weight="bold" className="h-4 w-4 text-muted-foreground" />
        )}

        {/* Status indicator */}
        {status === "running" && (
          <>
            <CircleNotch weight="bold" className="h-4 w-4 animate-spin text-purple-400" />
            <span className="text-sm font-medium">Validating...</span>
          </>
        )}
        {status === "success" && (
          <>
            <CheckCircle weight="fill" className="h-4 w-4 text-green-500" />
            <span className="text-sm font-medium text-green-500">Validation Passed</span>
          </>
        )}
        {status === "failure" && (
          <>
            <XCircle weight="fill" className="h-4 w-4 text-red-500" />
            <span className="text-sm font-medium text-red-500">Validation Failed</span>
          </>
        )}
        {status === "idle" && result && (
          <>
            {result.success ? (
              <CheckCircle weight="fill" className="h-4 w-4 text-green-500" />
            ) : (
              <XCircle weight="fill" className="h-4 w-4 text-red-500" />
            )}
            <span className={cn(
              "text-sm font-medium",
              result.success ? "text-green-500" : "text-red-500"
            )}>
              {result.success ? "Passed" : "Failed"}
            </span>
          </>
        )}

        {/* Action buttons */}
        <div className="ml-auto flex items-center gap-2">
          {status !== "running" && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onValidate();
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-muted hover:bg-muted/80 transition-colors"
            >
              <ArrowClockwise weight="bold" className="h-3 w-3" />
              Re-run
            </button>
          )}
          {status === "failure" && onFix && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onFix();
              }}
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs font-medium bg-purple-500 text-white hover:bg-purple-600 transition-colors"
            >
              <Wrench weight="bold" className="h-3 w-3" />
              Auto-fix
            </button>
          )}
        </div>
      </button>

      {/* Content */}
      {expanded && (
        <div className="px-3 pb-3 space-y-2">
          {/* Messages / Output */}
          {messages.length > 0 && (
            <div className="space-y-2">
              {messages
                .filter((m) => m.info.role === "assistant")
                .map((message) => (
                  <MessageContent key={message.info.id} message={message} />
                ))}
            </div>
          )}

          {/* Error details */}
          {result?.error && status === "failure" && (
            <div className="p-2 rounded bg-red-500/10 border border-red-500/20">
              <p className="text-xs text-red-400 font-mono">{result.error}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Render a single message's content
 */
function MessageContent({ message }: { message: MessageWithParts }) {
  const textParts = message.parts.filter((p) => p.type === "text");
  const text = textParts
    .map((p) => (p as { text?: string }).text || "")
    .join("\n")
    .trim();

  if (!text) return null;

  return (
    <div className="p-2 rounded bg-muted/50 text-sm">
      <pre className="whitespace-pre-wrap font-sans text-xs text-muted-foreground leading-relaxed">
        {text}
      </pre>
    </div>
  );
}
