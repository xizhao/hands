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
import "./index.css";

// Route based on URL path
const isPreviewWindow =
  window.location.pathname === "/preview" || window.location.search.includes("preview=true");

function getComponent() {
  if (isPreviewWindow) return <PreviewWindow />;
  return (
    <PlatformProvider adapter={TauriPlatformAdapter}>
      <App />
    </PlatformProvider>
  );
}

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed to exist in index.html
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{getComponent()}</React.StrictMode>,
);
