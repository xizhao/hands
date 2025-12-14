/**
 * SandboxFrame - Hosts editor content in an iframe for crash isolation
 *
 * Shared component used by both block and page editors.
 * The sandbox is a minimal skeleton - we inject CSS from parent.
 * Editor handles all communication with runtime directly.
 */

import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { useThumbnail } from "@/hooks/useThumbnails";
import { cn } from "@/lib/utils";

// Editor error event types (must match packages/editor/src/overlay/errors.ts)
type EditorErrorCategory = "http" | "runtime" | "mutation";

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
  pageId?: string;
}

interface EditorErrorEvent {
  type: "editor-error";
  category: EditorErrorCategory;
  error: EditorError;
}

function isEditorErrorEvent(msg: unknown): msg is EditorErrorEvent {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as EditorErrorEvent).type === "editor-error" &&
    typeof (msg as EditorErrorEvent).error === "object"
  );
}

// Navigation event from editor (e.g., clicking on data dependency chip)
interface NavigateTableEvent {
  type: "navigate-table";
  tableId: string;
}

// Thumbnail captured event from iframe
interface ThumbnailCapturedEvent {
  type: "thumbnail-captured";
  thumbnail: string; // base64 PNG
  theme: "light" | "dark";
  contentId: string;
  contentType: "page" | "block";
}

function isThumbnailCapturedEvent(msg: unknown): msg is ThumbnailCapturedEvent {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as ThumbnailCapturedEvent).type === "thumbnail-captured" &&
    typeof (msg as ThumbnailCapturedEvent).thumbnail === "string"
  );
}

/**
 * Generate LQIP (Low Quality Image Placeholder) from a full-size image
 * Creates a tiny 20x15 blurred version for instant loading placeholders
 */
async function generateLQIP(base64Image: string): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      // Create tiny canvas (20x15)
      const canvas = document.createElement("canvas");
      canvas.width = 20;
      canvas.height = 15;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(base64Image); // Fallback to original
        return;
      }

      // Draw scaled down
      ctx.drawImage(img, 0, 0, 20, 15);

      // Apply blur by re-drawing with imageSmoothingQuality
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "low";

      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => resolve(base64Image);
    img.src = base64Image;
  });
}

function isNavigateTableEvent(msg: unknown): msg is NavigateTableEvent {
  return (
    typeof msg === "object" &&
    msg !== null &&
    (msg as NavigateTableEvent).type === "navigate-table" &&
    typeof (msg as NavigateTableEvent).tableId === "string"
  );
}

type SandboxState = "loading" | "waiting" | "ready" | "error";

// CSS variables to inject into iframe
const CSS_VARS = [
  // Theme colors (from theme.ts)
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "destructive-foreground",
  "border",
  "input",
  "ring",
  // Additional vars from index.css
  "radius",
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "brand",
  "highlight",
  // Sidebar vars if they exist
  "sidebar-background",
  "sidebar-foreground",
  "sidebar-primary",
  "sidebar-primary-foreground",
  "sidebar-accent",
  "sidebar-accent-foreground",
  "sidebar-border",
  "sidebar-ring",
];

export interface SandboxFrameProps {
  /** Block ID (for block editor mode) */
  blockId?: string;
  /** Page ID (for page editor mode) */
  pageId?: string;
  /** Additional CSS classes */
  className?: string;
  /** Whether the editor is read-only */
  readOnly?: boolean;
  /**
   * Whether to require block server to be ready before loading.
   * Block editor needs this, page editor doesn't (blocks handle their own loading).
   */
  requireBlockServer?: boolean;
}

