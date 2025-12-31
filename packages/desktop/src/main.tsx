/**
 * Desktop Entry Point
 *
 * Initializes the Tauri desktop app with the shared App component
 * wrapped in the Tauri platform adapter.
 */

import { App, PlatformProvider } from "@hands/app";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";
import ReactDOM from "react-dom/client";
import { TooltipProvider } from "@/components/ui/tooltip";
import { TauriPlatformAdapter } from "./platform/TauriAdapter";
import PreviewWindow from "./preview";
import { CaptureActionPanel } from "./windows/CaptureActionPanel";
import { CaptureOverlay } from "./windows/CaptureOverlay";
import { FloatingChat } from "./windows/FloatingChat";
import "./index.css";
import startupSfx from "./assets/sfx/hands-startup.mp3";

// Play startup sound for main window
const windowType = new URLSearchParams(window.location.search);
if (
  !windowType.has("floating-chat") &&
  !windowType.has("capture-overlay") &&
  !windowType.has("capture-action") &&
  !windowType.has("preview") &&
  !windowType.has("workbook")
) {
  new Audio(startupSfx).play().catch(() => {});
}

// QueryClient for FloatingChat (App has its own)
const floatingChatQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5000,
      retry: 1,
    },
  },
});

// Determine window type from URL params
function getWindowType():
  | "main"
  | "preview"
  | "capture-overlay"
  | "capture-action"
  | "floating-chat"
  | "workbook" {
  const params = new URLSearchParams(window.location.search);

  if (params.has("floating-chat")) return "floating-chat";
  if (params.has("capture-overlay")) return "capture-overlay";
  if (params.has("capture-action")) return "capture-action";
  if (params.has("preview") || window.location.pathname === "/preview") return "preview";
  if (params.has("workbook")) return "workbook";

  return "main";
}

function getComponent() {
  const windowType = getWindowType();

  switch (windowType) {
    case "preview":
      return <PreviewWindow />;
    case "capture-overlay":
      return <CaptureOverlay />;
    case "capture-action":
      return <CaptureActionPanel />;
    case "floating-chat":
      // FloatingChat needs all providers for ChatSettings and shared hooks
      return (
        <QueryClientProvider client={floatingChatQueryClient}>
          <PlatformProvider adapter={TauriPlatformAdapter}>
            <TooltipProvider>
              <FloatingChat />
            </TooltipProvider>
          </PlatformProvider>
        </QueryClientProvider>
      );
    default:
      // Main app and workbook windows use PlatformProvider
      return (
        <PlatformProvider adapter={TauriPlatformAdapter}>
          <App />
        </PlatformProvider>
      );
  }
}

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed to exist in index.html
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{getComponent()}</React.StrictMode>,
);
