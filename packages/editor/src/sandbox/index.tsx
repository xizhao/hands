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
import { getCachedPageSource, setCachedPageSource } from "../mdx/cache";
import { MdxVisualEditor } from "../mdx/MdxVisualEditor";
import { OverlayEditor } from "../overlay";
import { installGlobalErrorHandler } from "../overlay/errors";
import { initFlightClient, RscProvider, setRuntimePort } from "../rsc";

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

function SandboxApp() {
  // For pages, initialize with cached source for instant display
  const cachedSource = editorMode === "page" && pageId ? getCachedPageSource(pageId) : null;
  const [source, setSource] = useState<string | null>(cachedSource);
  const [error, setError] = useState<string | null>(null);
  const [rscReady, setRscReady] = useState(false);
  // Track if we're refreshing (have cached content, fetching fresh)
  const [isRefreshing, setIsRefreshing] = useState(cachedSource !== null);
  // Track if thumbnail has been captured for this session
  const thumbnailCapturedRef = useRef(false);

  // Initialize RSC Flight client
  useEffect(() => {
    initFlightClient().then((success) => {
      console.log("[Sandbox] RSC initialized:", success);
      setRscReady(success);
    });
  }, []);

  // Capture thumbnail after content settles (3 seconds after RSC ready + source loaded)
  useEffect(() => {
    // Don't capture if not ready, no source, or already captured
    if (!rscReady || source === null || thumbnailCapturedRef.current) return;
    // Don't capture while still refreshing
    if (isRefreshing) return;

    const timer = setTimeout(() => {
      if (!thumbnailCapturedRef.current) {
        thumbnailCapturedRef.current = true;
        captureThumbnail();
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, [rscReady, source, isRefreshing]);

  // Fetch source (block or page)
  useEffect(() => {
    if (!runtimePortNum) {
      setError("Missing runtimePort");
      return;
    }

    if (editorMode === "block" && blockId) {
      fetch(`http://localhost:${runtimePortNum}/workbook/blocks/${blockId}/source`)
        .then((res) => (res.ok ? res.json() : Promise.reject("Failed to load block")))
        .then((data) => setSource(data.source))
        .catch((err) => setError(String(err)));
    } else if (editorMode === "page" && pageId) {
      fetch(`http://localhost:${runtimePortNum}/workbook/pages/${pageId}/source`)
        .then((res) => (res.ok ? res.json() : Promise.reject("Failed to load page")))
        .then((data) => {
          setSource(data.source);
          // Update cache with fresh source
          setCachedPageSource(pageId, data.source);
          // Done refreshing
          setIsRefreshing(false);
        })
        .catch((err) => setError(String(err)));
    } else {
      setError("Missing blockId or pageId");
    }
  }, []);

  // Save source changes (for blocks)
  const handleBlockSave = useCallback((newSource: string) => {
    if (readOnly || !blockId || !runtimePortNum) return;

    fetch(`http://localhost:${runtimePortNum}/workbook/blocks/${blockId}/source`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: newSource }),
    }).catch(console.error);
  }, []);

  // Track current page ID (may change after rename)
  const [currentPageId, setCurrentPageId] = useState(pageId);

  // Save source changes (for pages)
  const handlePageSave = useCallback((newSource: string) => {
    if (readOnly || !currentPageId || !runtimePortNum) return;

    // Update cache immediately on save
    setCachedPageSource(currentPageId, newSource);

    fetch(`http://localhost:${runtimePortNum}/workbook/pages/${currentPageId}/source`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: newSource }),
    }).catch(console.error);
  }, [currentPageId]);

  // Handle page rename (title → slug sync)
  const handlePageRename = useCallback(async (newSlug: string): Promise<boolean> => {
    if (readOnly || !currentPageId || !runtimePortNum) return false;

    try {
      const res = await fetch(`http://localhost:${runtimePortNum}/workbook/pages/${currentPageId}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newSlug }),
      });

      if (!res.ok) {
        const error = await res.json();
        console.error("[Sandbox] Rename failed:", error);
        return false;
      }

      const result = await res.json();
      console.log("[Sandbox] Page renamed:", result);

      // Update local state
      setCurrentPageId(newSlug);

      // Update URL to new page ID without reloading
      const newParams = new URLSearchParams(window.location.search);
      newParams.set("pageId", newSlug);
      window.history.replaceState({}, "", `?${newParams.toString()}`);

      // Notify parent that page was renamed
      window.parent.postMessage({ type: "page-renamed", oldId: currentPageId, newId: newSlug }, "*");

      return true;
    } catch (err) {
      console.error("[Sandbox] Rename error:", err);
      return false;
    }
  }, [currentPageId]);

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-500">{error}</div>;
  }

  // Page mode: Show cached content immediately with refresh indicator
  // Only block on rscReady, not on source (we may have cached source)
  if (editorMode === "page") {
    // If we have cached source, show it immediately (even if RSC not ready yet)
    // Once RSC is ready, the editor will work fully
    if (source !== null) {
      return (
        <RscProvider port={workerPortNum!} enabled>
          <MdxVisualEditor
            source={source}
            onSourceChange={handlePageSave}
            pageId={currentPageId ?? undefined}
            onRename={handlePageRename}
            runtimePort={runtimePortNum!}
            workerPort={workerPortNum!}
            className="h-screen"
            isRefreshing={isRefreshing || !rscReady}
          />
        </RscProvider>
      );
    }
    // No cached source, show loading
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Block mode: Wait for both RSC and source (blocks have their own caching)
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
