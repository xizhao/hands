'use client';

import { CopilotPlugin } from '@platejs/ai/react';
import { deserializeMd } from '@platejs/markdown';
import { type TElement } from 'platejs';
import { createPlateEditor, Plate, PlateContent, useElement, usePluginOption } from 'platejs/react';
import { useMemo, useRef } from 'react';

import { EditorKit } from '../editor-kit';
import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';

export function GhostText() {
  const element = useElement();

  const isSuggested = usePluginOption(
    CopilotPlugin,
    'isSuggested',
    element.id as string
  );

  if (!isSuggested) return null;

  return <GhostTextContent />;
}

function GhostTextContent() {
  const suggestionText = usePluginOption(CopilotPlugin, 'suggestionText');
  const hasLeadingSpace = suggestionText?.startsWith(' ');

  // Cache parser editor in ref - created once per component lifetime
  const parserRef = useRef<ReturnType<typeof createPlateEditor> | null>(null);

  // Parse markdown and create editor with full plugin support
  const ghostEditor = useMemo(() => {
    if (!suggestionText) return null;

    try {
      // Lazy create parser with full EditorKit
      if (!parserRef.current) {
        parserRef.current = createPlateEditor({ plugins: EditorKit });
      }

      const parsed = deserializeMd(parserRef.current, suggestionText);
      if (!parsed || parsed.length === 0) return null;

      // Create display editor with full EditorKit for live plugin rendering
      return createPlateEditor({
        plugins: EditorKit,
        value: parsed as TElement[],
      });
    } catch (err) {
      console.error('[ghost-text] parse error:', err);
      return null;
    }
  }, [suggestionText]);

  const ghostContent = ghostEditor ? (
    <Plate editor={ghostEditor} readOnly>
      <PlateContent className="inline" readOnly />
    </Plate>
  ) : (
    <span>{suggestionText}</span>
  );

  return (
    <HoverCard>
      <HoverCardTrigger
        asChild
        onMouseDown={(e) => {
          e.preventDefault();
        }}
      >
        <span
          className="text-muted-foreground/70 max-sm:hidden"
          contentEditable={false}
        >
          {hasLeadingSpace && <span> </span>}
          {ghostContent}
        </span>
      </HoverCardTrigger>

      <HoverCardContent
        align="start"
        className="flex w-auto items-center justify-between p-2 text-sm"
        contentEditable={false}
        onMouseDown={(e) => {
          e.preventDefault();
        }}
        side="top"
      >
        <div className="mr-3 flex items-center">
          <span className="mr-1 shrink-0">Accept All:</span>
          <kbd className="rounded border bg-muted px-2 py-0.5 text-muted-foreground">
            Tab
          </kbd>
        </div>

        <div className="mr-3 flex items-center">
          <span className="mr-1 shrink-0">Accept Word:</span>
          <kbd className="rounded border bg-muted px-2 py-0.5 text-muted-foreground">
            ⌘
          </kbd>
          <span className="mx-px">+</span>
          <kbd className="rounded border bg-muted px-2 py-0.5 text-muted-foreground">
            →
          </kbd>
        </div>

        <div className="flex items-center">
          <span className="mr-1 shrink-0">Cancel:</span>
          <kbd className="rounded border bg-muted px-2 py-0.5 text-muted-foreground">
            Esc
          </kbd>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
