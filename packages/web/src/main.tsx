/**
 * Web App Entry Point (SPA)
 *
 * Minimal entry - just mounts the router.
 * Heavy editor code is lazy-loaded on /w/* routes.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
