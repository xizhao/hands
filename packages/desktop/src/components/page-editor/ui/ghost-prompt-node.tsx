'use client';

/**
 * Ghost Prompt Element
 *
 * Inline void element that captures a user prompt between backticks,
 * calls the AI text-to-sql API, and inserts a LiveQuery element.
 * Dynamically selects inline vs block based on data shape.
 */

import {
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useElement,
  useReadOnly,
} from 'platejs/react';
import { useEffect, useRef, useCallback } from 'react';

import { useManifest } from '@/hooks/useRuntimeState';
import { trpc } from '@/lib/trpc';
import { type TGhostPromptElement } from '../plugins/ghost-prompt-kit';
import {
  createInlineLiveQueryElement,
  createLiveQueryElement,
  selectDisplayType,
} from '../plugins/live-query-kit';

export function GhostPromptElement(props: PlateElementProps) {
  const element = useElement<TGhostPromptElement>();
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { data: manifest } = useManifest();

  const { prompt } = element;
  const hasCalledRef = useRef(false);
  const elementRef = useRef(element);
  elementRef.current = element;

  const tables = manifest?.tables ?? [];

  // Mutations for AI and DB query
  const textToSql = trpc.ai.textToSql.useMutation();
  const dbQuery = trpc.db.query.useMutation();

  const handleSuccess = useCallback((sql: string, data: Record<string, unknown>[]) => {
    const path = editor.api.findPath(elementRef.current);
    if (!path) return;

    // Select display type based on data shape
    const displayType = selectDisplayType(data);

    editor.tf.removeNodes({ at: path });

    if (displayType === 'inline-value') {
      // Single value - insert inline element
      const inlineNode = createInlineLiveQueryElement(sql);
      editor.tf.insertNodes(inlineNode, { at: path });
    } else {
      // List or table - insert block element (will use auto-display)
      const blockNode = createLiveQueryElement(sql);
      editor.tf.insertNodes(blockNode, { at: path });
    }
  }, [editor]);

  const handleError = useCallback((error: Error) => {
    console.error('[ghost-prompt] Error:', error.message);

    const path = editor.api.findPath(elementRef.current);
    if (!path) return;

    editor.tf.removeNodes({ at: path });
    editor.tf.insertNodes(
      { text: prompt, code: true },
      { at: path }
    );
  }, [editor, prompt]);

  useEffect(() => {
    if (readOnly || hasCalledRef.current) return;
    if (tables.length === 0) return; // Wait for manifest

    hasCalledRef.current = true;

    // Step 1: Get SQL from AI
    textToSql.mutateAsync({ prompt, tables })
      .then(async (aiResult) => {
        const sql = aiResult.sql?.trim();
        if (!sql) {
          throw new Error('No SQL generated');
        }

        // Step 2: Execute query to check data shape
        const queryResult = await dbQuery.mutateAsync({ sql, params: [] });
        const data = (queryResult.rows ?? []) as Record<string, unknown>[];

        // Step 3: Insert appropriate element based on data shape
        handleSuccess(sql, data);
      })
      .catch((err) => {
        handleError(err instanceof Error ? err : new Error(String(err)));
      });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, prompt, tables.length]);

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
        {(textToSql.isPending || dbQuery.isPending || tables.length === 0) && (
          <span className="animate-pulse">...</span>
        )}
        {(textToSql.isError || dbQuery.isError) && (
          <span className="text-red-500 ml-1">(error)</span>
        )}
      </span>
      {props.children}
    </PlateElement>
  );
}
