'use client';

/**
 * At Loader Element
 *
 * Inline placeholder that shows while waiting for AI.
 * Swaps itself with the result when API returns.
 *
 * Uses props.element (stable reference from Plate) for reliable node swapping.
 */

import {
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useReadOnly,
} from 'platejs/react';
import { MarkdownPlugin } from '@platejs/markdown';
import { useEffect, useRef } from 'react';

import { trpc } from '@/lib/trpc';
import { useManifest } from '@/hooks/useRuntimeState';
import { type TAtLoaderElement, pendingMdxQueries } from '../plugins/at-kit';

const MAX_RETRIES = 3;

export function AtLoaderElement(props: PlateElementProps) {
  // Use props.element - this is the stable reference passed by Plate
  const element = props.element as TAtLoaderElement;
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { data: manifest } = useManifest();
  const hasCalledRef = useRef(false);
  const retryCountRef = useRef(0);
  const errorsRef = useRef<string[]>([]);

  const { prompt } = element;

  const generateMdx = trpc.ai.generateMdx.useMutation();
  const generateMdxRef = useRef(generateMdx);
  generateMdxRef.current = generateMdx;

  useEffect(() => {
    if (readOnly || hasCalledRef.current) return;
    hasCalledRef.current = true;

    const fetchAndSwap = async (errors?: string[]) => {
      // Check for prefetched promise first (only on initial call)
      let queryPromise = errors?.length ? null : pendingMdxQueries.get(prompt);

      if (!queryPromise) {
        const tables = (manifest?.tables ?? []).map(t => ({
          name: t.name,
          columns: t.columns,
        }));
        queryPromise = generateMdxRef.current.mutateAsync({
          prompt,
          tables,
          errors: errors?.length ? errors : undefined,
        });
      }

      try {
        const result = await queryPromise;

        // Find path using props.element (stable reference from Plate)
        const path = editor.api.findPath(element);
        if (!path) return;

        // Deserialize MDX
        try {
          const api = editor.getApi(MarkdownPlugin);
          let nodes = api.markdown.deserialize(result.mdx);

          // If wrapped in a single paragraph, extract children for inline insertion
          if (nodes?.length === 1 && nodes[0].type === 'p' && nodes[0].children) {
            nodes = nodes[0].children as typeof nodes;
          }

          if (nodes?.length > 0) {
            editor.tf.withoutNormalizing(() => {
              editor.tf.removeNodes({ at: path });
              editor.tf.insertNodes(nodes as any, { at: path });
            });
            // Add trailing space and position cursor after
            editor.tf.insertText(" ");
          } else {
            throw new Error("Deserialization produced empty result");
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          // Auto-retry up to MAX_RETRIES times
          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            errorsRef.current = [...errorsRef.current, errorMsg];
            console.log(`[at-loader] Retry ${retryCountRef.current}/${MAX_RETRIES} due to error:`, errorMsg);
            // Clear cache and retry with errors
            pendingMdxQueries.delete(prompt);
            await fetchAndSwap(errorsRef.current);
          } else {
            // Max retries reached, insert as plain text
            console.warn('[at-loader] Max retries reached, inserting as plain text');
            const path = editor.api.findPath(element);
            if (path) {
              editor.tf.withoutNormalizing(() => {
                editor.tf.removeNodes({ at: path });
                editor.tf.insertNodes({ text: result.mdx + " " }, { at: path });
              });
            }
          }
        }
      } catch (err) {
        console.error('[at-loader] Generation failed:', err);
        const path = editor.api.findPath(element);
        if (!path) return;

        editor.tf.withoutNormalizing(() => {
          editor.tf.removeNodes({ at: path });
          editor.tf.insertNodes({ text: '[Error]' }, { at: path });
        });
      }
    };

    fetchAndSwap();
  }, [readOnly, prompt, manifest?.tables, editor, element]);

  return (
    <PlateElement
      {...props}
      attributes={{
        ...props.attributes,
        contentEditable: false,
      }}
      as="span"
      className="inline"
    >
      <span className="italic text-muted-foreground/50 animate-pulse">
        {prompt}
      </span>
      {props.children}
    </PlateElement>
  );
}
