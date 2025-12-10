'use client';

/**
 * Block Element - Renders RSC blocks inline in the Plate editor
 *
 * Uses Flight wire format for full reactivity.
 * Each block is a mini-app with client-side hydration.
 *
 * Usage in MDX:
 * <Block id="my-chart" />
 * <Block id="users-table" limit={10} />
 */

import { Suspense, useCallback, useMemo, useState } from 'react';
import { PlateElement, type PlateElementProps } from 'platejs/react';
import { useBlock } from '@/lib/blocks-client';
import { ArrowsClockwise, WarningCircle, DotsThree } from '@phosphor-icons/react';
import { Hand, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useChatState } from '@/hooks/useChatState';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface BlockElementData {
  type: 'block';
  src: string;
  [key: string]: unknown;
  children: [{ text: '' }];
}

// Shimmer loading skeleton for blocks
function BlockSkeleton() {
  return (
    <span
      className="inline-block h-4 w-24 rounded bg-muted/30 bg-[length:200%_100%] animate-shimmer"
      style={{
        backgroundImage: "linear-gradient(90deg, transparent 0%, hsl(var(--muted)/0.5) 50%, transparent 100%)",
      }}
    />
  );
}

// Simple status indicator shown while runtime is booting
function BlockBootingSkeleton({ blockId }: { blockId: string }) {
  return (
    <span className="inline-flex items-center px-1 py-0.5" title={`Loading ${blockId}...`}>
      <span className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" />
    </span>
  );
}

// Error display for blocks with "Fix with Hands" action
function BlockError({
  blockId,
  message,
  onFix
}: {
  blockId: string;
  message: string;
  onFix: () => void;
}) {
  return (
    <span className="inline-flex items-center gap-2 px-2 py-1 rounded-md bg-destructive/10 border border-destructive/20">
      <WarningCircle className="h-3.5 w-3.5 text-destructive flex-shrink-0" weight="fill" />
      <span className="px-1.5 py-0.5 rounded bg-destructive/15 text-destructive text-[10px] font-medium font-mono">
        {blockId}
      </span>
      <span className="text-destructive text-xs">{message}</span>
      <button
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onFix();
        }}
        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium bg-background hover:bg-muted border border-border/50 transition-colors"
      >
        <Hand className="h-3 w-3" />
        <span>Fix</span>
      </button>
    </span>
  );
}

export function BlockElement(props: PlateElementProps) {
  const { element, children } = props;
  const blockElement = element as unknown as BlockElementData;
  const blockId = blockElement.src;
  const [isHovered, setIsHovered] = useState(false);
  const { setPendingAttachment, setChatExpanded, setAutoSubmitPending } = useChatState();

  // Extract props from element (excluding internal fields)
  const blockProps = useMemo(() => {
    const { type, src: _, id: _id, children: _c, ...rest } = blockElement;
    return rest;
  }, [blockElement]);

  const { data, isLoading, isRefetching, invalidate, runtimeReady, isWaitingForRuntime } = useBlock(blockId, blockProps);

  const handleRefresh = useCallback(() => {
    invalidate();
  }, [invalidate]);

  // Handle "Fix with Hands" - attach block + error to chat and auto-submit
  const handleFixWithHands = useCallback((errorMessage: string) => {
    setPendingAttachment({
      type: 'block',
      blockId,
      name: `${blockId} (error)`,
      errorContext: errorMessage,
    });
    setChatExpanded(true);
    setAutoSubmitPending(true);
  }, [blockId, setPendingAttachment, setChatExpanded, setAutoSubmitPending]);

  const loading = isLoading || isRefetching;

  return (
    <PlateElement {...props} className="inline">
      <span
        contentEditable={false}
        className={cn(
          "relative inline group rounded transition-colors duration-150",
          isHovered && "ring-1 ring-border/50"
        )}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        {/* Block menu - on right side (only show when runtime is ready) */}
        {runtimeReady && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                className={cn(
                  'absolute -right-5 top-0 z-10 p-0.5 rounded',
                  'bg-muted/60 backdrop-blur-sm border border-border/30',
                  'hover:bg-muted transition-all duration-150',
                  isHovered || loading ? 'opacity-100' : 'opacity-0'
                )}
              >
                {loading ? (
                  <ArrowsClockwise
                    weight="bold"
                    className="h-2.5 w-2.5 text-muted-foreground animate-spin"
                  />
                ) : (
                  <DotsThree weight="bold" className="h-2.5 w-2.5 text-muted-foreground" />
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[140px]">
              <DropdownMenuItem
                onClick={() => handleFixWithHands(`Help me improve the ${blockId} block`)}
                className="text-xs"
              >
                <Hand className="h-3 w-3 mr-1.5" />
                Edit with Hands
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={handleRefresh}
                disabled={loading}
                className="text-xs"
              >
                <RefreshCw className={cn("h-3 w-3 mr-1.5", loading && "animate-spin")} />
                Refresh
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}

        {/* Block content - RSC element */}
        {!blockId ? (
          <span className="inline-flex items-center gap-1.5 text-amber-500 text-sm">
            <WarningCircle className="h-3.5 w-3.5" />
            Missing block id
          </span>
        ) : isWaitingForRuntime ? (
          // Show special skeleton while runtime boots
          <BlockBootingSkeleton blockId={blockId} />
        ) : data?.error ? (
          <BlockError
            blockId={blockId}
            message={data.error}
            onFix={() => handleFixWithHands(data.error!)}
          />
        ) : loading ? (
          <BlockSkeleton />
        ) : data?.element ? (
          // Render the RSC element directly
          <Suspense fallback={<BlockSkeleton />}>
            <span className="block-content">
              {data.element}
            </span>
          </Suspense>
        ) : (
          <span className="text-muted-foreground text-sm italic">—</span>
        )}
        {children}
      </span>
    </PlateElement>
  );
}
