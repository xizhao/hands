/**
 * Desktop Entry Point
 *
 * Initializes the Tauri desktop app with the shared App component
 * wrapped in the Tauri platform adapter.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { App, PlatformProvider } from "@hands/app";
import { TauriPlatformAdapter } from "./platform/TauriAdapter";
import PreviewWindow from "./preview";
import { CaptureOverlay } from "./windows/CaptureOverlay";
import { ChatWidget } from "./windows/ChatWidget";
import "./index.css";

// Determine window type from URL params
function getWindowType(): "main" | "preview" | "capture-overlay" | "chat-widget" | "workbook" {
  const params = new URLSearchParams(window.location.search);

  if (params.has("capture-overlay")) return "capture-overlay";
  if (params.has("chat-widget")) return "chat-widget";
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
    case "chat-widget":
      return <ChatWidget />;
    case "workbook":
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
