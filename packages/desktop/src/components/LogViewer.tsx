/**
 * LogViewer - Displays log output with timestamps and levels
 *
 * Used for showing source sync output in real-time.
 */

import { CheckCircle, CircleNotch, Terminal, XCircle } from "@phosphor-icons/react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

export interface LogEntry {
  timestamp: number;
  level: "info" | "warn" | "error" | "debug";
  message: string;
}

interface LogViewerProps {
  logs: LogEntry[];
  isRunning?: boolean;
  className?: string;
  maxHeight?: string;
}

const levelColors: Record<LogEntry["level"], string> = {
  info: "text-blue-400",
  warn: "text-amber-400",
  error: "text-red-400",
  debug: "text-muted-foreground",
};

const levelLabels: Record<LogEntry["level"], string> = {
  info: "INFO",
  warn: "WARN",
  error: "ERR ",
  debug: "DBG ",
};

function formatTime(timestamp: number): string {
  const date = new Date(timestamp);
  return date.toLocaleTimeString("en-US", {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function LogViewer({ logs, isRunning, className, maxHeight = "300px" }: LogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  if (logs.length === 0 && !isRunning) {
    return null;
  }

  return (
    <div className={cn("rounded-lg border bg-black/50 overflow-hidden", className)}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
        <Terminal weight="duotone" className="h-4 w-4 text-muted-foreground" />
        <span className="text-xs font-medium text-muted-foreground">Output</span>
        {isRunning && (
          <CircleNotch weight="bold" className="h-3.5 w-3.5 animate-spin text-purple-400 ml-auto" />
        )}
      </div>

      {/* Log content */}
      <div
        ref={containerRef}
        className="overflow-y-auto font-mono text-xs p-3 space-y-0.5"
        style={{ maxHeight }}
      >
        {logs.length === 0 && isRunning && (
          <div className="text-muted-foreground/50 animate-pulse">Waiting for output...</div>
        )}
        {logs.map((log) => (
          <div
            key={`${log.timestamp}-${log.message.slice(0, 20)}`}
            className="flex gap-2 leading-relaxed"
          >
            <span className="text-muted-foreground/50 shrink-0">{formatTime(log.timestamp)}</span>
            <span className={cn("shrink-0", levelColors[log.level])}>{levelLabels[log.level]}</span>
            <span className="text-foreground/90 whitespace-pre-wrap break-all">{log.message}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Simplified log viewer for showing sync result
 */
interface SyncLogViewerProps {
  logs: LogEntry[];
  isRunning: boolean;
  result?: {
    success: boolean;
    durationMs: number;
    error?: string;
  };
  className?: string;
}

export function SyncLogViewer({ logs, isRunning, result, className }: SyncLogViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new logs arrive
  useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, []);

  const showLogs = logs.length > 0 || isRunning;

  return (
    <div className={cn("space-y-3", className)}>
      {/* Log output */}
      {showLogs && (
        <div className="rounded-lg border bg-black/50 overflow-hidden">
          {/* Header */}
          <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
            <Terminal weight="duotone" className="h-4 w-4 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">Output</span>
            {isRunning && (
              <CircleNotch
                weight="bold"
                className="h-3.5 w-3.5 animate-spin text-purple-400 ml-auto"
              />
            )}
          </div>

          {/* Log content */}
          <div
            ref={containerRef}
            className="overflow-y-auto font-mono text-xs p-3 space-y-0.5"
            style={{ maxHeight: "200px" }}
          >
            {logs.length === 0 && isRunning && (
              <div className="text-muted-foreground/50 animate-pulse">Waiting for output...</div>
            )}
            {logs.map((log) => (
              <div
                key={`${log.timestamp}-${log.message.slice(0, 20)}`}
                className="flex gap-2 leading-relaxed"
              >
                <span className="text-muted-foreground/50 shrink-0">
                  {formatTime(log.timestamp)}
                </span>
                <span className={cn("shrink-0", levelColors[log.level])}>
                  {levelLabels[log.level]}
                </span>
                <span className="text-foreground/90 whitespace-pre-wrap break-all">
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result summary */}
      {result && !isRunning && (
        <div
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm",
            result.success
              ? "bg-green-500/10 border border-green-500/20 text-green-400"
              : "bg-red-500/10 border border-red-500/20 text-red-400",
          )}
        >
          {result.success ? (
            <>
              <CheckCircle weight="fill" className="h-4 w-4" />
              <span>Completed in {result.durationMs}ms</span>
            </>
          ) : (
            <>
              <XCircle weight="fill" className="h-4 w-4" />
              <span>{result.error || "Sync failed"}</span>
            </>
          )}
        </div>
      )}
    </div>
  );
}
