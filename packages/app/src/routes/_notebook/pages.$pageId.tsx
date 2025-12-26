import { useEffect } from "react";
import { PageEditor } from "@/components/page-editor/PageEditor";
import { HeaderActions } from "@/components/workbook/HeaderActionsContext";
import { PreviewButton } from "@/components/workbook/PreviewButton";
import { useRuntimeState } from "@/hooks/useRuntimeState";
import { createFileRoute } from "@tanstack/react-router";

const LAST_PAGE_KEY = "hands:lastPageId";

export const Route = createFileRoute("/_notebook/pages/$pageId")({
  component: PageView,
});

function PageView() {
  const { pageId } = Route.useParams();
  const { manifest } = useRuntimeState();

  // Find current page to get its route (fallback to pageId if manifest not loaded)
  const currentPage = manifest?.pages?.find(
    (p) => p.id === pageId || p.route === `/${pageId}`
  );
  const pageRoute = currentPage?.route || `/${pageId}`;

  // Store last visited page in localStorage
  useEffect(() => {
    if (pageId) {
      localStorage.setItem(LAST_PAGE_KEY, pageId);
    }
  }, [pageId]);

  return (
    <>
      <HeaderActions>
        <PreviewButton pageRoute={pageRoute} />
      </HeaderActions>
      <PageEditor pageId={pageId} className="h-full" />
    </>
  );
}

/** Get the last visited page ID from localStorage */
export function getLastPageId(): string | null {
  try {
    return localStorage.getItem(LAST_PAGE_KEY);
  } catch {
    return null;
  }
}
