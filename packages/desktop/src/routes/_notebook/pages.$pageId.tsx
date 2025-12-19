import { useEffect } from "react";
import { PageEditor } from "@/components/page-editor/PageEditor";
import { createFileRoute } from "@tanstack/react-router";

const LAST_PAGE_KEY = "hands:lastPageId";

export const Route = createFileRoute("/_notebook/pages/$pageId")({
  component: PageView,
});

function PageView() {
  const { pageId } = Route.useParams();

  // Store last visited page in localStorage
  useEffect(() => {
    if (pageId) {
      localStorage.setItem(LAST_PAGE_KEY, pageId);
    }
  }, [pageId]);

  return <PageEditor pageId={pageId} className="h-full" />;
}

/** Get the last visited page ID from localStorage */
export function getLastPageId(): string | null {
  try {
    return localStorage.getItem(LAST_PAGE_KEY);
  } catch {
    return null;
  }
}
