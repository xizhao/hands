'use client';

import { CopilotPlugin } from '@platejs/ai/react';
import { deserializeMd } from '@platejs/markdown';
import { type TElement } from 'platejs';
import { createPlateEditor, Plate, PlateContent, useElement, useEditorRef, usePluginOption } from 'platejs/react';
import { Component, type ErrorInfo, type ReactNode, useMemo, useRef } from 'react';

import { HoverCard, HoverCardContent, HoverCardTrigger } from './hover-card';

// Silent error boundary - catches render errors and returns null
class GhostTextErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError(_: Error) {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Silently fail - don't log to avoid noise
  }

  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

export function GhostText() {
  const element = useElement();

  const isSuggested = usePluginOption(
    CopilotPlugin,
    'isSuggested',
    element.id as string
  );

  if (!isSuggested) return null;

  return (
    <GhostTextErrorBoundary>
      <GhostTextContent />
    </GhostTextErrorBoundary>
  );
}

function GhostTextContent() {
  const parentEditor = useEditorRef();
  const suggestionText = usePluginOption(CopilotPlugin, 'suggestionText');
  const hasLeadingSpace = suggestionText?.startsWith(' ');

  // Cache parser editor in ref - created once per component lifetime
  const parserRef = useRef<ReturnType<typeof createPlateEditor> | null>(null);

  // Get plugins from the parent editor (cast to any for compatibility)
  const plugins = parentEditor.pluginList as any[];

  // Parse markdown and create editor with full plugin support
  const ghostEditor = useMemo(() => {
    if (!suggestionText) return null;

    try {
      // Lazy create parser with parent editor's plugins
      if (!parserRef.current) {
        parserRef.current = createPlateEditor({ plugins: plugins as any });
      }

      const parsed = deserializeMd(parserRef.current, suggestionText);
      if (!parsed || parsed.length === 0) return null;

      // Create display editor with parent editor's plugins for live plugin rendering
      return createPlateEditor({
        plugins: plugins as any,
        value: parsed as TElement[],
      });
    } catch {
      // Silently fail - return null to show plain text fallback
      return null;
    }
  }, [suggestionText, plugins]);

  const ghostContent = ghostEditor ? (
    <span className="inline opacity-50">
      <Plate editor={ghostEditor} readOnly>
        <PlateContent className="inline" readOnly />
      </Plate>
    </span>
  ) : (
    <span className="opacity-50">{suggestionText}</span>
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
          className="max-sm:hidden"
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
