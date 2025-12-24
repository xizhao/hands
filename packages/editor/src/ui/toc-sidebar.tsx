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
    <div className={cn('sticky top-0 right-0 z-5', className)}>
      <div className={cn('group absolute top-0 right-0 z-10 max-h-[400px]')}>
        <div className="relative z-10 mr-2.5 flex flex-col justify-center pr-2 pb-3">
          {/* Depth indicator bars */}
          <div className={cn('flex flex-col gap-3 pb-3 pl-5')}>
            {headingList.slice(0, maxShowCount).map((item) => (
              <div key={item.id}>
                <div
                  className={cn(
                    'h-0.5 rounded-xs bg-primary/20',
                    activeId === item.id && 'bg-primary'
                  )}
                  style={{
                    marginLeft: `${4 * (item.depth - 1)}px`,
                    width: `${16 - 4 * (item.depth - 1)}px`,
                  }}
                />
              </div>
            ))}
          </div>

          {/* Expanded ToC on hover */}
          <nav
            aria-label="Table of contents"
            className={cn(
              '-top-2.5 absolute right-0 px-2.5 transition-all duration-300',
              'pointer-events-none translate-x-[10px] opacity-0',
              'group-hover:pointer-events-auto group-hover:translate-x-0 group-hover:opacity-100',
              'touch:pointer-events-auto touch:translate-x-0 touch:opacity-100',
            )}
          >
            <div
              className={cn(
                popoverVariants(),
                '-mr-2.5 max-h-96 w-[242px] scroll-m-1 overflow-auto rounded-2xl p-3'
              )}
            >
              <div className="relative z-10 p-1.5">
                {headingList.slice(0, maxShowCount).map((item, index) => {
                  const isActive = activeId ? activeId === item.id : index === 0;

                  return (
                    <Button
                      aria-current={isActive}
                      className={cn(
                        tocSidebarButtonVariants({
                          active: isActive,
                          depth: item.depth as any,
                        })
                      )}
                      key={item.id}
                      onClick={(e) => handleClick(e, item)}
                      variant="ghost"
                    >
                      <div className="p-1">{item.title}</div>
                    </Button>
                  );
                })}
              </div>
            </div>
          </nav>
        </div>
      </div>
    </div>
  );
}
