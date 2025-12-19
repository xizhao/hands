'use client';

/**
 * Ghost Prompt Element
 *
 * Inline void element that captures a user prompt between backticks,
 * calls the AI text-to-sql API, and inserts a LiveValue element.
 * Dynamically selects inline vs block based on data shape.
 */

import {
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useElement,
  useReadOnly,
} from 'platejs/react';
import { useEffect, useRef, useCallback, useState } from 'react';

import { useManifest } from '@/hooks/useRuntimeState';
import { trpc } from '@/lib/trpc';
import { type TGhostPromptElement, GHOST_PROMPT_KEY } from '../plugins/ghost-prompt-kit';
import {
  createLiveValueElement,
  selectDisplayType,
  type DisplayType,
} from '../plugins/live-query-kit';

export function GhostPromptElement(props: PlateElementProps) {
  const element = useElement<TGhostPromptElement>();
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { data: manifest, isLoading: isManifestLoading } = useManifest();

  const { prompt } = element;
  const hasCalledRef = useRef(false);

  // Track local loading state (since element may be replaced before state updates)
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tables = manifest?.tables ?? [];

  // Mutations for AI and DB query
  const textToSql = trpc.ai.textToSql.useMutation();
  const dbQuery = trpc.db.query.useMutation();

  const handleSuccess = useCallback((sql: string, data: Record<string, unknown>[]) => {
    try {
      // Find path by searching for ghost_prompt with matching prompt
      const entries = Array.from(
        editor.api.nodes({
          match: { type: GHOST_PROMPT_KEY, prompt },
        })
      );

      if (entries.length === 0) {
        console.warn('[ghost-prompt] Could not find element for replacement');
        return;
      }

      const [node, path] = entries[0];

      // Select display type based on data shape (biases towards minimal)
      const displayType: DisplayType = selectDisplayType(data);
      console.log('[ghost-prompt] Replacing node:', node, 'at path:', path, 'with display:', displayType);

      // Create LiveValue with explicit display prop
      const liveValueNode = createLiveValueElement(sql, { display: displayType });
      console.log('[ghost-prompt] New node:', liveValueNode);

      // Remove the ghost prompt and insert LiveValue
      editor.tf.removeNodes({ at: path });
      console.log('[ghost-prompt] Removed node, inserting new one');
      editor.tf.insertNodes(liveValueNode, { at: path, select: true });
      console.log('[ghost-prompt] Insertion complete');
    } catch (err) {
      console.error('[ghost-prompt] Error in handleSuccess:', err);
    }
  }, [editor, prompt]);

  const handleError = useCallback((errorMsg: string) => {
    console.error('[ghost-prompt] Error:', errorMsg);
    setError(errorMsg);

    // Find path by searching for ghost_prompt with matching prompt
    const entries = Array.from(
      editor.api.nodes({
        match: { type: GHOST_PROMPT_KEY, prompt },
      })
    );

    if (entries.length === 0) {
      console.warn('[ghost-prompt] Could not find element for error replacement');
      return;
    }

    const [, path] = entries[0];
    console.log('[ghost-prompt] Converting to code at path:', path);

    // Convert to inline code on error
    editor.tf.withoutNormalizing(() => {
      editor.tf.removeNodes({ at: path });
      editor.tf.insertNodes({ text: prompt, code: true }, { at: path });
    });
  }, [editor, prompt]);

  useEffect(() => {
    // Don't run in read-only mode or if already called
    if (readOnly || hasCalledRef.current) return;

    // Wait for manifest to load (don't fail silently)
    if (isManifestLoading) {
      console.log('[ghost-prompt] Waiting for manifest...');
      return;
    }

    // No tables available - convert to code immediately
    if (tables.length === 0) {
      console.warn('[ghost-prompt] No tables in manifest, converting to code');
      hasCalledRef.current = true;
      handleError('No tables available');
      return;
    }

    hasCalledRef.current = true;
    setIsProcessing(true);

    console.log('[ghost-prompt] Starting text-to-sql for:', prompt, 'tables:', tables.map(t => t.name));

    // Step 1: Get SQL from AI
    textToSql.mutateAsync({ prompt, tables })
      .then(async (aiResult) => {
        const sql = aiResult.sql?.trim();
        console.log('[ghost-prompt] AI returned SQL:', sql);

        if (!sql) {
          throw new Error('No SQL generated');
        }

        // Step 2: Execute query to check data shape
        console.log('[ghost-prompt] Executing query:', sql);
        const queryResult = await dbQuery.mutateAsync({ sql, params: [] });
        const data = (queryResult.rows ?? []) as Record<string, unknown>[];
        console.log('[ghost-prompt] Query returned', data.length, 'rows');

        // Step 3: Insert appropriate element based on data shape
        handleSuccess(sql, data);
      })
      .catch((err) => {
        const message = err instanceof Error ? err.message : String(err);
        handleError(message);
      })
      .finally(() => {
        setIsProcessing(false);
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, prompt, tables.length, isManifestLoading]);

  // Determine visual state
  const isLoading = isManifestLoading || isProcessing || textToSql.isPending || dbQuery.isPending;
  const hasError = !!error || textToSql.isError || dbQuery.isError;

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        contentEditable: false,
      }}
      className="inline"
    >
      <span className="text-muted-foreground/50 italic">
        {prompt}
        {isLoading && (
          <span className="animate-pulse ml-0.5">...</span>
        )}
        {hasError && (
          <span className="text-red-500/70 ml-1 text-xs">(failed)</span>
        )}
      </span>
      {props.children}
    </PlateElement>
  );
}
