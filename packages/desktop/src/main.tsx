import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import PreviewWindow from "./preview";
import "./index.css";

// Route based on URL path - preview windows use /preview route
const isPreviewWindow = window.location.pathname === "/preview" ||
  window.location.search.includes("preview=true");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isPreviewWindow ? <PreviewWindow /> : <App />}
  </React.StrictMode>
);
