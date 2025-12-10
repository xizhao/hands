import { createRouter, createMemoryHistory } from "@tanstack/react-router";
import { rootRoute } from "./routes/__root";
import { notebookRoute } from "./routes/_notebook";
import { indexRoute } from "./routes/_notebook/index";
import { pageRoute } from "./routes/_notebook/page.$pageId";
import { blocksIndexRoute } from "./routes/_notebook/blocks/index";
import { blockEditorRoute } from "./routes/_notebook/blocks/$blockId";

const routeTree = rootRoute.addChildren([
  notebookRoute.addChildren([indexRoute, pageRoute, blocksIndexRoute, blockEditorRoute]),
]);

// Use memory history for Tauri desktop app
const memoryHistory = createMemoryHistory({
  initialEntries: ["/"],
});

export const router = createRouter({
  routeTree,
  history: memoryHistory,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
