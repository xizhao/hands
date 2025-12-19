'use client';

/**
 * Ghost Prompt Element
 *
 * Inline void element that captures a user prompt between backticks,
 * calls the AI text-to-sql API, and inserts a LiveQuery element.
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
import { createLiveQueryElement } from '../plugins/live-query-kit';

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

  const handleSuccess = useCallback((sql: string) => {
    const path = editor.api.findPath(elementRef.current);
    if (!path) return;

    const liveQueryNode = createLiveQueryElement(sql);
    editor.tf.removeNodes({ at: path });
    editor.tf.insertNodes(liveQueryNode);
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

  const textToSql = trpc.ai.textToSql.useMutation();

  useEffect(() => {
    if (readOnly || hasCalledRef.current) return;
    if (tables.length === 0) return; // Wait for manifest

    hasCalledRef.current = true;

    textToSql.mutateAsync({ prompt, tables })
      .then((data) => {
        const sql = data.sql?.trim();
        if (sql) {
          handleSuccess(sql);
        }
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
        {(textToSql.isPending || tables.length === 0) && <span className="animate-pulse">...</span>}
        {textToSql.isError && <span className="text-red-500 ml-1">(error)</span>}
      </span>
      {props.children}
    </PlateElement>
  );
}
