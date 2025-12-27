"use client";

import { createRoot } from "react-dom/client";
import { CollabProvider } from "./components/CollabProvider";
import { CollabWidget } from "./components/CollabWidget";

export interface PageMetadata {
  title?: string;
  description?: string;
  author?: string;
  date?: string;
  [key: string]: string | undefined;
}

/**
 * Mount the collaboration widget onto the page.
 * Call this after the page has loaded.
 */
export function mountCollab(pageId: string, pageMetadata?: PageMetadata) {
  // Create a container for the collab widget
  let container = document.getElementById("collab-root");
  if (!container) {
    container = document.createElement("div");
    container.id = "collab-root";
    // Position at document origin for absolute positioning of children
    container.style.position = "absolute";
    container.style.top = "0";
    container.style.left = "0";
    container.style.width = "100%";
    container.style.height = "0";
    container.style.overflow = "visible";
    container.style.pointerEvents = "none";
    container.style.zIndex = "50";
    document.body.appendChild(container);
  }

  const root = createRoot(container);
  root.render(
    <CollabProvider pageId={pageId} pageMetadata={pageMetadata}>
      <CollabWidget />
    </CollabProvider>
  );

  return root;
}

/**
 * Get the page ID from the current URL.
 * Expected format: /pages/:pageId
 */
export function getPageIdFromUrl(): string {
  const match = window.location.pathname.match(/\/pages\/([^/]+)/);
  return match?.[1] || "default";
}
