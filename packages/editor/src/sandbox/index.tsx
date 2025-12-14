/**
 * Sandbox Entry Point - Block & Page Editor
 *
 * Supports two modes:
 * 1. Block mode (blockId param): RSC-first editor for TSX blocks
 * 2. Page mode (pageId param): MDX visual editor for pages
 */

// MUST BE FIRST: Initialize shared React for RSC client components
import "../rsc/shared-react";

import html2canvas from "html2canvas";
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

    if (e.data.css.includes("color-scheme:dark")) {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }
});

// Tell parent we're ready
window.parent.postMessage({ type: "sandbox-ready" }, "*");

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
    const canvas = await html2canvas(root, {
      width: 800,
      height: 600,
      windowWidth: 800,
      windowHeight: 600,
      scale: 1,
      useCORS: true,
      backgroundColor: null,
      logging: false,
    });

    const thumbnail = canvas.toDataURL("image/png");
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

  return (
    <div className="flex items-center justify-center h-screen text-muted-foreground">
      <div className="flex items-center gap-2">
        <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        <span className="text-sm">Loading...</span>
      </div>
    </div>
  );
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

  // Block mode: Wait for both RSC and source
  if (!rscReady || source === null) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Block mode: Use Overlay Editor
  return (
    <RscProvider port={workerPortNum!} enabled>
      <OverlayEditor
        blockId={blockId!}
        initialSource={source}
        runtimePort={runtimePortNum!}
        workerPort={workerPortNum!}
        readOnly={readOnly}
      />
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
