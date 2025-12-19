'use client';

/**
 * Prompt Element
 *
 * Dispatches complex requests to OpenCode background agent.
 * - <Prompt text="..." /> = pending (stored as promptText to avoid Slate text node conflict)
 * - <Prompt threadId="..." /> = processing, agent is working
 *
 * When agent finishes, it edits the MDX file directly. Hot reload updates the editor.
 */

import {
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useReadOnly,
} from 'platejs/react';
import { useEffect, useRef, useState } from 'react';
import { Sparkle } from '@phosphor-icons/react';
import { useQuery } from '@tanstack/react-query';

import { api, subscribeToEvents } from '@/lib/api';
import { useActiveRuntime } from '@/hooks/useWorkbook';
import { useManifest } from '@/hooks/useRuntimeState';
import { type TPromptElement } from '../plugins/prompt-kit';

export function PromptElement(props: PlateElementProps) {
  const element = props.element as TPromptElement;
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { data: manifest } = useManifest();
  const { data: runtime } = useActiveRuntime();
  const hasStartedRef = useRef(false);

  const { promptText, threadId } = element;
  const directory = runtime?.directory ?? null;
  const isPending = !!promptText && !threadId;
  const isProcessing = !!threadId;

  // Track latest status text from the thread
  const [statusText, setStatusText] = useState<string | null>(null);

  // Subscribe to thread updates when processing
  useEffect(() => {
    if (!isProcessing || !threadId) return;

    // Fetch initial messages
    api.messages.list(threadId, directory).then((messages) => {
      const lastAssistant = [...messages].reverse().find(m => m.info.role === 'assistant');
      if (lastAssistant) {
        const textPart = lastAssistant.parts.find(p => p.type === 'text');
        if (textPart && 'text' in textPart) {
          setStatusText(textPart.text.slice(0, 100));
        }
      }
    }).catch(() => {});

    // Subscribe to live updates
    const unsubscribe = subscribeToEvents((event) => {
      if (event.type === 'message.part.updated') {
        const props = event.properties as { sessionID: string; part: { type: string; text?: string } };
        if (props.sessionID === threadId && props.part.type === 'text' && props.part.text) {
          setStatusText(props.part.text.slice(0, 100));
        }
      }
    });

    return () => unsubscribe();
  }, [isProcessing, threadId, directory]);

  // Start agent when we have text but no threadId
  useEffect(() => {
    if (readOnly || hasStartedRef.current || !isPending) return;
    hasStartedRef.current = true;

    const startAgent = async () => {
      console.log('[prompt-node] Starting agent for:', promptText);

      try {
        // Create a new session
        const session = await api.sessions.create({ title: promptText!.slice(0, 50) }, directory);
        console.log('[prompt-node] Created session:', session.id);

        // Update element: remove promptText, add threadId
        const path = editor.api.findPath(element);
        if (path) {
          editor.tf.setNodes(
            { promptText: undefined, threadId: session.id } as Partial<TPromptElement>,
            { at: path }
          );
        }

        // Build context about the schema
        const schemaContext = manifest?.tables?.length
          ? `Available tables:\n${manifest.tables.map(t => `- ${t.name}(${t.columns.join(', ')})`).join('\n')}`
          : '';

        // System prompt for MDX generation
        const systemPrompt = `You are a UI component generator for a document editor. Generate MDX content that will be inserted into the document.

${schemaContext}

Available components:
- <LiveValue query="SQL" display="inline|list|table" /> - Display live data
- <LiveAction sql="SQL"><ActionButton>Label</ActionButton></LiveAction> - Database mutation buttons
- <Block src="component.tsx" /> - Custom React components

Generate ONLY the MDX content, no explanation or markdown code fences.
Replace the <Prompt> element in the file with your generated content.`;

        // Send the prompt
        await api.promptAsync(session.id, promptText!, {
          system: systemPrompt,
          directory,
        });
        console.log('[prompt-node] Prompt sent to session:', session.id);

      } catch (err) {
        console.error('[prompt-node] Failed to start agent:', err);
      }
    };

    startAgent();
  }, [readOnly, isPending, promptText, editor, element, directory, manifest?.tables]);

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        contentEditable: false,
      }}
      className="my-1"
    >
      <div className="inline-flex items-center gap-2 px-2 py-1 rounded-md border border-violet-500/30 bg-violet-500/5 text-sm">
        <Sparkle
          weight="fill"
          className="size-4 text-violet-600 dark:text-violet-400 animate-pulse shrink-0"
        />
        <span className="text-muted-foreground truncate max-w-[300px]">
          {isPending ? (
            <>Hands will build it: <span className="text-foreground">{promptText}</span></>
          ) : (
            <>Hands: <span className="text-foreground">{statusText || '...'}</span></>
          )}
        </span>
      </div>
      {props.children}
    </PlateElement>
  );
}
