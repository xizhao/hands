/**
 * EditorSandbox - Hosts the editor in an iframe for crash isolation
 *
 * The sandbox is a minimal skeleton - we inject CSS from parent.
 * Editor handles all communication with runtime directly.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useRuntimePort } from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";


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

  // Editor runs on runtime port + 400 (e.g., 55000 -> 55400)
  // Load directly from editor Vite for proper module resolution
  const editorPort = runtimePort ? runtimePort + 400 : null;

  // Build iframe URL - editor served directly from its Vite dev server
  const iframeSrc = editorPort
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
      '#root{padding-left:48px}'; // Room for Plate drag handles
  }, []);

  // Send styles to iframe
  const sendStyles = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;
    const css = generateStyles();
    iframeRef.current.contentWindow.postMessage({ type: 'styles', css }, '*');
  }, [generateStyles]);

  // Listen for sandbox ready signal
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === 'sandbox-ready') {
        console.log('[EditorSandbox] Sandbox ready, sending styles');
        sendStyles();
        setState("ready");
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
