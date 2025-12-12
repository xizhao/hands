/**
 * EditorSandbox - Hosts the editor in an iframe for crash isolation
 *
 * Communicates with the sandboxed editor via postMessage.
 * Handles:
 * - Loading states and error recovery
 * - Content synchronization with the runtime
 * - Title updates
 * - Auto-retry on crashes
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  usePageContent,
  useRuntimePort,
  useSavePageContent,
  useUpdatePageTitle,
} from "@/hooks/useWorkbook";
import { cn } from "@/lib/utils";

// ============================================================================
// Protocol Types (mirrored from @hands/editor/sandbox/protocol)
// ============================================================================

const SANDBOX_MESSAGE_SOURCE = "hands-editor-sandbox" as const;
const SANDBOX_PROTOCOL_VERSION = 1 as const;

interface SandboxMessage<T> {
  source: typeof SANDBOX_MESSAGE_SOURCE;
  version: typeof SANDBOX_PROTOCOL_VERSION;
  payload: T;
}

interface InitPayload {
  pageId: string;
  content: string;
  readOnly: boolean;
  rscPort: number | null;
  theme: "light" | "dark";
}

type ParentToEditorMessage =
  | { type: "INIT"; payload: InitPayload }
  | { type: "SET_CONTENT"; payload: { content: string; pageId: string } }
  | { type: "SET_READ_ONLY"; payload: { readOnly: boolean } }
  | { type: "SET_RSC_PORT"; payload: { port: number } }
  | { type: "SET_THEME"; payload: { theme: "light" | "dark" } }
  | { type: "FOCUS" }
  | { type: "BLUR" };

type EditorToParentMessage =
  | { type: "READY" }
  | { type: "CONTENT_CHANGED"; payload: { content: string; pageId: string } }
  | { type: "TITLE_CHANGED"; payload: { title: string; pageId: string } }
  | { type: "SAVE_REQUESTED"; payload: { content: string; pageId: string } }
  | { type: "ERROR"; payload: { error: string; fatal: boolean } }
  | { type: "HEIGHT_CHANGED"; payload: { height: number } };

// Editor sandbox port (matches vite.sandbox.config.ts)
const EDITOR_SANDBOX_PORT = 5167;

type SandboxState = "loading" | "ready" | "error";

interface EditorSandboxProps {
  pageId: string;
  className?: string;
  readOnly?: boolean;
}

export function EditorSandbox({
  pageId,
  className,
  readOnly = false,
}: EditorSandboxProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [state, setState] = useState<SandboxState>("loading");
  const [error, setError] = useState<string | null>(null);
  const [crashCount, setCrashCount] = useState(0);
  const iframeKey = useRef(0);

  // Track last content to avoid re-sending on our own updates
  const lastSentContentRef = useRef<string | null>(null);

  // Runtime port for RSC
  const runtimePort = useRuntimePort();

  // Page content from runtime
  const {
    data: pageContent,
    isLoading: isContentLoading,
    error: contentError,
  } = usePageContent(pageId);

  // Save mutations
  const { mutate: savePage, isPending: isSaving } = useSavePageContent();
  const { mutate: updateTitle } = useUpdatePageTitle();

  // Helper to post messages to iframe
  const postToSandbox = useCallback((message: ParentToEditorMessage) => {
    if (iframeRef.current?.contentWindow) {
      const wrapped: SandboxMessage<ParentToEditorMessage> = {
        source: SANDBOX_MESSAGE_SOURCE,
        version: SANDBOX_PROTOCOL_VERSION,
        payload: message,
      };
      iframeRef.current.contentWindow.postMessage(wrapped, "*");
    }
  }, []);

  // Listen for messages from iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      // Validate message source
      const data = event.data as SandboxMessage<EditorToParentMessage>;
      if (
        !data ||
        data.source !== SANDBOX_MESSAGE_SOURCE ||
        data.version !== SANDBOX_PROTOCOL_VERSION
      ) {
        return;
      }

      const message = data.payload;

      switch (message.type) {
        case "READY":
          console.log("[EditorSandbox] Iframe ready");
          setState("ready");

          // Send initial content if we have it
          if (pageContent) {
            const initPayload: InitPayload = {
              pageId,
              content: pageContent,
              readOnly,
              rscPort: runtimePort,
              theme: document.documentElement.classList.contains("dark")
                ? "dark"
                : "light",
            };
            lastSentContentRef.current = pageContent;
            postToSandbox({ type: "INIT", payload: initPayload });
          }
          break;

        case "CONTENT_CHANGED":
          // Save content to runtime
          if (message.payload.pageId === pageId) {
            lastSentContentRef.current = message.payload.content;
            savePage({ pageId, content: message.payload.content });
          }
          break;

        case "TITLE_CHANGED":
          // Update title in manifest
          if (message.payload.pageId === pageId) {
            updateTitle({ pageId, title: message.payload.title });
          }
          break;

        case "ERROR":
          console.error("[EditorSandbox] Error from iframe:", message.payload);
          if (message.payload.fatal) {
            setState("error");
            setError(message.payload.error);
            setCrashCount((c) => c + 1);
          }
          break;

        case "SAVE_REQUESTED":
          // Explicit save request (e.g., Cmd+S)
          if (message.payload.pageId === pageId) {
            lastSentContentRef.current = message.payload.content;
            savePage({ pageId, content: message.payload.content });
          }
          break;
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [pageId, pageContent, readOnly, runtimePort, postToSandbox, savePage, updateTitle]);

  // Send content updates when pageContent changes (and we're ready)
  useEffect(() => {
    if (state !== "ready" || !pageContent) return;

    // Don't re-send content we just received from the iframe
    if (pageContent === lastSentContentRef.current) return;

    lastSentContentRef.current = pageContent;
    postToSandbox({
      type: "SET_CONTENT",
      payload: { content: pageContent, pageId },
    });
  }, [state, pageContent, pageId, postToSandbox]);

  // Handle readOnly changes
  useEffect(() => {
    if (state === "ready") {
      postToSandbox({ type: "SET_READ_ONLY", payload: { readOnly } });
    }
  }, [state, readOnly, postToSandbox]);

  // Handle theme changes
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (state === "ready") {
        const theme = document.documentElement.classList.contains("dark")
          ? "dark"
          : "light";
        postToSandbox({ type: "SET_THEME", payload: { theme } });
      }
    });

    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => observer.disconnect();
  }, [state, postToSandbox]);

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
  }, [crashCount]);

  // Handle iframe load error
  const handleIframeError = useCallback(() => {
    setState("error");
    setError(
      "Could not connect to editor. Make sure the editor sandbox is running:\n\ncd packages/editor && bun run dev:sandbox"
    );
  }, []);

  // Loading state (waiting for page content)
  if (isContentLoading) {
    return (
      <div className={cn("flex items-center justify-center h-full bg-background", className)}>
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading page...</span>
        </div>
      </div>
    );
  }

  // Content fetch error
  if (contentError) {
    return (
      <div className={cn("flex items-center justify-center h-full bg-background", className)}>
        <div className="text-center text-muted-foreground">
          <p className="text-sm font-medium">Failed to load page</p>
          <p className="text-xs mt-1">{contentError.message}</p>
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
      {/* Save indicator */}
      {isSaving && (
        <div className="absolute top-2 right-2 z-10 text-xs text-muted-foreground">
          Saving...
        </div>
      )}

      {/* Loading overlay */}
      {state === "loading" && (
        <div className="absolute inset-0 z-10 flex items-center justify-center bg-background/80">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            <span className="text-sm font-medium">Starting editor...</span>
          </div>
        </div>
      )}

      {/* Editor iframe */}
      <iframe
        key={iframeKey.current}
        ref={iframeRef}
        src={`http://localhost:${EDITOR_SANDBOX_PORT}/sandbox.html`}
        className="w-full h-full border-0"
        sandbox="allow-scripts allow-same-origin"
        onError={handleIframeError}
      />
    </div>
  );
}
