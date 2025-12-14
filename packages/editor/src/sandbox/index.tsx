/**
 * Sandbox Entry Point - Block & Page Editor
 *
 * Supports two modes:
 * 1. Block mode (blockId param): RSC-first editor for TSX blocks
 * 2. Page mode (pageId param): MDX visual editor for pages
 */

// MUST BE FIRST: Initialize shared React for RSC client components
import "../rsc/shared-react";

import { StrictMode, useCallback, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
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

function SandboxApp() {
  const [source, setSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rscReady, setRscReady] = useState(false);

  // Initialize RSC Flight client
  useEffect(() => {
    initFlightClient().then((success) => {
      console.log("[Sandbox] RSC initialized:", success);
      setRscReady(success);
    });
  }, []);

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
        .then((data) => setSource(data.source))
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

  // Save source changes (for pages)
  const handlePageSave = useCallback((newSource: string) => {
    if (readOnly || !pageId || !runtimePortNum) return;

    fetch(`http://localhost:${runtimePortNum}/workbook/pages/${pageId}/source`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ source: newSource }),
    }).catch(console.error);
  }, []);

  if (error) {
    return <div className="flex items-center justify-center h-screen text-red-500">{error}</div>;
  }

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

  // Page mode: Use MDX Visual Editor
  if (editorMode === "page") {
    return (
      <RscProvider port={workerPortNum!} enabled>
        <MdxVisualEditor
          source={source}
          onSourceChange={handlePageSave}
          runtimePort={runtimePortNum!}
          workerPort={workerPortNum!}
          className="h-screen"
        />
      </RscProvider>
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
    <SandboxApp />
  </StrictMode>,
);
