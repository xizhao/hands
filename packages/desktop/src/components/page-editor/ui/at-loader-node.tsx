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

export function AtLoaderElement(props: PlateElementProps) {
  // Use props.element - this is the stable reference passed by Plate
  const element = props.element as TAtLoaderElement;
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { data: manifest } = useManifest();
  const hasCalledRef = useRef(false);

  const { prompt } = element;

  const generateMdx = trpc.ai.generateMdx.useMutation();

  useEffect(() => {
    if (readOnly || hasCalledRef.current) return;
    hasCalledRef.current = true;

    // Check for prefetched promise first
    let queryPromise = pendingMdxQueries.get(prompt);

    if (!queryPromise) {
      // No prefetch available, make our own request
      const tables = (manifest?.tables ?? []).map(t => ({
        name: t.name,
        columns: t.columns,
      }));
      queryPromise = generateMdx.mutateAsync({ prompt, tables });
    }

    queryPromise
      .then((result) => {
        // Find path using props.element (stable reference from Plate)
        const path = editor.api.findPath(element);
        if (!path) return;

        // Deserialize MDX
        try {
          const api = editor.getApi(MarkdownPlugin);
          let nodes = api.markdown.deserialize(result.mdx);

          // If wrapped in a single paragraph, extract children for inline insertion
          if (nodes?.length === 1 && nodes[0].type === 'p' && nodes[0].children) {
            nodes = nodes[0].children;
          }

          if (nodes?.length > 0) {
            editor.tf.withoutNormalizing(() => {
              editor.tf.removeNodes({ at: path });
              editor.tf.insertNodes(nodes as any, { at: path });
            });
            // Add trailing space and position cursor after
            editor.tf.insertText(" ");
          }
        } catch (err) {
          console.error('[at-loader] Failed to deserialize MDX:', err);
          editor.tf.withoutNormalizing(() => {
            editor.tf.removeNodes({ at: path });
            editor.tf.insertNodes({ text: result.mdx }, { at: path });
          });
        }
      })
      .catch((err) => {
        console.error('[at-loader] Generation failed:', err);

        const path = editor.api.findPath(element);
        if (!path) return;

        editor.tf.withoutNormalizing(() => {
          editor.tf.removeNodes({ at: path });
          editor.tf.insertNodes({ text: '[Error]' }, { at: path });
        });
      });
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
