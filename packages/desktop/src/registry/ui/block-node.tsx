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
import { ArrowsClockwise, WarningCircle } from '@phosphor-icons/react';
import { Hand } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/ui';

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
  const { setPendingAttachment, setChatExpanded, setAutoSubmitPending } = useUIStore();

  // Extract props from element (excluding internal fields)
  const blockProps = useMemo(() => {
    const { type, src: _, id: _id, children: _c, ...rest } = blockElement;
    return rest;
  }, [blockElement]);

  const { data, isLoading, isRefetching, invalidate } = useBlock(blockId, blockProps);

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
        {/* Refresh button - in gutter area */}
        <button
          onClick={handleRefresh}
          disabled={loading}
          className={cn(
            'absolute -left-8 top-6 z-10 p-1 rounded-full',
            'bg-muted/80 backdrop-blur-sm border border-border/50',
            'hover:bg-muted transition-all duration-150',
            isHovered || loading ? 'opacity-100' : 'opacity-0'
          )}
          title={`Refresh ${blockId}`}
        >
          <ArrowsClockwise
            weight="bold"
            className={cn(
              'h-3 w-3 text-muted-foreground',
              loading && 'animate-spin'
            )}
          />
        </button>

        {/* Block content - RSC element */}
        {!blockId ? (
          <span className="inline-flex items-center gap-1.5 text-amber-500 text-sm">
            <WarningCircle className="h-3.5 w-3.5" />
            Missing block id
          </span>
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
