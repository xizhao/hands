'use client';

/**
 * Block Element - Renders RSC blocks inline in the Plate editor
 *
 * Usage in MDX:
 * <Block id="my-chart" />
 * <Block id="users-table" limit={10} />
 */

import { useCallback, useMemo, useState } from 'react';
import { PlateElement, type PlateElementProps } from 'platejs/react';
import { useBlockById } from '@/lib/blocks-client';
import { ArrowsClockwise, WarningCircle } from '@phosphor-icons/react';
import { cn } from '@/lib/utils';

interface BlockElementData {
  type: 'block';
  src: string;
  [key: string]: unknown;
  children: [{ text: '' }];
}

export function BlockElement(props: PlateElementProps) {
  const { element, children } = props;
  const blockElement = element as unknown as BlockElementData;
  const blockId = blockElement.src;
  const [isHovered, setIsHovered] = useState(false);

  const blockProps = useMemo(() => {
    const { type, src: _, id: _id, children: _c, ...rest } = blockElement;
    return rest;
  }, [blockElement]);

  const { data, isLoading, refetch, isRefetching } = useBlockById(blockId, blockProps);

  const handleRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

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
        {/* Refresh button - in gutter area, below drag handle */}
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

        {/* Block content - inline */}
        {!blockId ? (
          <span className="inline-flex items-center gap-1.5 text-amber-500 text-sm">
            <WarningCircle className="h-3.5 w-3.5" />
            Missing block id
          </span>
        ) : data?.error ? (
          <span className="inline-flex items-center gap-1.5 text-destructive text-sm">
            <WarningCircle className="h-3.5 w-3.5" />
            {data.error}
          </span>
        ) : loading ? (
          <span className="inline-block animate-pulse bg-muted/50 h-4 w-24 rounded align-middle" />
        ) : data?.html ? (
          <span
            dangerouslySetInnerHTML={{ __html: data.html }}
            className="block-content"
          />
        ) : (
          <span className="text-muted-foreground text-sm italic">—</span>
        )}
        {children}
      </span>
    </PlateElement>
  );
}
