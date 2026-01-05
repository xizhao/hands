/**
 * Web App Entry Point
 *
 * Fully local browser version with BYOK.
 * Uses in-browser SQLite (OPFS) and direct LLM calls.
 */

import { App, PlatformProvider } from "@hands/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React, { useEffect, useState, useMemo } from "react";
import ReactDOM from "react-dom/client";
import { LocalDatabaseProvider } from "./db/LocalDatabaseProvider";
import { LocalTRPCProvider } from "./trpc/LocalTRPCProvider";
import { createLocalPlatformAdapter } from "./platform/LocalAdapter";
import "./index.css";

// ============================================================================
// Query Client
// ============================================================================

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60,
      retry: 1,
    },
  },
});

// ============================================================================
// Helpers
// ============================================================================

/** Hide the HTML initial loader */
function hideInitialLoader() {
  const loader = document.getElementById("initial-loader");
  if (loader) {
    loader.classList.add("hidden");
    setTimeout(() => loader.remove(), 200);
  }
}

/** Get workbook ID from URL path: /w/:id */
function getWorkbookIdFromUrl(): string | null {
  const path = window.location.pathname;
  const match = path.match(/^\/w\/([^/]+)/);
  return match ? match[1] : null;
}

// ============================================================================
// Editor App
// ============================================================================

function EditorApp() {
  const urlWorkbookId = getWorkbookIdFromUrl();
  const adapter = useMemo(() => createLocalPlatformAdapter(), []);
  const [workbookId, setWorkbookId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function init() {
      // If URL has workbook ID, use that
      if (urlWorkbookId) {
        const workbooks = await adapter.workbook.list();
        const found = workbooks.find((w) => w.id === urlWorkbookId);
        if (found) {
          setWorkbookId(urlWorkbookId);
          setIsReady(true);
          hideInitialLoader();
          return;
        }
      }

      // Otherwise, use first existing or create new
      const workbooks = await adapter.workbook.list();
      console.log("[Main] Existing workbooks:", workbooks.map((w) => ({ id: w.id, name: w.name })));

      if (workbooks.length > 0) {
        console.log("[Main] Using existing workbook:", workbooks[0].id);
        setWorkbookId(workbooks[0].id);
      } else {
        const wb = await adapter.workbook.create("My Workbook");
        console.log("[Main] Created new workbook:", wb.id);
        setWorkbookId(wb.id);
      }

      setIsReady(true);
      hideInitialLoader();
    }

    init();
  }, [adapter, urlWorkbookId]);

  if (!isReady) {
    return null;
  }

  return (
    <PlatformProvider adapter={adapter}>
      <LocalDatabaseProvider initialWorkbookId={workbookId ?? undefined}>
        <LocalTRPCProvider queryClient={queryClient}>
          <App />
        </LocalTRPCProvider>
      </LocalDatabaseProvider>
    </PlatformProvider>
  );
}

// ============================================================================
// Root
// ============================================================================

function Root() {
  return (
    <QueryClientProvider client={queryClient}>
      <EditorApp />
    </QueryClientProvider>
  );
}

// ============================================================================
// Render
// ============================================================================

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