export function SandboxFrame({
  blockId,
  pageId,
  className,
  readOnly = false,
  requireBlockServer = false,
}: SandboxFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<SandboxState>("waiting");
  const [error, setError] = useState<string | null>(null);
  const [crashCount, setCrashCount] = useState(0);
  const [editorReady, setEditorReady] = useState(false);
  const iframeKey = useRef(0);
  const navigate = useNavigate();

  const mode = pageId ? "page" : "block";
  const contentId = pageId || blockId;

  // Runtime port for the editor to connect to
  const { port: runtimePort } = useRuntimeState();

  // Fetch LQIP for loading placeholder
  const { data: thumbnail } = useThumbnail(mode, contentId);

  // Actual ports from runtime status (populated by polling)
  const [editorPort, setEditorPort] = useState<number | null>(null);
  const [workerPort, setWorkerPort] = useState<number | null>(null);

  // Poll runtime to check if editor is ready and get actual ports
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
            const editorIsReady = data.services?.editor?.ready;
            const blockServerIsReady = data.services?.blockServer?.ready;

            // Check readiness based on requirements
            const isReady = requireBlockServer
              ? editorIsReady && blockServerIsReady
              : editorIsReady;

            if (isReady) {
              setEditorPort(data.services.editor.port);
              // Worker port may not be ready yet for page mode
              setWorkerPort(data.services.blockServer?.port ?? null);
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
    return () => {
      cancelled = true;
    };
  }, [runtimePort, editorReady, requireBlockServer]);

  // Build iframe URL - load directly from editor Vite for proper module resolution
  const iframeSrc = (() => {
    if (!editorPort || !editorReady || !runtimePort) return null;
    // Block mode requires worker port
    if (requireBlockServer && !workerPort) return null;

    const params = new URLSearchParams({
      runtimePort: String(runtimePort),
    });

    if (blockId) params.set("blockId", blockId);
    if (pageId) params.set("pageId", pageId);
    if (workerPort) params.set("workerPort", String(workerPort));
    if (readOnly) params.set("readOnly", "true");

    return `http://localhost:${editorPort}/sandbox.html?${params}`;
  })();

  // Generate CSS to inject into iframe
  const generateStyles = useCallback(() => {
    const root = document.documentElement;
    const isDark = root.classList.contains("dark");

    // Get computed values for all vars
    const computedStyle = getComputedStyle(root);
    const cssVars = CSS_VARS.map((v) => {
      const value = computedStyle.getPropertyValue(`--${v}`).trim();
      return value ? `--${v}:${value}` : null;
    })
      .filter(Boolean)
      .join(";");

    // Build complete CSS
    return (
      `:root{${cssVars}}` +
      (isDark ? "html{color-scheme:dark}" : "html{color-scheme:light}") +
      "html,body{background:transparent}" +
      "#root{padding-bottom:80px}" // Room for floating chatbar overlay
    );
  }, []);

  // Send styles to iframe
  const sendStyles = useCallback(() => {
    if (!iframeRef.current?.contentWindow) return;
    const css = generateStyles();
    iframeRef.current.contentWindow.postMessage({ type: "styles", css }, "*");
  }, [generateStyles]);

  // Listen for sandbox ready signal, editor errors, and navigation events
  useEffect(() => {
    const handleMessage = (e: MessageEvent) => {
      if (e.data?.type === "sandbox-ready") {
        console.log(`[SandboxFrame:${mode}] Sandbox ready, sending styles`);
        sendStyles();
        setState("ready");
      }

      // Handle navigation from editor (e.g., clicking on data dependency chip)
      if (isNavigateTableEvent(e.data)) {
        console.log(`[SandboxFrame:${mode}] Navigate to table:`, e.data.tableId);
        navigate({ to: "/tables/$tableId", params: { tableId: e.data.tableId } });
      }

      // Handle editor errors from iframe
      if (isEditorErrorEvent(e.data)) {
        const { error } = e.data;
        console.log(`[SandboxFrame:${mode}] Received error:`, error.category, error.message);

        // HTTP and mutation errors show as Sonner toasts
        if (error.category === "http" || error.category === "mutation") {
          toast.error(error.message, {
            description: error.details || error.operation,
            duration: 5000,
          });
        }

        // Runtime errors show as toasts
        if (error.category === "runtime") {
          console.error(`[SandboxFrame:${mode}] Runtime error:`, error.message, error.stack);
          toast.error(error.message, {
            description: error.details || error.stack?.split("\n")[0],
            duration: 8000,
          });
        }
      }

      // Handle thumbnail captured from iframe
      if (isThumbnailCapturedEvent(e.data)) {
        const { thumbnail, theme, contentId, contentType } = e.data;
        console.log(`[SandboxFrame:${mode}] Thumbnail captured for ${contentType}:${contentId} (${theme})`);

        // Generate LQIP and save to runtime
        generateLQIP(thumbnail).then((lqip) => {
          if (!runtimePort) return;

          fetch(`http://localhost:${runtimePort}/workbook/thumbnails`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              type: contentType,
              contentId,
              theme,
              thumbnail,
              lqip,
            }),
          })
            .then((res) => {
              if (res.ok) {
                console.log(`[SandboxFrame:${mode}] Thumbnail saved`);
              } else {
                console.error(`[SandboxFrame:${mode}] Failed to save thumbnail:`, res.status);
              }
            })
            .catch((err) => {
              console.error(`[SandboxFrame:${mode}] Error saving thumbnail:`, err);
            });
        });
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [sendStyles, navigate, mode, runtimePort]);

  // Handle iframe load - also try sending styles (fallback)
  const handleIframeLoad = useCallback(() => {
    // Sandbox should send 'sandbox-ready' but also try after a delay as fallback
    setTimeout(() => {
      if (state === "loading") {
        console.log(`[SandboxFrame:${mode}] Fallback: sending styles after timeout`);
        sendStyles();
        setState("ready");
      }
    }, 200);
  }, [sendStyles, state, mode]);

  // Re-inject styles when theme changes (watch for class/style changes on root)
  useEffect(() => {
    if (state !== "ready") return;

    const observer = new MutationObserver(() => {
      sendStyles();
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class", "style"],
    });
    return () => observer.disconnect();
  }, [state, sendStyles]);

  // Handle iframe load error
  const handleIframeError = useCallback(() => {
    setState("error");
    setError(
      "Could not connect to editor. The runtime should start the editor automatically. Check the runtime logs for errors.",
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

  // Page skeleton - mimics the MDX editor layout
  const PageSkeleton = () => (
    <div className={cn("h-full bg-background", className)}>
      <div className="pl-16 pr-6 pt-6">
        {/* Title skeleton */}
        <div className="h-10 w-64 bg-muted/50 rounded animate-pulse" />
        {/* Subtitle skeleton */}
        <div className="h-5 w-96 bg-muted/30 rounded animate-pulse mt-2" />
      </div>
      {/* Content skeleton */}
      <div className="pl-16 pr-6 pt-6 space-y-3">
        <div className="h-4 w-full max-w-2xl bg-muted/20 rounded animate-pulse" />
        <div className="h-4 w-full max-w-xl bg-muted/20 rounded animate-pulse" />
        <div className="h-4 w-full max-w-lg bg-muted/20 rounded animate-pulse" />
        <div className="h-32 w-full max-w-2xl bg-muted/15 rounded animate-pulse mt-4" />
        <div className="h-4 w-full max-w-md bg-muted/20 rounded animate-pulse mt-4" />
        <div className="h-4 w-full max-w-lg bg-muted/20 rounded animate-pulse" />
      </div>
    </div>
  );

  // Block skeleton - simpler centered layout
  const BlockSkeleton = () => (
    <div className={cn("h-full bg-background flex items-center justify-center", className)}>
      <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
    </div>
  );

  // LQIP loading state - less blur, top-left anchored at real size
  const LqipLoadingState = () => {
    if (thumbnail?.thumbnail) {
      // Use full thumbnail (not LQIP) with subtle blur, anchored top-left
      return (
        <div className={cn("relative h-full overflow-hidden bg-background", className)}>
          {/* Thumbnail at real size, anchored top-left, subtle blur */}
          <img
            src={thumbnail.thumbnail}
            alt=""
            // 800x600 captured, show at natural size from top-left
            className="absolute top-0 left-0 w-[800px] h-[600px] object-cover object-top-left blur-[2px] opacity-90"
          />
          {/* Subtle loading indicator in corner */}
          <div className="absolute top-4 right-4">
            <div className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          </div>
        </div>
      );
    }

    // Fallback: show appropriate skeleton based on mode
    return mode === "page" ? <PageSkeleton /> : <BlockSkeleton />;
  };

  // Waiting for runtime port
  if (!runtimePort) {
    return <LqipLoadingState />;
  }

  // Waiting for editor server to be ready
  if (state === "waiting") {
    return <LqipLoadingState />;
  }

  // Error state
  if (state === "error") {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center h-full bg-background gap-4",
          className,
        )}
      >
        <AlertTriangle className="h-8 w-8 text-destructive" />
        <div className="text-center">
          <p className="text-sm font-medium text-foreground">Editor Error</p>
          <p className="text-xs text-muted-foreground mt-1 whitespace-pre-line max-w-md">{error}</p>
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

  // Loading overlay component (used when iframe is loading)
  const LoadingOverlay = () => {
    if (thumbnail?.thumbnail) {
      // Use full thumbnail with subtle blur, anchored top-left
      return (
        <div className="absolute inset-0 z-10 overflow-hidden bg-background">
          <img
            src={thumbnail.thumbnail}
            alt=""
            className="absolute top-0 left-0 w-[800px] h-[600px] object-cover object-top-left blur-[2px] opacity-90"
          />
          <div className="absolute top-4 right-4">
            <div className="w-3 h-3 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          </div>
        </div>
      );
    }

    // No thumbnail - show skeleton
    if (mode === "page") {
      return (
        <div className="absolute inset-0 z-10 bg-background">
          <div className="pl-16 pr-6 pt-6">
            <div className="h-10 w-64 bg-muted/50 rounded animate-pulse" />
            <div className="h-5 w-96 bg-muted/30 rounded animate-pulse mt-2" />
          </div>
          <div className="pl-16 pr-6 pt-6 space-y-3">
            <div className="h-4 w-full max-w-2xl bg-muted/20 rounded animate-pulse" />
            <div className="h-4 w-full max-w-xl bg-muted/20 rounded animate-pulse" />
            <div className="h-4 w-full max-w-lg bg-muted/20 rounded animate-pulse" />
          </div>
        </div>
      );
    }

    // Block mode fallback
    return (
      <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
      </div>
    );
  };

  return (
    <div className={cn("relative flex flex-col h-full", className)}>
      {/* Loading overlay */}
      {state === "loading" && <LoadingOverlay />}

      {/* Editor iframe - opacity 0 until ready to prevent white flash */}
      <iframe
        key={iframeKey.current}
        ref={iframeRef}
        src={iframeSrc!}
        className={cn(
          "w-full h-full border-0 transition-opacity duration-75",
          state === "ready" ? "opacity-100" : "opacity-0",
        )}
        sandbox="allow-scripts allow-same-origin"
        onLoad={handleIframeLoad}
        onError={handleIframeError}
      />
    </div>
  );
}
