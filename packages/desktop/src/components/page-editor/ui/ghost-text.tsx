'use client';

import { CopilotPlugin } from '@platejs/ai/react';
import { MarkdownPlugin } from '@platejs/markdown';
import { type TElement } from 'platejs';
import { createPlateEditor, useElement, usePluginOption, usePlateEditor } from 'platejs/react';
import { PlateStatic } from 'platejs/static';
import { useMemo } from 'react';

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
  const editor = usePlateEditor();
  const hasLeadingSpace = suggestionText?.startsWith(' ');

  // Parse suggestion as Plate nodes using the editor's markdown deserializer
  const ghostNodes = useMemo(() => {
    if (!suggestionText) return null;

    try {
      // Get the markdown API from the editor
      const markdownApi = editor.getApi(MarkdownPlugin);
      if (!markdownApi?.markdown?.deserialize) {
        // Fallback: just render as text
        return null;
      }

      // Deserialize the suggestion into Plate nodes
      const parsed = markdownApi.markdown.deserialize(suggestionText);

      if (!parsed || parsed.length === 0) return null;

      // For inline suggestions (single paragraph), extract just the text content
      // to render inline with the existing text
      if (parsed.length === 1 && parsed[0].type === 'p') {
        return parsed;
      }

      return parsed;
    } catch {
      // Parsing failed - will fall back to text rendering
      return null;
    }
  }, [suggestionText, editor]);

  // Create a static editor for rendering the ghost nodes with full plugin support
  const ghostContent = useMemo(() => {
    if (!ghostNodes) {
      // Fallback: render as plain text
      return <span>{suggestionText}</span>;
    }

    // Create editor with same plugins to render custom elements (LiveValue, etc.)
    const staticEditor = createPlateEditor({
      plugins: EditorKit,
      value: ghostNodes as TElement[],
    });

    return (
      <PlateStatic
        editor={staticEditor}
        className="inline [&_*]:!text-muted-foreground [&_*]:!opacity-70"
      />
    );
  }, [ghostNodes, suggestionText]);

  return (
    <HoverCard>
      <HoverCardTrigger
        asChild
        onMouseDown={(e) => {
          e.preventDefault();
        }}
      >
        <span
          className="text-muted-foreground max-sm:hidden"
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
