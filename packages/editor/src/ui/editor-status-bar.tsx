'use client';

/**
 * EditorStatusBar - Minimal status bar showing selection context
 *
 * Shows current element type, word count, and save status.
 * During drag operations, shows drag feedback.
 */

import { DndPlugin } from '@platejs/dnd';
import { BlockSelectionPlugin } from '@platejs/selection/react';
import {
  Paragraph,
  TextH,
  TextHOne,
  TextHTwo,
  TextHThree,
  ListBullets,
  ListNumbers,
  Quotes,
  Code,
  Table,
  Image,
  CheckSquare,
  CaretRight,
  DotsSixVertical,
  Check,
  CircleNotch,
  Lightbulb,
  CaretDown,
  SquaresFour,
} from '@phosphor-icons/react';
import { KEYS } from 'platejs';
import {
  useEditorSelector,
  usePluginOption,
  useSelectionFragmentProp,
} from 'platejs/react';
import * as React from 'react';
import { cn } from '../lib/utils';
import { getBlockType } from '../transforms';

// Element type display info - uses KEYS constants to match Plate
const ELEMENT_INFO: Record<string, { icon: React.ReactNode; label: string }> = {
  [KEYS.p]: { icon: <Paragraph weight="duotone" className="h-3.5 w-3.5" />, label: 'Paragraph' },
  [KEYS.h1]: { icon: <TextHOne weight="duotone" className="h-3.5 w-3.5" />, label: 'Heading 1' },
  [KEYS.h2]: { icon: <TextHTwo weight="duotone" className="h-3.5 w-3.5" />, label: 'Heading 2' },
  [KEYS.h3]: { icon: <TextHThree weight="duotone" className="h-3.5 w-3.5" />, label: 'Heading 3' },
  [KEYS.h4]: { icon: <TextH weight="duotone" className="h-3.5 w-3.5" />, label: 'Heading 4' },
  [KEYS.h5]: { icon: <TextH weight="duotone" className="h-3.5 w-3.5" />, label: 'Heading 5' },
  [KEYS.h6]: { icon: <TextH weight="duotone" className="h-3.5 w-3.5" />, label: 'Heading 6' },
  [KEYS.ul]: { icon: <ListBullets weight="duotone" className="h-3.5 w-3.5" />, label: 'Bullet List' },
  [KEYS.ol]: { icon: <ListNumbers weight="duotone" className="h-3.5 w-3.5" />, label: 'Numbered List' },
  [KEYS.listTodo]: { icon: <CheckSquare weight="duotone" className="h-3.5 w-3.5" />, label: 'To-do List' },
  [KEYS.blockquote]: { icon: <Quotes weight="duotone" className="h-3.5 w-3.5" />, label: 'Quote' },
  [KEYS.codeBlock]: { icon: <Code weight="duotone" className="h-3.5 w-3.5" />, label: 'Code Block' },
  [KEYS.table]: { icon: <Table weight="duotone" className="h-3.5 w-3.5" />, label: 'Table' },
  [KEYS.img]: { icon: <Image weight="duotone" className="h-3.5 w-3.5" />, label: 'Image' },
  [KEYS.callout]: { icon: <Lightbulb weight="duotone" className="h-3.5 w-3.5" />, label: 'Callout' },
  [KEYS.toggle]: { icon: <CaretDown weight="duotone" className="h-3.5 w-3.5" />, label: 'Toggle' },
  [KEYS.columnGroup]: { icon: <SquaresFour weight="duotone" className="h-3.5 w-3.5" />, label: 'Columns' },
};

interface EditorStatusBarProps {
  /** Whether the editor is currently saving */
  isSaving?: boolean;
  /** Additional class name */
  className?: string;
}

export function EditorStatusBar({ isSaving, className }: EditorStatusBarProps) {
  // Get DnD state
  const isDragging = usePluginOption(DndPlugin, 'isDragging');

  // Get block selection state
  let selectedIds: Set<string> | undefined;
  try {
    selectedIds = usePluginOption(BlockSelectionPlugin, 'selectedIds');
  } catch {
    // BlockSelectionPlugin not available
  }

  // Get current block type using the same method as turn-into-toolbar
  const blockType = useSelectionFragmentProp({
    defaultValue: KEYS.p,
    getProp: (node) => getBlockType(node as any),
  });

  // Get word count info
  const wordInfo = useEditorSelector((editor) => {
    const { selection } = editor;
    if (!selection) return { words: 0, chars: 0, hasSelection: false };

    try {
      const isCollapsed = selection.anchor.path.toString() === selection.focus.path.toString() &&
        selection.anchor.offset === selection.focus.offset;

      let text = '';
      if (isCollapsed) {
        // No selection - count current block
        const block = editor.api.block();
        if (block) {
          text = editor.api.string(block[1]) || '';
        }
      } else {
        // Has selection - count selected text
        text = editor.api.string(selection) || '';
      }

      const words = text.trim() ? text.trim().split(/\s+/).length : 0;
      const chars = text.length;

      return { words, chars, hasSelection: !isCollapsed };
    } catch {
      return { words: 0, chars: 0, hasSelection: false };
    }
  }, []);

  const selectedCount = selectedIds?.size ?? 0;
  const elementInfo = ELEMENT_INFO[blockType ?? KEYS.p] ?? ELEMENT_INFO[KEYS.p];

  return (
    <div
      className={cn(
        'h-6 px-3',
        'flex items-center justify-between',
        'border-t border-border/30',
        'bg-muted/30',
        'text-[11px] text-muted-foreground/70',
        'select-none',
        className
      )}
    >
      {/* Left side - Element info */}
      <div className="flex items-center gap-2">
        {isDragging ? (
          // Drag mode
          <div className="flex items-center gap-1.5 text-primary/70">
            <DotsSixVertical weight="bold" className="h-3.5 w-3.5" />
            <span>Moving block...</span>
          </div>
        ) : selectedCount > 1 ? (
          // Multi-select mode
          <div className="flex items-center gap-1.5">
            <CheckSquare weight="duotone" className="h-3.5 w-3.5" />
            <span>{selectedCount} blocks selected</span>
          </div>
        ) : (
          // Single element selected
          <div className="flex items-center gap-1.5">
            {elementInfo.icon}
            <span>{elementInfo.label}</span>
            {wordInfo.words > 0 && (
              <>
                <CaretRight weight="bold" className="h-2.5 w-2.5 opacity-40" />
                <span className="tabular-nums opacity-60">
                  {wordInfo.hasSelection
                    ? `${wordInfo.chars} chars`
                    : `${wordInfo.words} word${wordInfo.words !== 1 ? 's' : ''}`}
                </span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Right side - Save status */}
      <div className="flex items-center gap-1.5">
        {isSaving ? (
          <>
            <CircleNotch weight="bold" className="h-3 w-3 animate-spin" />
            <span>Saving...</span>
          </>
        ) : (
          <>
            <Check weight="bold" className="h-3 w-3 text-green-500/70" />
            <span className="opacity-60">Saved</span>
          </>
        )}
      </div>
    </div>
  );
}
