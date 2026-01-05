/**
 * Landing Page Entry Point
 *
 * Lightweight React app for the landing page.
 * Separate bundle from the heavy editor.
 */

import React from "react";
import ReactDOM from "react-dom/client";
import { Landing } from "./Landing";
import "../index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Landing />
  </React.StrictMode>
);
