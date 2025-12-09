import { createRoute } from "@tanstack/react-router";
import { notebookRoute } from "../_notebook";

export const indexRoute = createRoute({
  getParentRoute: () => notebookRoute,
  path: "/",
  component: IndexPage,
});

// No page selected - sidebar is shown full-width in the shell
function IndexPage() {
  return null;
}
