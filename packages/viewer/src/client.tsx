/**
 * Viewer Client - hydration entry point
 */

import { initClient } from "rwsdk/client";
import { mountViewerNav } from "./components/ViewerNav";

initClient();

// Mount the navigation widget after DOM is ready
if (typeof window !== "undefined") {
  const mount = () => {
    // Get nav config from embedded JSON
    const configEl = document.getElementById("__NAV_CONFIG__");
    if (!configEl) return;

    try {
      const config = JSON.parse(configEl.textContent || "{}");
      if (!config.pages?.length) return;

      // Extract workbookId from current path
      const match = window.location.pathname.match(/^\/([^/]+)/);
      const workbookId = match?.[1] || "";

      // Current path within workbook
      const currentPath = window.location.pathname.replace(`/${workbookId}`, "") || "/";

      mountViewerNav({
        pages: config.pages.map((p: { id: string; path: string; title: string }) => ({
          id: p.id,
          path: p.path.replace(`/${workbookId}`, ""), // Normalize to relative path
          title: p.title,
        })),
        workbookId,
        currentPath,
      });
    } catch (err) {
      console.warn("[ViewerNav] Failed to parse nav config:", err);
    }
  };

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    mount();
  }
}
