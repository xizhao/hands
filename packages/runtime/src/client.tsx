import { initClient } from "rwsdk/client";
import { getPageIdFromUrl, mountCollab } from "./collab/CollabRoot";

initClient();

// Mount the collaboration widget after DOM is ready
if (typeof window !== "undefined") {
  const mount = () => {
    const pageId = getPageIdFromUrl();
    // Extract page metadata from data attributes on Page wrapper
    const pageEl = document.querySelector("[data-page-title]");
    const title = pageEl?.getAttribute("data-page-title") || undefined;
    const description = pageEl?.getAttribute("data-page-description") || undefined;

    mountCollab(pageId, { title, description });
  };

  // Wait for DOM to be ready
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mount);
  } else {
    // DOM already loaded, mount immediately
    mount();
  }
}
