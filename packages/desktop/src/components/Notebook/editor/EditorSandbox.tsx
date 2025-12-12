/**
 * EditorSandbox - Hosts the editor in an iframe for crash isolation
 *
 * The iframe loads the editor from packages/editor dev server.
 * The editor handles all communication with the runtime directly.
 * We just pass it the blockId and runtimePort via URL params.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRuntimePort } from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";
import { getTheme } from "@/lib/theme";


type SandboxState = "loading" | "ready" | "error";

interface EditorSandboxProps {
  blockId: string;
  className?: string;
  readOnly?: boolean;
}

export function EditorSandbox({
  blockId,
  className,
  readOnly = false,
}: EditorSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<SandboxState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [crashCount, setCrashCount] = useState(0);
  const iframeKey = useRef(0);

  // Runtime port for the editor to connect to
  const runtimePort = useRuntimePort();

  // Get current theme to pass to iframe
  const theme = getTheme();

  // Build iframe URL with params (including theme)
  const iframeSrc = runtimePort
    ? `/editor/sandbox.html?blockId=${encodeURIComponent(blockId)}&runtimePort=${runtimePort}&readOnly=${readOnly}&theme=${encodeURIComponent(theme)}`
    : null;

  // Handle iframe load
  const handleIframeLoad = useCallback(() => {
    setState("ready");
  }, []);

  // Send theme changes to iframe via postMessage
  useEffect(() => {
    if (state !== "ready" || !iframeRef.current?.contentWindow) return;
    iframeRef.current.contentWindow.postMessage({ type: "theme", theme }, "*");
  }, [theme, state]);

  // Handle iframe load error
  const handleIframeError = useCallback(() => {
    setState("error");
    setError(
      "Could not connect to editor. Make sure the editor sandbox is running:\n\ncd packages/editor && bun run dev:sandbox"
    );
  }, []);

  // Timeout for iframe load
  useEffect(() => {
    if (state !== "loading") return;

    const timeout = setTimeout(() => {
      if (state === "loading") {
        setState("error");
        setError("Editor took too long to initialize. Is the editor dev server running?");
      }
    }, 10000);

    return () => clearTimeout(timeout);
  }, [state]);

  // Handle retry
  const handleRetry = useCallback(() => {
    if (crashCount >= 3) {
      setError("Editor has crashed multiple times. Try reloading the app.");
      return;
    }

    iframeKey.current += 1;
    setState("loading");
    setError(null);
    setCrashCount((c) => c + 1);
  }, [crashCount]);

  // Waiting for runtime port
  if (!runtimePort) {
    return (
      <div className={cn("flex items-center justify-center h-full bg-background", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm font-medium">Connecting to runtime...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (state === "error") {
    return (
      <div className={cn("flex flex-col items-center justify-center h-full bg-background gap-4", className)}>
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Editor Error</p>
          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line max-w-md">
            {error}
          </p>
        </div>
        {crashCount < 3 && (
          <Button variant="outline" size="xs" onClick={handleRetry}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Retry
          </Button>
        )}
        {crashCount >= 3 && (
          <p className="text-xs text-muted-foreground">
            Multiple crashes detected. Please reload the application.
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={cn("relative flex flex-col h-full", className)}>
      {/* Loading overlay */}
      {state === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            <span className="text-sm font-medium">Starting editor...</span>
          </div>
        </div>
      )}

      {/* Editor iframe - opacity 0 until ready to prevent white flash */}
      <iframe
        key={iframeKey.current}
        ref={iframeRef}
        src={iframeSrc!}
        className={cn(
          "w-full h-full border-0 transition-opacity duration-75",
          state === "ready" ? "opacity-100" : "opacity-0"
        )}
        sandbox="allow-scripts allow-same-origin"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
      />
    </div>
  );
}
