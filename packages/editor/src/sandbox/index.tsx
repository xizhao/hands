/**
 * Sandbox Entry Point - Block & Page Editor
 *
 * Supports multiple modes:
 * 1. Block mode (blockId param): RSC-first editor for TSX blocks
 * 2. Page mode (pageId param): MDX visual editor for pages
 * 3. Standalone mode (STANDALONE_MODE env): Uses local file API, no runtime
 */

// MUST BE FIRST: Initialize shared React for RSC client components
import "../rsc/shared-react";

import { domToPng } from "modern-screenshot";
import { StrictMode, useCallback, useEffect, useRef, useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import { createRoot } from "react-dom/client";
import { MdxVisualEditor } from "../mdx/MdxVisualEditor";
import { usePageSource } from "../mdx/usePageSource";
import { OverlayEditor } from "../overlay";
import { installGlobalErrorHandler } from "../overlay/errors";
import { initFlightClient, RscProvider, setRuntimePort } from "../rsc";
import { getTRPCClient } from "../trpc";
import { getSource, saveSource as saveSourceApi } from "./standalone-api";

import "./styles.css";

// Standalone mode detection (set by vite config when WORKBOOK_PATH is present)
const isStandalone = import.meta.env.STANDALONE_MODE === true;
const harnessUrl = (import.meta.env.HARNESS_URL as string) || "http://localhost:5173";

const params = new URLSearchParams(window.location.search);
const blockId = params.get("blockId");
const pageId = params.get("pageId");
// runtimePort is the main API port - all requests (tRPC, blocks, RSC) go through runtime
const runtimePort = params.get("runtimePort");
const runtimePortNum = runtimePort ? parseInt(runtimePort, 10) : null;
const readOnly = params.get("readOnly") === "true";

// Determine editor mode
const editorMode = pageId ? "page" : blockId ? "block" : null;

// Listen for styles from parent
window.addEventListener("message", (e) => {
  if (e.data?.type === "styles") {
    let style = document.getElementById("parent-styles") as HTMLStyleElement;
    if (!style) {
      style = document.createElement("style");
      style.id = "parent-styles";
      document.head.appendChild(style);
    }
    style.textContent = e.data.css;

    // Toggle dark class based on parent's theme
    if (e.data.isDark) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }
});

// Note: We send "sandbox-ready" only after content is loaded, not here at script init.
// This is done in the components after RSC/source is ready.

// Set runtime port for RSC client module loading (vite-proxy is on main runtime port)
if (runtimePortNum) {
  setRuntimePort(runtimePortNum);
}

// Install global error handler to stream runtime errors to parent
installGlobalErrorHandler(blockId ?? pageId ?? undefined);

// Capture thumbnail and send to parent
async function captureThumbnail() {
  const root = document.getElementById("root");
  if (!root) return;

  try {
    const thumbnail = await domToPng(root, {
      width: 800,
      height: 600,
      scale: 1,
      backgroundColor: null,
    });

    const theme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    const contentId = pageId || blockId;
    const contentType = pageId ? "page" : "block";

    window.parent.postMessage(
      {
        type: "thumbnail-captured",
        thumbnail,
        theme,
        contentId,
        contentType,
      },
      "*"
    );

    console.log(
      `[Sandbox] Thumbnail captured for ${contentType}:${contentId} (${theme})`
    );
  } catch (err) {
    console.error("[Sandbox] Failed to capture thumbnail:", err);
  }
}

/**
 * Minimal Edit/Preview Toggle - top right corner
 */
function ModeToggle({
  mode,
  onToggle,
}: {
  mode: "edit" | "preview";
  onToggle: () => void;
}) {
  return (
    <button
      onClick={onToggle}
      className="fixed top-3 right-3 z-50 px-3 py-1.5 text-xs font-medium rounded-md bg-black/5 hover:bg-black/10 dark:bg-white/10 dark:hover:bg-white/15 transition-colors"
      title={mode === "edit" ? "Switch to Preview" : "Switch to Edit"}
    >
      {mode === "edit" ? "Preview" : "Edit"}
    </button>
  );
}

/**
 * Preview iframe - shows harness-rendered content
 */
function PreviewPane({ type, id }: { type: "block" | "page"; id: string }) {
  const previewUrl =
    type === "page"
      ? `${harnessUrl}/pages/${id}`
      : `${harnessUrl}/blocks/${id}`;

  return (
    <iframe
      src={previewUrl}
      className="w-full h-full border-0"
      title="Preview"
    />
  );
}

/**
 * Page Editor Component - Uses usePageSource for polling/saving
 */
function PageEditor({
  pageId,
  runtimePort,
  readOnly,
  rscReady,
}: {
  pageId: string;
  runtimePort: number;
  readOnly: boolean;
  rscReady: boolean;
}) {
  const thumbnailCapturedRef = useRef(false);

  const { source, isRefreshing, currentPageId, saveSource, renamePage } =
    usePageSource({
      pageId,
      runtimePort,
      readOnly,
      pollInterval: 1000,
    });

  // Capture thumbnail after content settles
  useEffect(() => {
    if (!rscReady || source === null || thumbnailCapturedRef.current) return;
    if (isRefreshing) return;

    const timer = setTimeout(() => {
      if (!thumbnailCapturedRef.current) {
        thumbnailCapturedRef.current = true;
        captureThumbnail();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [rscReady, source, isRefreshing]);

  // Signal ready to parent when content is loaded
  useEffect(() => {
    if (source !== null && rscReady) {
      window.parent.postMessage({ type: "sandbox-ready" }, "*");
    }
  }, [source, rscReady]);

  if (source !== null) {
    return (
      <RscProvider port={runtimePort} enabled>
        <MdxVisualEditor
          source={source}
          onSourceChange={saveSource}
          pageId={currentPageId}
          onRename={renamePage}
          runtimePort={runtimePort}
          className="h-screen"
          isRefreshing={isRefreshing || !rscReady}
        />
      </RscProvider>
    );
  }

  // Show blank until content is ready
  return null;
}

/**
 * Standalone Page Editor - Uses local file API instead of tRPC
 */
function StandalonePageEditor({ pageId }: { pageId: string }) {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load initial source
  useEffect(() => {
    getSource("page", pageId)
      .then((result) => setSource(result.source))
      .catch((err) => setError(String(err)));
  }, [pageId]);

  // Debounced save
  const handleSourceChange = useCallback(
    (newSource: string) => {
      setSource(newSource);
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
      saveTimeoutRef.current = setTimeout(() => {
        saveSourceApi("page", pageId, newSource).catch(console.error);
      }, 500);
    },
    [pageId]
  );

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        {error}
      </div>
    );
  }

  if (source === null) {
    return null;
  }

  return (
    <div className="h-screen w-full">
      <ModeToggle mode={mode} onToggle={() => setMode(mode === "edit" ? "preview" : "edit")} />
      {mode === "edit" ? (
        <MdxVisualEditor
          source={source}
          onSourceChange={handleSourceChange}
          pageId={pageId}
          className="h-screen"
        />
      ) : (
        <PreviewPane type="page" id={pageId} />
      )}
    </div>
  );
}

/**
 * Standalone Block Editor - Preview only for now
 * (Full block editing requires RSC runtime)
 */
function StandaloneBlockEditor({ blockId }: { blockId: string }) {
  const [mode, setMode] = useState<"edit" | "preview">("preview");

  return (
    <div className="h-screen w-full">
      <ModeToggle mode={mode} onToggle={() => setMode(mode === "edit" ? "preview" : "edit")} />
      {mode === "edit" ? (
        <div className="flex items-center justify-center h-screen text-muted-foreground">
          <div className="text-center">
            <p className="mb-2">Block editing requires RSC runtime</p>
            <p className="text-sm">Use preview mode or run with full runtime</p>
          </div>
        </div>
      ) : (
        <PreviewPane type="block" id={blockId} />
      )}
    </div>
  );
}

function SandboxApp() {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rscReady, setRscReady] = useState(false);
  const thumbnailCapturedRef = useRef(false);

  // Standalone mode: Use local file API, no RSC/runtime
  if (isStandalone) {
    if (editorMode === "page" && pageId) {
      return <StandalonePageEditor pageId={pageId} />;
    }
    if (editorMode === "block" && blockId) {
      return <StandaloneBlockEditor blockId={blockId} />;
    }
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        <div className="text-center">
          <p className="mb-2">Standalone mode</p>
          <p className="text-sm">
            Add <code>?pageId=name</code> or <code>?blockId=name</code> to URL
          </p>
        </div>
      </div>
    );
  }

  // Runtime mode: Initialize RSC Flight client
  useEffect(() => {
    initFlightClient().then((success) => {
      console.log("[Sandbox] RSC initialized:", success);
      setRscReady(success);
    });
  }, []);

  // Fetch source for blocks only (pages use usePageSource)
  useEffect(() => {
    if (editorMode !== "block" || !blockId || !runtimePortNum) {
      if (editorMode === "block" && !blockId) {
        setError("Missing blockId");
      }
      return;
    }

    const trpc = getTRPCClient(runtimePortNum);
    trpc.workbook.blocks.getSource
      .query({ blockId })
      .then((data) => setSource(data.source))
      .catch((err) => setError(String(err)));
  }, []);

  // Capture thumbnail for blocks
  useEffect(() => {
    if (editorMode !== "block") return;
    if (!rscReady || source === null || thumbnailCapturedRef.current) return;

    const timer = setTimeout(() => {
      if (!thumbnailCapturedRef.current) {
        thumbnailCapturedRef.current = true;
        captureThumbnail();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [rscReady, source]);

  // Signal ready to parent when block content is loaded
  useEffect(() => {
    if (editorMode === "block" && rscReady && source !== null) {
      window.parent.postMessage({ type: "sandbox-ready" }, "*");
    }
  }, [rscReady, source]);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        {error}
      </div>
    );
  }

  // Page mode: Use dedicated component with usePageSource hook
  if (editorMode === "page" && pageId && runtimePortNum) {
    return (
      <PageEditor
        pageId={pageId}
        runtimePort={runtimePortNum}
        readOnly={readOnly}
        rscReady={rscReady}
      />
    );
  }

  // Block mode: Show blank until both RSC and source are ready
  if (!rscReady || source === null) {
    return null;
  }

  // Block mode: Use Overlay Editor in canvas view
  // Slightly dimmed background, block container is centered and sized to content
  return (
    <RscProvider port={runtimePortNum!} enabled>
      <div className="relative min-h-screen w-full bg-background flex items-center justify-center p-8 overflow-auto">
        <div className="absolute inset-0 bg-black/[0.03] dark:bg-black/[0.15] pointer-events-none" />
        <div className="relative bg-background rounded-xl shadow-md mb-20">
          <OverlayEditor
            blockId={blockId!}
            initialSource={source}
            runtimePort={runtimePortNum!}
            readOnly={readOnly}
          />
        </div>
      </div>
    </RscProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <DndProvider backend={HTML5Backend}>
      <SandboxApp />
    </DndProvider>
  </StrictMode>
);
