import { initClient } from "rwsdk/client";
import { buildNavConfig, getNavConfig, mountNav } from "./nav/NavRoot";
import type { NavPage } from "./nav/types";

initClient();

// Mount the navigation widget after DOM is ready
if (typeof window !== "undefined") {
  const mount = () => {
    console.log("[Nav] Mounting nav widget...");

    // Try to get config from window global (injected at build time)
    let config = getNavConfig();
    console.log("[Nav] Config from window:", config);

    if (!config) {
      // Fallback: extract from data attributes
      const pageEl = document.querySelector("[data-workbook-pages]");
      const pagesJson = pageEl?.getAttribute("data-workbook-pages");
      const workbookTitle = pageEl?.getAttribute("data-workbook-title") || undefined;

      let pages: NavPage[] = [];
      if (pagesJson) {
        try {
          pages = JSON.parse(pagesJson);
        } catch {
          console.warn("[Nav] Failed to parse pages JSON");
        }
      }

      config = buildNavConfig(pages, workbookTitle);
      console.log("[Nav] Config from fallback:", config);
    }

    // Only mount if we have pages
    if (config.pages.length > 0) {
      console.log("[Nav] Mounting with", config.pages.length, "pages");
      mountNav(config);
    } else {
      console.log("[Nav] No pages found, skipping mount");
    }
  };

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    // DOM already loaded, mount immediately
    mount();
  }
}
