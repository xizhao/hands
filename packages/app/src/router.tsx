import { createMemoryHistory, createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

// Use memory history for Tauri desktop app
const memoryHistory = createMemoryHistory({
  initialEntries: ["/"],
});

export const router = createRouter({
  routeTree,
  history: memoryHistory,
  defaultNotFoundComponent: () => {
    // Redirect to home on 404
    router.navigate({ to: "/" });
    return null;
  },
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
