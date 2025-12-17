import { useCallback, useMemo, useState } from "react";
import { EmptyBlockView } from "@/components/workbook/EmptyBlockView";
import { BlockIframe } from "@/components/page-editor/SandboxedBlock";
import { useBlockContent } from "@/hooks/useWorkbook";
import { useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { PORTS } from "@/lib/ports";

export const Route = createFileRoute("/_notebook/blocks/$blockId")({
  component: BlockView,
});

function BlockView() {
  const { blockId } = Route.useParams();
  const queryClient = useQueryClient();
  const { data: source, isLoading, error } = useBlockContent(blockId);

  // Block iframe state
  const [iframeState, setIframeState] = useState<'loading' | 'error' | 'ready'>('loading');
  const [iframeError, setIframeError] = useState<string | null>(null);
  const [iframeHeight, setIframeHeight] = useState(200);

  const previewUrl = useMemo(
    () => `http://localhost:${PORTS.WORKER}/preview/${blockId}`,
    [blockId]
  );

  // Handler to refresh content after initialization
  const handleInitialized = () => {
    queryClient.invalidateQueries({ queryKey: ["block-content", blockId] });
  };

  const handleReady = useCallback((height: number) => {
    setIframeState('ready');
    setIframeError(null);
    setIframeHeight(height);
  }, []);

  const handleResize = useCallback((height: number) => {
    setIframeHeight(height);
  }, []);

  const handleError = useCallback((errorMsg: string) => {
    setIframeState('error');
    setIframeError(errorMsg);
  }, []);

  // Canvas wrapper for design-tool style presentation
  const CanvasWrapper = ({ children }: { children: React.ReactNode }) => (
    <div className="h-full bg-black/[0.03] dark:bg-black/20 overflow-auto">
      {/* Subtle grid pattern */}
      <div
        className="min-h-full p-8 flex items-start justify-center"
        style={{
          backgroundImage: `radial-gradient(circle, hsl(var(--muted-foreground) / 0.15) 1px, transparent 1px)`,
          backgroundSize: '24px 24px',
        }}
      >
        {/* Card container */}
        <div className="w-full max-w-4xl bg-background rounded-lg shadow-xl ring-1 ring-border/50 overflow-hidden">
          {children}
        </div>
      </div>
    </div>
  );

  // Loading state (fetching block source)
  if (isLoading) {
    return (
      <CanvasWrapper>
        <div className="h-64 flex items-center justify-center">
          <div className="flex items-center gap-2 text-muted-foreground">
            <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
            <span className="text-sm font-medium">Loading block...</span>
          </div>
        </div>
      </CanvasWrapper>
    );
  }

  // Error state (block doesn't exist)
  if (error) {
    return (
      <CanvasWrapper>
        <div className="h-64 flex items-center justify-center">
          <div className="text-center">
            <p className="text-sm font-medium text-destructive">
              Failed to load block
            </p>
            <p className="text-xs text-muted-foreground mt-1">{error.message}</p>
          </div>
        </div>
      </CanvasWrapper>
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

  // Render block preview in canvas-style card using same BlockIframe as page editor
  return (
    <CanvasWrapper>
      <div className="relative" style={{ minHeight: iframeHeight }}>
        {/* Loading overlay */}
        {iframeState === 'loading' && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
              <span className="text-sm font-medium">Loading block...</span>
            </div>
          </div>
        )}

        {/* Error state */}
        {iframeState === 'error' && iframeError && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-background">
            <div className="text-center">
              <p className="text-sm font-medium text-destructive">Block error</p>
              <p className="text-xs text-muted-foreground mt-1">{iframeError}</p>
            </div>
          </div>
        )}

        <BlockIframe
          src={blockId}
          previewUrl={previewUrl}
          height={iframeHeight}
          isLoading={iframeState === 'loading'}
          onReady={handleReady}
          onResize={handleResize}
          onError={handleError}
        />
      </div>
    </CanvasWrapper>
  );
}
