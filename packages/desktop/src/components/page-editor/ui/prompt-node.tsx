'use client';

/**
 * Prompt Element
 *
 * Renders a pending agent request. Dispatches to background agent
 * and updates in-place when complete.
 */

import {
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useElement,
  useReadOnly,
} from 'platejs/react';
import { MarkdownPlugin } from '@platejs/markdown';
import { useEffect, useRef } from 'react';
import { Sparkle } from '@phosphor-icons/react';

import { trpc } from '@/lib/trpc';
import { useManifest } from '@/hooks/useRuntimeState';
import { type TPromptElement, PROMPT_KEY } from '../plugins/prompt-kit';

export function PromptElement(props: PlateElementProps) {
  const element = useElement<TPromptElement>();
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { data: manifest } = useManifest();
  const hasStartedRef = useRef(false);

  const { text, status } = element;

  // TODO: Dispatch to background agent
  // For now, just show the pending state
  // In a real implementation, this would:
  // 1. Call an agent endpoint
  // 2. Subscribe to updates via SSE
  // 3. Replace this element with the result when done

  useEffect(() => {
    if (readOnly || hasStartedRef.current || status !== 'pending') return;
    hasStartedRef.current = true;

    // Mark as processing
    const path = editor.api.findPath(element);
    if (path) {
      editor.tf.setNodes({ status: 'processing' } as Partial<TPromptElement>, { at: path });
    }

    // TODO: Start background agent processing
    console.log('[prompt-node] Starting agent for:', text);
  }, [readOnly, status, text, editor, element]);

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        contentEditable: false,
      }}
      className="my-2"
    >
      <div className="flex items-center gap-3 p-4 rounded-lg border border-violet-500/30 bg-violet-500/5">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-violet-500/20">
          <Sparkle
            weight="fill"
            className="size-5 text-violet-600 dark:text-violet-400 animate-pulse"
          />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-medium text-foreground">
            {status === 'pending' && 'Preparing...'}
            {status === 'processing' && 'Working on it...'}
            {status === 'complete' && 'Done'}
            {status === 'error' && 'Failed'}
          </div>
          <div className="text-sm text-muted-foreground truncate">
            {text}
          </div>
        </div>
        {(status === 'pending' || status === 'processing') && (
          <div className="flex gap-1">
            <div className="size-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '0ms' }} />
            <div className="size-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '150ms' }} />
            <div className="size-2 rounded-full bg-violet-500 animate-bounce" style={{ animationDelay: '300ms' }} />
          </div>
        )}
      </div>
      {props.children}
    </PlateElement>
  );
}
