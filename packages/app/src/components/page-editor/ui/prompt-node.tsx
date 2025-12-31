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
  usePluginOption,
  useReadOnly,
} from 'platejs/react';
import { useEffect, useRef, useState } from 'react';
import { Sparkle } from '@phosphor-icons/react';

import { api, subscribeToEvents } from '@/lib/api';
import { useActiveRuntime } from '@/hooks/useWorkbook';
import { trpc } from '@/lib/trpc';
import { HandsLogo } from '@/components/ui/hands-logo';
import { type TPromptElement } from '../plugins/prompt-kit';
import { PageContextPlugin } from '@hands/editor';

export function PromptElement(props: PlateElementProps) {
  const element = props.element as TPromptElement;
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { data: domainsData } = trpc.domains.list.useQuery();
  const { data: runtime } = useActiveRuntime();
  const pageId = usePluginOption(PageContextPlugin, 'pageId');
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
        const { part } = event.properties;
        if (part.sessionID === threadId && part.type === 'text' && 'text' in part) {
          setStatusText(part.text.slice(0, 100));
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

        // Build context about the schema from domains
        const domains = domainsData?.domains ?? [];
        const schemaContext = domains.length
          ? `Available tables:\n${domains.map(d => `- ${d.name}(${d.columns.map(c => c.name).join(', ')})`).join('\n')}`
          : '';

        // System prompt for MDX generation - includes file path and clear edit instructions
        const systemPrompt = `You are editing an MDX page file. Your task is to replace the <Prompt> element with appropriate MDX content.

**File to edit:** source://${pageId}

${schemaContext}

## Available MDX Components

- \`<LiveValue query="SQL" />\` - Display live data (auto-selects inline/list/table based on result shape)
- \`<LiveValue query="SQL" display="inline" />\` - Inline value in text
- \`<LiveAction sql="SQL"><Button>Label</Button></LiveAction>\` - Interactive button that runs SQL

## Instructions

1. Read the page file at source://${pageId}
2. Find the <Prompt text="..."> element
3. Use the edit tool to REPLACE the <Prompt> line with your generated MDX content
4. Generate ONLY valid MDX - no code fences, no explanations`;

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
  }, [readOnly, isPending, promptText, editor, element, directory, domainsData?.domains, pageId]);

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
        {isProcessing ? (
          <HandsLogo className="size-4 text-violet-600 dark:text-violet-400 animate-pulse shrink-0" />
        ) : (
          <Sparkle
            weight="fill"
            className="size-4 text-violet-600 dark:text-violet-400 animate-pulse shrink-0"
          />
        )}
        <span className="text-muted-foreground truncate max-w-[300px]">
          {isPending ? (
            <>{promptText}</>
          ) : (
            <span className="text-foreground">{statusText || 'Thinking...'}</span>
          )}
        </span>
      </div>
      {props.children}
    </PlateElement>
  );
}
