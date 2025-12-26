import { initClient } from "rwsdk/client";
import { mountCollab, getPageIdFromUrl } from "./collab";

initClient();

// Mount the collaboration widget
if (typeof window !== "undefined") {
  const pageId = getPageIdFromUrl();
  mountCollab(pageId);
}
