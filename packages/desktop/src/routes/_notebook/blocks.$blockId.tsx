import { EmptyBlockView } from "@/components/workbook/EmptyBlockView";
import { BlockPreview } from "@/components/workbook/BlockPreview";
import { useBlockContent } from "@/hooks/useWorkbook";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_notebook/blocks/$blockId")({
  component: BlockView,
});

function BlockView() {
  const { blockId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: source, isLoading, error } = useBlockContent(blockId);

  // Handler to refresh content after initialization
  const handleInitialized = () => {
    queryClient.invalidateQueries({ queryKey: ["block-content", blockId] });
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm font-medium">Loading block...</span>
        </div>
      </div>
    );
  }

  // Error state (block doesn't exist)
  if (error) {
    return (
      <div className="h-full flex items-center justify-center bg-background">
        <div className="text-center">
          <p className="text-sm font-medium text-destructive">
            Failed to load block
          </p>
          <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
        </div>
      </div>
    );
  }

  // Empty or uninitialized block - show template picker
  const isUninitialized =
    !source || source.trim() === "" || source.includes("@hands:uninitialized");
  if (isUninitialized) {
    return (
      <EmptyBlockView blockId={blockId} onInitialized={handleInitialized} />
    );
  }

  // Render block preview directly from runtime (no editor server needed)
  return <BlockPreview blockId={blockId} className="h-full" />;
}
