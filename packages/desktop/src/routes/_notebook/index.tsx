import { createFileRoute, useRouter } from "@tanstack/react-router";
import { DraftsSidebar } from "@/components/Notebook/sidebar/PagesSidebar";
import { EmptyWorkbookState } from "@/components/Notebook/EmptyWorkbookState";
import { useManifest, useDbSchema, useActiveWorkbookId, useCreatePage } from "@/hooks/useWorkbook";
import { useChatState } from "@/hooks/useChatState";

export const Route = createFileRoute("/_notebook/")({
  component: IndexPage,
});

function IndexPage() {
  const router = useRouter();
  const activeWorkbookId = useActiveWorkbookId();
  const { data: manifest } = useManifest();
  const { data: dbSchema } = useDbSchema(activeWorkbookId);
  const createPage = useCreatePage();
  const chatState = useChatState();

  const tableCount = dbSchema?.length ?? 0;
  const draftCount = manifest?.pages?.length ?? 0;
  const manifestTableCount = manifest?.tables?.length ?? 0;

  // Show getting started when manifest is loaded but empty
  const showGettingStarted = manifest !== undefined && manifestTableCount === 0 && tableCount === 0 && draftCount === 0;

  const handleAddPage = async () => {
    try {
      const result = await createPage.mutateAsync({ title: "Untitled" });
      if (result.success && result.page) {
        router.navigate({ to: "/page/$pageId", params: { pageId: result.page.id } });
      }
    } catch (err) {
      console.error("[IndexPage] Failed to create page:", err);
    }
  };

  const handleImportFile = () => {
    // TODO: Trigger file input
  };

  if (manifest === undefined) {
    // Loading state
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="space-y-3 w-48">
          <div className="h-3 bg-muted/50 rounded animate-pulse" />
          <div className="h-3 bg-muted/50 rounded animate-pulse w-3/4" />
          <div className="h-3 bg-muted/50 rounded animate-pulse w-1/2" />
        </div>
      </div>
    );
  }

  if (showGettingStarted) {
    return (
      <div className="flex-1 flex items-start justify-center overflow-y-auto">
        <EmptyWorkbookState
          onImportFile={handleImportFile}
          chatExpanded={chatState.chatExpanded}
        />
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-start justify-center overflow-y-auto">
      <div className="p-4 pt-8">
        <DraftsSidebar collapsed={false} fullWidth onAddDraft={handleAddPage} />
      </div>
    </div>
  );
}
