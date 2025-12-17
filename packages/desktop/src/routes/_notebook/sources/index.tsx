/**
 * Sources Index Route - /sources
 *
 * Shows the sources sidebar in full-width mode similar to the index page.
 */

import { NotebookSidebar } from "@/components/sidebar/NotebookSidebar";
import { createFileRoute, useRouter } from "@tanstack/react-router";

export const Route = createFileRoute("/_notebook/sources/")({
  component: SourcesIndexPage,
});

function SourcesIndexPage() {
  const _router = useRouter();

  return (
    <div className="flex-1 flex items-start justify-center overflow-y-auto">
      <div className="p-4 pt-8 w-full max-w-4xl">
        <NotebookSidebar fullWidth />
      </div>
    </div>
  );
}
