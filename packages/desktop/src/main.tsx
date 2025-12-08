import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PreviewWindow from "./preview";
import DbBrowserWindow from "./db-browser-window";
import "./index.css";

// Route based on URL path
const isPreviewWindow = window.location.pathname === "/preview" ||
  window.location.search.includes("preview=true");
const isDbBrowserWindow = window.location.pathname === "/db-browser" ||
  window.location.search.includes("db-browser=true");

function getComponent() {
  if (isPreviewWindow) return <PreviewWindow />;
  if (isDbBrowserWindow) return <DbBrowserWindow />;
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {getComponent()}
  </React.StrictMode>
);
