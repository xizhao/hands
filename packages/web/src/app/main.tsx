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
import { Header } from "../shared/components";
import { getWorkbookIdFromUrl } from "../shared/lib/storage";
import { LocalDatabaseProvider } from "../db/LocalDatabaseProvider";
import { LocalTRPCProvider } from "../trpc/LocalTRPCProvider";
import { AgentProvider } from "../agent/AgentProvider";
import { createLocalPlatformAdapter } from "../platform/LocalAdapter";
import "../index.css";

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
// Editor App
// ============================================================================

function EditorApp() {
  const urlWorkbookId = getWorkbookIdFromUrl();
  const adapter = useMemo(() => createLocalPlatformAdapter(), []);
  const [workbookId, setWorkbookId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    async function init() {
      // If URL has workbook ID, validate it exists
      if (urlWorkbookId) {
        const workbooks = await adapter.workbook.list();
        const found = workbooks.find((w) => w.id === urlWorkbookId);
        if (found) {
          setWorkbookId(urlWorkbookId);
          setIsReady(true);
          return;
        } else {
          // Workbook not found, redirect to landing
          console.warn("[Main] Workbook not found:", urlWorkbookId);
          window.location.href = "/";
          return;
        }
      }

      // No workbook ID in URL - redirect to landing
      console.log("[Main] No workbook ID in URL, redirecting to landing");
      window.location.href = "/";
    }

    init();
  }, [adapter, urlWorkbookId]);

  // Show header with loading state while initializing
  if (!isReady) {
    return (
      <div className="h-screen flex flex-col bg-background">
        <Header />
        <div className="flex-1 flex items-center justify-center">
          <div className="w-5 h-5 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <PlatformProvider adapter={adapter}>
      <LocalDatabaseProvider initialWorkbookId={workbookId ?? undefined}>
        <LocalTRPCProvider queryClient={queryClient}>
          <AgentProvider>
            <div className="h-screen flex flex-col">
              <Header />
              <div className="flex-1 min-h-0">
                <App />
              </div>
            </div>
          </AgentProvider>
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
