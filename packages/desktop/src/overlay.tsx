/**
 * Overlay Entry Point
 *
 * Separate entry for transparent overlay windows (capture overlay, capture action panel).
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { CaptureOverlay } from "./windows/CaptureOverlay";
import { CaptureActionPanel } from "./windows/CaptureActionPanel";
import { FloatingChat } from "./windows/FloatingChat";
import "./index.css";

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
    return <FloatingChat />;
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
  </React.StrictMode>
);
