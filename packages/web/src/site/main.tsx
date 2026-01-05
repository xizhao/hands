/**
 * Landing Page Entry Point
 *
 * Lightweight React app for the landing page.
 * Separate bundle from the heavy editor.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { Header } from "../shared/components";
import { Home } from "./pages/Home";
import "../index.css";

function SiteApp() {
  return (
    <div className="h-screen flex flex-col bg-background">
      <Header />
      <main className="flex-1 min-h-0 overflow-auto">
        <Home />
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <SiteApp />
  </React.StrictMode>
);
