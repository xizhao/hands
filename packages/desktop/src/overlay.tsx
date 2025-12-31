/**
 * Overlay Entry Point
 *
 * Separate entry for transparent overlay windows (capture overlay, capture action panel, floating chat).
 */

import { initTheme, PlatformProvider } from "@hands/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TauriPlatformAdapter } from "./platform/TauriAdapter";
import { CaptureActionPanel } from "./windows/CaptureActionPanel";
import { CaptureOverlay } from "./windows/CaptureOverlay";
import { FloatingChat } from "./windows/FloatingChat";
import "./index.css";

// Initialize theme before render (reads from localStorage, applies CSS vars)
initTheme();

const queryClient = new QueryClient();

function getWindowType(): "capture-overlay" | "capture-action" | "floating-chat" {
  const params = new URLSearchParams(window.location.search);
  if (params.has("floating-chat")) return "floating-chat";
  if (params.has("capture-action")) return "capture-action";
  return "capture-overlay";
}

function App() {
  const windowType = getWindowType();

  if (windowType === "floating-chat") {
    return (
      <PlatformProvider adapter={TauriPlatformAdapter}>
        <TooltipProvider>
          <FloatingChat />
        </TooltipProvider>
      </PlatformProvider>
    );
  }
  if (windowType === "capture-action") {
    return <CaptureActionPanel />;
  }
  return <CaptureOverlay />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
