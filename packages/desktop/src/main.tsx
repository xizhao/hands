import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import PreviewWindow from "./preview";

// Route based on URL path
const isPreviewWindow =
  window.location.pathname === "/preview" || window.location.search.includes("preview=true");

function getComponent() {
  if (isPreviewWindow) return <PreviewWindow />;
  return <App />;
}

// biome-ignore lint/style/noNonNullAssertion: root element is guaranteed to exist in index.html
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>{getComponent()}</React.StrictMode>,
);
