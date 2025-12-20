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
  usePluginOption,
  useReadOnly,
} from 'platejs/react';
import { MarkdownPlugin, serializeMd } from '@platejs/markdown';
import type { Descendant, TElement } from 'platejs';
import { useEffect, useRef } from 'react';

import { trpc } from '@/lib/trpc';
import { useManifest } from '@/hooks/useRuntimeState';
import { type TAtLoaderElement, pendingMdxQueries } from '../plugins/at-kit';
import { PageContextPlugin } from '../plugins/page-context-kit';

// Helper to get document context (prefix/suffix around cursor)
function getDocumentContext(editor: ReturnType<typeof useEditorRef>) {
  try {
    const fullDoc = serializeMd(editor, { value: editor.children as TElement[] });
    const contextEntry = editor.api.block({ highest: true });
    if (!contextEntry) return { prefix: fullDoc, suffix: "" };

    const currentBlock = serializeMd(editor, { value: [contextEntry[0] as TElement] });
    const blockIndex = fullDoc.indexOf(currentBlock);
    const prefix = blockIndex >= 0 ? fullDoc.slice(0, blockIndex + currentBlock.length) : currentBlock;
    const suffix = blockIndex >= 0 ? fullDoc.slice(blockIndex + currentBlock.length) : "";
    return { prefix, suffix };
  } catch {
    return { prefix: "", suffix: "" };
  }
}

const MAX_RETRIES = 3;

export function AtLoaderElement(props: PlateElementProps) {
  // Use props.element - this is the stable reference passed by Plate
  const element = props.element as TAtLoaderElement;
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const { data: manifest } = useManifest();
  const title = usePluginOption(PageContextPlugin, 'title');
  const description = usePluginOption(PageContextPlugin, 'description');
  const hasCalledRef = useRef(false);
  const retryCountRef = useRef(0);
  const errorsRef = useRef<string[]>([]);

  const { prompt } = element;

  const generateMdx = trpc.ai.generateMdx.useMutation({
    onError: () => {}, // Suppress global error handler - we handle locally
  });
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
        // Get document context
        const { prefix, suffix } = getDocumentContext(editor);
        queryPromise = generateMdxRef.current.mutateAsync({
          prompt,
          tables,
          errors: errors?.length ? errors : undefined,
          prefix,
          suffix,
          title: title ?? undefined,
          description: description ?? undefined,
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
          const deserialized = api.markdown.deserialize(result.mdx);

          // If wrapped in a single paragraph, extract children for inline insertion
          let nodes: Descendant[];
          if (deserialized?.length === 1 && deserialized[0].type === 'p' && deserialized[0].children) {
            nodes = deserialized[0].children;
          } else {
            nodes = deserialized ?? [];
          }

          if (nodes.length > 0) {
            editor.tf.withoutNormalizing(() => {
              editor.tf.removeNodes({ at: path });
              editor.tf.insertNodes(nodes, { at: path });
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
  }, [readOnly, prompt, manifest?.tables, editor, element, title, description]);

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
