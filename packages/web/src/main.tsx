/**
 * Web App Entry Point
 *
 * Bootstraps the web version of Hands using the Cloud platform adapter.
 */

import { App, PlatformProvider } from "@hands/app";
import React from "react";
import ReactDOM from "react-dom/client";
import { createCloudPlatformAdapter } from "./platform/CloudAdapter";
import "./index.css";

// API URL from environment or default
const API_URL = import.meta.env.VITE_API_URL || "https://api.hands.app";

// Create the cloud platform adapter
const adapter = createCloudPlatformAdapter({
  apiUrl: API_URL,
});

// Render the app
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <PlatformProvider adapter={adapter}>
      <App />
    </PlatformProvider>
  </React.StrictMode>,
);
