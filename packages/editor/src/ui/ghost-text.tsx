"use client";

import { CopilotPlugin } from "@platejs/ai/react";
import type { TElement } from "platejs";
import {
  createPlateEditor,
  Plate,
  PlateContent,
  useEditorRef,
  useElement,
  usePluginOption,
} from "platejs/react";
import { Component, type ErrorInfo, type ReactNode, useEffect, useMemo, useState } from "react";

import { useMarkdownWorker } from "../hooks/use-markdown-worker";
import { HoverCard, HoverCardContent, HoverCardTrigger } from "./hover-card";

// Silent error boundary - catches render errors and returns null
class GhostTextErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
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

  const isSuggested = usePluginOption(CopilotPlugin, "isSuggested", element.id as string);

  if (!isSuggested) return null;

  return (
    <GhostTextErrorBoundary>
      <GhostTextContent />
    </GhostTextErrorBoundary>
  );
}

function GhostTextContent() {
  const parentEditor = useEditorRef();
  const suggestionText = usePluginOption(CopilotPlugin, "suggestionText");
  const hasLeadingSpace = suggestionText?.startsWith(" ");

  // Get plugins from the parent editor
  const plugins = parentEditor.pluginList as any[];

  // Use worker for async deserialization
  const { deserialize } = useMarkdownWorker();
  const [parsedNodes, setParsedNodes] = useState<TElement[] | null>(null);

  // Deserialize suggestion text asynchronously
  useEffect(() => {
    if (!suggestionText) {
      setParsedNodes(null);
      return;
    }

    let cancelled = false;
    deserialize(suggestionText)
      .then((nodes) => {
        if (!cancelled && nodes && nodes.length > 0) {
          setParsedNodes(nodes);
        }
      })
      .catch(() => {
        // Silently fail - will show plain text fallback
      });

    return () => {
      cancelled = true;
    };
  }, [suggestionText, deserialize]);

  // Create editor with parsed nodes
  const ghostEditor = useMemo(() => {
    if (!parsedNodes || parsedNodes.length === 0) return null;

    try {
      return createPlateEditor({
        plugins: plugins as any,
        value: parsedNodes,
      });
    } catch {
      return null;
    }
  }, [parsedNodes, plugins]);

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
        <span className="max-sm:hidden" contentEditable={false}>
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
          <kbd className="rounded border bg-muted px-2 py-0.5 text-muted-foreground">Tab</kbd>
        </div>

        <div className="mr-3 flex items-center">
          <span className="mr-1 shrink-0">Accept Word:</span>
          <kbd className="rounded border bg-muted px-2 py-0.5 text-muted-foreground">⌘</kbd>
          <span className="mx-px">+</span>
          <kbd className="rounded border bg-muted px-2 py-0.5 text-muted-foreground">→</kbd>
        </div>

        <div className="flex items-center">
          <span className="mr-1 shrink-0">Cancel:</span>
          <kbd className="rounded border bg-muted px-2 py-0.5 text-muted-foreground">Esc</kbd>
        </div>
      </HoverCardContent>
    </HoverCard>
  );
}
