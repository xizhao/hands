/**
 * Sandbox Entry Point - Block & Page Editor
 *
 * Supports two modes:
 * 1. Block mode (blockId param): RSC-first editor for TSX blocks
 * 2. Page mode (pageId param): MDX visual editor for pages
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

import "./styles.css";

const params = new URLSearchParams(window.location.search);
const blockId = params.get("blockId");
const pageId = params.get("pageId");
// runtimePort is the main API port (55100) for /workbook/* endpoints
const runtimePort = params.get("runtimePort");
const runtimePortNum = runtimePort ? parseInt(runtimePort, 10) : null;
// workerPort is the Vite worker port (55200+) for RSC /blocks/* endpoints
const workerPort = params.get("workerPort");
const workerPortNum = workerPort ? parseInt(workerPort, 10) : runtimePortNum;
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

    const theme = document.documentElement.classList.contains("dark") ? "dark" : "light";
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
      "*",
    );

    console.log(`[Sandbox] Thumbnail captured for ${contentType}:${contentId} (${theme})`);
  } catch (err) {
    console.error("[Sandbox] Failed to capture thumbnail:", err);
  }
}

/**
 * Page Editor Component - Uses usePageSource for polling/saving
 */
function PageEditor({
  pageId,
  runtimePort,
  workerPort,
  readOnly,
  rscReady,
}: {
  pageId: string;
  runtimePort: number;
  workerPort: number;
  readOnly: boolean;
  rscReady: boolean;
}) {
  const thumbnailCapturedRef = useRef(false);

  const {
    source,
    isRefreshing,
    currentPageId,
    saveSource,
    renamePage,
  } = usePageSource({
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
      <RscProvider port={workerPort} enabled>
        <MdxVisualEditor
          source={source}
          onSourceChange={saveSource}
          pageId={currentPageId}
          onRename={renamePage}
          runtimePort={runtimePort}
          workerPort={workerPort}
          className="h-screen"
          isRefreshing={isRefreshing || !rscReady}
        />
      </RscProvider>
    );
  }

  // Show blank until content is ready
  return null;
}

function SandboxApp() {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rscReady, setRscReady] = useState(false);
  const thumbnailCapturedRef = useRef(false);

  // Initialize RSC Flight client
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
    trpc.workbook.blocks.getSource.query({ blockId })
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
    return <div className="flex items-center justify-center h-screen text-red-500">{error}</div>;
  }

  // Page mode: Use dedicated component with usePageSource hook
  if (editorMode === "page" && pageId && runtimePortNum) {
    return (
      <PageEditor
        pageId={pageId}
        runtimePort={runtimePortNum}
        workerPort={workerPortNum!}
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
    <RscProvider port={workerPortNum!} enabled>
      <div className="relative min-h-screen w-full bg-background flex items-center justify-center p-8 overflow-auto">
        <div className="absolute inset-0 bg-black/[0.03] dark:bg-black/[0.15] pointer-events-none" />
        <div className="relative bg-background rounded-xl shadow-md">
          <OverlayEditor
            blockId={blockId!}
            initialSource={source}
            runtimePort={runtimePortNum!}
            workerPort={workerPortNum!}
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
  </StrictMode>,
);
