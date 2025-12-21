"use client";

/**
 * At Loader Element
 *
 * Inline placeholder that shows while waiting for AI.
 * Swaps itself with the result when API returns.
 *
 * Uses EditorContext for tRPC access.
 */

import {
  PlateElement,
  type PlateElementProps,
  useEditorRef,
  useReadOnly,
} from "platejs/react";
import { MarkdownPlugin, serializeMd } from "@platejs/markdown";
import type { Descendant, TElement } from "platejs";
import { useEffect, useRef } from "react";

import { useEditorApi } from "../../context";
import { type TAtLoaderElement, pendingMdxQueries } from "./index";

// Helper to get document context
function getDocumentContext(editor: ReturnType<typeof useEditorRef>) {
  try {
    const fullDoc = serializeMd(editor, {
      value: editor.children as TElement[],
    });
    const contextEntry = editor.api.block({ highest: true });
    if (!contextEntry) return { prefix: fullDoc, suffix: "" };

    const currentBlock = serializeMd(editor, {
      value: [contextEntry[0] as TElement],
    });
    const blockIndex = fullDoc.indexOf(currentBlock);
    const prefix =
      blockIndex >= 0
        ? fullDoc.slice(0, blockIndex + currentBlock.length)
        : currentBlock;
    const suffix =
      blockIndex >= 0 ? fullDoc.slice(blockIndex + currentBlock.length) : "";
    return { prefix, suffix };
  } catch {
    return { prefix: "", suffix: "" };
  }
}

const MAX_RETRIES = 3;

export function AtLoaderElement(props: PlateElementProps) {
  const element = props.element as TAtLoaderElement;
  const editor = useEditorRef();
  const readOnly = useReadOnly();
  const api = useEditorApi();
  const hasCalledRef = useRef(false);
  const retryCountRef = useRef(0);
  const errorsRef = useRef<string[]>([]);
  const previousGenerationsRef = useRef<string[]>([]);

  const { prompt } = element;

  useEffect(() => {
    if (readOnly || hasCalledRef.current || !api) return;
    hasCalledRef.current = true;

    const fetchAndSwap = async (
      errors?: string[],
      previousGenerations?: string[]
    ) => {
      // Check for prefetched promise first
      let queryPromise = errors?.length ? null : pendingMdxQueries.get(prompt);

      if (!queryPromise) {
        const { prefix, suffix } = getDocumentContext(editor);
        queryPromise = api.generateMdx({
          prompt,
          errors: errors?.length ? errors : undefined,
          prefix,
          suffix,
        });
      }

      try {
        const result = await queryPromise;

        const path = editor.api.findPath(element);
        if (!path) return;

        try {
          const mdApi = editor.getApi(MarkdownPlugin);
          const deserialized = mdApi.markdown.deserialize(result.mdx);

          let nodes: Descendant[];
          if (
            deserialized?.length === 1 &&
            deserialized[0].type === "p" &&
            deserialized[0].children
          ) {
            nodes = deserialized[0].children;
          } else {
            nodes = deserialized ?? [];
          }

          if (nodes.length > 0) {
            editor.tf.withoutNormalizing(() => {
              editor.tf.removeNodes({ at: path });
              editor.tf.insertNodes(nodes, { at: path });
            });

            // Only insert trailing space for inline content
            const isInline = nodes.length === 1 && !("type" in nodes[0]);
            if (isInline) {
              editor.tf.insertText(" ");
            }
          } else {
            throw new Error("Deserialization produced empty result");
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : String(err);

          if (retryCountRef.current < MAX_RETRIES) {
            retryCountRef.current++;
            errorsRef.current = [...errorsRef.current, errorMsg];
            previousGenerationsRef.current = [
              ...previousGenerationsRef.current,
              result.mdx,
            ];
            pendingMdxQueries.delete(prompt);
            await fetchAndSwap(
              errorsRef.current,
              previousGenerationsRef.current
            );
          } else {
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
        console.error("[at-loader] Generation failed:", err);
        const path = editor.api.findPath(element);
        if (!path) return;

        editor.tf.withoutNormalizing(() => {
          editor.tf.removeNodes({ at: path });
          editor.tf.insertNodes({ text: "[Error]" }, { at: path });
        });
      }
    };

    fetchAndSwap();
  }, [readOnly, prompt, editor, element, api]);

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
