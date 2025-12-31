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

// Get headings from editor - optimized to only check heading nodes
function getHeadingList(editor: any): Heading[] {
  const headings: Heading[] = [];
  const children = editor.children;
  const len = children.length;

  for (let i = 0; i < len; i++) {
    const node = children[i];
    if (!node || typeof node !== 'object') continue;

    const type = node.type as string;
    // Early exit check - only process heading types
    if (type !== 'h1' && type !== 'h2' && type !== 'h3') continue;

    const id = node.id as string;
    if (!id) continue;

    const depth = type === 'h1' ? 1 : type === 'h2' ? 2 : 3;
    const title = NodeApi.string(node);

    if (title) {
      headings.push({ id, depth, title, path: [i] });
    }
  }

  return headings;
}

// Deep equality check for heading arrays to prevent unnecessary re-renders
function headingsEqual(a: Heading[], b: Heading[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || a[i].depth !== b[i].depth || a[i].title !== b[i].title) {
      return false;
    }
  }
  return true;
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
  /** Position of the sidebar - affects expand direction */
  position?: 'left' | 'right';
}

export function TocSidebar({
  className,
  maxShowCount = 20,
  position = 'left',
}: TocSidebarProps) {
  const editor = useEditorRef();
  // Use equality function to prevent re-renders when headings haven't changed
  const headingList = useEditorSelector(getHeadingList, [], { equalityFn: headingsEqual });
  const [activeId, setActiveId] = React.useState<string>('');

  // Scrollspy - track visible headings with IntersectionObserver
  React.useEffect(() => {
    if (headingList.length === 0) return;

    // Map DOM elements to heading IDs
    const elementToId = new Map<Element, string>();
    const visibleHeadings = new Set<string>();

    // Observe all heading elements
    const elements: Element[] = [];
    for (const heading of headingList) {
      const node = NodeApi.get(editor, heading.path);
      if (!node) continue;
      const el = editor.api.toDOMNode(node);
      if (el) {
        elements.push(el);
        elementToId.set(el, heading.id);
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = elementToId.get(entry.target);
          if (!id) continue;

          if (entry.isIntersecting) {
            visibleHeadings.add(id);
          } else {
            visibleHeadings.delete(id);
          }
        }

        // Set active to the first visible heading (topmost in document order)
        for (const heading of headingList) {
          if (visibleHeadings.has(heading.id)) {
            setActiveId(heading.id);
            break;
          }
        }
      },
      { rootMargin: '-10% 0px -80% 0px' } // Trigger when heading is in top 20% of viewport
    );

    for (const el of elements) {
      observer.observe(el);
    }

    return () => observer.disconnect();
  }, [editor, headingList]);

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
          'absolute top-0 z-50 transition-all duration-200',
          'pointer-events-none opacity-0',
          'group-hover:pointer-events-auto group-hover:opacity-100',
          position === 'right' ? 'right-0' : 'left-0',
        )}
      >
        <div
          className={cn(
            popoverVariants(),
            'max-h-80 w-[200px] overflow-auto rounded-lg p-1.5 shadow-lg',
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
