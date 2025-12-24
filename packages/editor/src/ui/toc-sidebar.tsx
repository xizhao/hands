'use client';

import { cva } from 'class-variance-authority';
import { NodeApi } from 'platejs';
import { useEditorRef, useEditorSelector } from 'platejs/react';
import * as React from 'react';

import { cn } from '../lib/utils';

import { Button } from './button';
import { popoverVariants } from './popover';

// Types from @platejs/toc
interface Heading {
  id: string;
  depth: number;
  title: string;
  path: number[];
}

// Get headings from editor - same logic as @platejs/toc
function getHeadingList(editor: any): Heading[] {
  const headings: Heading[] = [];

  for (let i = 0; i < editor.children.length; i++) {
    const node = editor.children[i];
    if (!node || typeof node !== 'object') continue;

    const type = node.type as string;
    if (type === 'h1' || type === 'h2' || type === 'h3') {
      const depth = type === 'h1' ? 1 : type === 'h2' ? 2 : 3;
      const title = NodeApi.string(node);
      const id = node.id as string || '';

      if (title && id) {
        headings.push({ id, depth, title, path: [i] });
      }
    }
  }

  return headings;
}

const tocSidebarButtonVariants = cva(
  'block h-auto w-full rounded-sm p-0 text-left',
  {
    variants: {
      active: {
        false: 'text-muted-foreground hover:text-foreground',
        true: 'text-primary hover:text-primary',
      },
      depth: {
        1: 'pl-0',
        2: 'pl-3',
        3: 'pl-6',
      },
    },
  }
);

interface TocSidebarProps {
  className?: string;
  maxShowCount?: number;
}

export function TocSidebar({
  className,
  maxShowCount = 20,
}: TocSidebarProps) {
  const editor = useEditorRef();
  const headingList = useEditorSelector(getHeadingList, []);
  const [activeId, setActiveId] = React.useState<string>('');

  // Handle click - scroll to heading using scrollIntoView
  const handleClick = React.useCallback((e: React.MouseEvent, item: Heading) => {
    e.preventDefault();

    const node = NodeApi.get(editor, item.path);
    if (!node) return;

    const el = editor.api.toDOMNode(node);
    if (!el) return;

    // Use scrollIntoView - works with nested scroll containers
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setActiveId(item.id);
  }, [editor]);

  if (headingList.length === 0) {
    return null;
  }

  return (
    <div className={cn('group z-50', className)}>
      {/* Depth indicator bars - fit in gutter */}
      <div className="flex flex-col gap-1.5 items-center pt-1">
        {headingList.slice(0, maxShowCount).map((item) => (
          <div
            key={item.id}
            className={cn(
              'h-[3px] rounded-full transition-colors cursor-pointer',
              activeId === item.id
                ? 'bg-primary'
                : 'bg-muted-foreground/20 hover:bg-muted-foreground/40'
            )}
            style={{
              width: `${14 - 4 * (item.depth - 1)}px`,
            }}
            onClick={(e) => handleClick(e, item)}
          />
        ))}
      </div>

      {/* Expanded ToC on hover */}
      <nav
        aria-label="Table of contents"
        className={cn(
          'absolute top-0 left-0 z-50 transition-all duration-200',
          'pointer-events-none opacity-0',
          'group-hover:pointer-events-auto group-hover:opacity-100',
        )}
      >
        <div
          className={cn(
            popoverVariants(),
            'max-h-80 w-[200px] overflow-auto rounded-lg p-1.5 shadow-lg'
          )}
        >
          {headingList.slice(0, maxShowCount).map((item, index) => {
            const isActive = activeId ? activeId === item.id : index === 0;

            return (
              <Button
                aria-current={isActive}
                className={cn(
                  tocSidebarButtonVariants({
                    active: isActive,
                    depth: item.depth as any,
                  }),
                  'text-xs'
                )}
                key={item.id}
                onClick={(e) => handleClick(e, item)}
                variant="ghost"
              >
                <div className="py-0.5 px-1 truncate">{item.title}</div>
              </Button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
