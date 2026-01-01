"use client";

import { createRoot, type Root } from "react-dom/client";
import { NavWidget } from "./components/NavWidget";
import type { NavConfig, NavPage } from "./types";

// Re-export types
export type { NavConfig, NavPage };

/**
 * Mount the navigation widget onto the page.
 * Call this after the page has loaded.
 */
export function mountNav(config: NavConfig): Root {
  // Create a container for the nav widget
  let container = document.getElementById("nav-root");
  if (!container) {
    container = document.createElement("div");
    container.id = "nav-root";
    // Fixed positioning container
    container.style.position = "fixed";
    container.style.top = "0";
    container.style.left = "0";
    container.style.bottom = "0";
    container.style.width = "0";
    container.style.overflow = "visible";
    container.style.pointerEvents = "none";
    container.style.zIndex = "50";
    document.body.appendChild(container);
  }

  const root = createRoot(container);
  root.render(<NavWidget config={config} />);

  return root;
}

/**
 * Get navigation config from embedded JSON script tag.
 * Document injects <script id="__NAV_CONFIG__" type="application/json">
 */
export function getNavConfig(): NavConfig | null {
  if (typeof document === "undefined") return null;

  const scriptEl = document.getElementById("__NAV_CONFIG__");
  if (!scriptEl) return null;

  try {
    const data = JSON.parse(scriptEl.textContent || "");
    return {
      pages: data.pages || [],
      currentRoute: getCurrentRoute(),
      workbookTitle: data.workbookTitle,
    };
  } catch {
    console.warn("[Nav] Failed to parse nav config JSON");
    return null;
  }
}

/**
 * Get the current route from URL.
 */
export function getCurrentRoute(): string {
  if (typeof window === "undefined") return "/";
  return window.location.pathname;
}

/**
 * Build nav config from page list and current URL.
 */
export function buildNavConfig(pages: NavPage[], workbookTitle?: string): NavConfig {
  return {
    pages,
    currentRoute: getCurrentRoute(),
    workbookTitle,
  };
}
