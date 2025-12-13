/**
 * EditorSandbox - Hosts the editor in an iframe for crash isolation
 *
 * The sandbox is a minimal skeleton - we inject CSS from parent.
 * Editor handles all communication with runtime directly.
 *
 * If the editor isn't ready, we poll the runtime until it is (or timeout).
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRuntimePort } from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAlertsStore } from "@/stores/alerts";

// Editor error event types (must match packages/editor/src/overlay/errors.ts)
type EditorErrorCategory = 'http' | 'runtime' | 'mutation';

interface EditorError {
  id: string;
  category: EditorErrorCategory;
  message: string;
  details?: string;
  stack?: string;
  status?: number;
  operation?: string;
  timestamp: number;
  blockId?: string;
}

interface EditorErrorEvent {
  type: 'editor-error';
  category: EditorErrorCategory;
  error: EditorError;
}

function isEditorErrorEvent(msg: unknown): msg is EditorErrorEvent {
  return (
    typeof msg === 'object' &&
    msg !== null &&
    (msg as EditorErrorEvent).type === 'editor-error' &&
    typeof (msg as EditorErrorEvent).error === 'object'
  );
}


type SandboxState = "loading" | "waiting" | "ready" | "error";

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
  const [state, setState] = useState<SandboxState>("waiting");
  const [error, setError] = useState<string | null>(null);
  const [crashCount, setCrashCount] = useState(0);
  const [editorReady, setEditorReady] = useState(false);
  const iframeKey = useRef(0);

  // Runtime port for the editor to connect to
  const runtimePort = useRuntimePort();

  // Editor runs on runtime port + 400 (e.g., 55000 -> 55400)
  const editorPort = runtimePort ? runtimePort + 400 : null;

  // Poll runtime to check if editor is ready before loading iframe
  useEffect(() => {
    if (!runtimePort || editorReady) return;

    let cancelled = false;
    const pollTimeout = 30000; // 30 second total timeout
    const pollInterval = 500;
    const startTime = Date.now();

    const poll = async () => {
      while (!cancelled && Date.now() - startTime < pollTimeout) {
        try {
          const res = await fetch(`http://localhost:${runtimePort}/status`, {
            signal: AbortSignal.timeout(2000),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.services?.editor?.ready) {
              setEditorReady(true);
              setState("loading");
              return;
            }
          }
        } catch {
          // Runtime not ready yet, keep polling
        }
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }

      // Timeout - show error
      if (!cancelled) {
        setState("error");
        setError("Editor server took too long to start. Check the runtime logs.");
      }
    };

    poll();
    return () => { cancelled = true; };
  }, [runtimePort, editorReady]);

  // Build iframe URL - load directly from editor Vite for proper module resolution
  // Vite needs to serve its own assets (/@vite, /src, /@react-refresh, etc.)
  const iframeSrc = editorPort && editorReady
    ? `http://localhost:${editorPort}/sandbox.html?blockId=${encodeURIComponent(blockId)}&runtimePort=${runtimePort}&readOnly=${readOnly}`
    : null;

  // Generate CSS to inject into iframe - copy ALL CSS variables
  const generateStyles = useCallback(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains('dark');

    // All the CSS variables we need to pass
    const allVars = [
      // Theme colors (from theme.ts)
      'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
      'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
      'muted', 'muted-foreground', 'accent', 'accent-foreground',
      'destructive', 'destructive-foreground', 'border', 'input', 'ring',
      // Additional vars from index.css
      'radius', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'brand', 'highlight',
      // Sidebar vars if they exist
      'sidebar-background', 'sidebar-foreground', 'sidebar-primary', 'sidebar-primary-foreground',
      'sidebar-accent', 'sidebar-accent-foreground', 'sidebar-border', 'sidebar-ring'
    ];

    // Get computed values for all vars
    const computedStyle = getComputedStyle(root);
    const cssVars = allVars
      .map(v => {
        const value = computedStyle.getPropertyValue(`--${v}`).trim();
        return value ? `--${v}:${value}` : null;
      })
      .filter(Boolean)
      .join(';');

    // Build complete CSS
    return `:root{${cssVars}}` +
      (isDark ? 'html{color-scheme:dark}' : 'html{color-scheme:light}') +
      'html,body{background:transparent}' +
      '#root{padding-bottom:80px}'; // Room for floating chatbar overlay
  }, []);

  // Send styles to iframe
  const sendStyles = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;
    const css = generateStyles();
    iframeRef.current.contentWindow.postMessage({ type: 'styles', css }, '*');
  }, [generateStyles]);

  // Listen for sandbox ready signal and editor errors
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'sandbox-ready') {
        console.log('[EditorSandbox] Sandbox ready, sending styles');
        sendStyles();
        setState("ready");
      }

      // Handle editor errors from iframe
      if (isEditorErrorEvent(e.data)) {
        const { error } = e.data;
        console.log('[EditorSandbox] Received error from editor:', error.category, error.message);

        // HTTP and mutation errors show as Sonner toasts
        if (error.category === 'http' || error.category === 'mutation') {
          toast.error(error.message, {
            description: error.details || error.operation,
            duration: 5000,
          });
        }

        // Runtime errors go to the alerts store
        if (error.category === 'runtime') {
          console.error('[EditorSandbox] Runtime error in editor:', error.message, error.stack);
          useAlertsStore.getState().addAlert({
            id: error.id,
            category: error.category,
            message: error.message,
            details: error.details,
            stack: error.stack,
            blockId: error.blockId,
            timestamp: error.timestamp,
          });
        }
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [sendStyles]);

  // Handle iframe load - also try sending styles (fallback)
  const handleIframeLoad = useCallback(() => {
    // Sandbox should send 'sandbox-ready' but also try after a delay as fallback
    setTimeout(() => {
      if (state === "loading") {
        console.log('[EditorSandbox] Fallback: sending styles after timeout');
        sendStyles();
        setState("ready");
      }
    }, 200);
  }, [sendStyles, state]);

  // Re-inject styles when theme changes (watch for class/style changes on root)
  useEffect(() => {
    if (state !== "ready") return;

    const observer = new MutationObserver(() => {
      sendStyles();
    });

    observer.observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style'] });
    return () => observer.disconnect();
  }, [state, sendStyles]);

  // Handle iframe load error
  const handleIframeError = useCallback(() => {
    setState("error");
    setError(
      "Could not connect to editor. The runtime should start the editor automatically. Check the runtime logs for errors."
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
    setEditorReady(false); // Re-poll for editor readiness
    setState("waiting");
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

  // Waiting for editor server to be ready
  if (state === "waiting") {
    return (
      <div className={cn("flex items-center justify-center h-full bg-background", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm font-medium">Waiting for editor server...</span>
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
