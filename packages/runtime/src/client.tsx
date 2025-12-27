import { initClient } from "rwsdk/client";
import { mountCollab, getPageIdFromUrl } from "./collab";

initClient();

// Mount the collaboration widget after DOM is ready
if (typeof window !== "undefined") {
  console.log("[collab] client.tsx loaded");
  const mount = () => {
    console.log("[collab] mounting widget...");
    const pageId = getPageIdFromUrl();
    // Extract page metadata from meta tags if available
    const title = document.querySelector('title')?.textContent?.replace(' | Hands', '') || undefined;
    const description = document.querySelector('meta[name="description"]')?.getAttribute('content') || undefined;

    mountCollab(pageId, { title, description });
  };

  // Wait for DOM to be ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    // DOM already loaded, mount immediately
    mount();
  }
}
