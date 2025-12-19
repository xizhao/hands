/**
 * At Menu - AI completion menu
 *
 * Type "@" to trigger:
 * - Debounces query while typing
 * - Shows preview if result is ready, or "Insert →" while loading
 * - Inserts content directly or shows inline loader
 */

import type { PlateElementProps } from "platejs/react";
import { PlateElement, useEditorRef } from "platejs/react";
import { MarkdownPlugin } from "@platejs/markdown";
import { useCallback, useEffect, useRef, useState } from "react";
import { trpc } from "@/lib/trpc";
import { useManifest } from "@/hooks/useRuntimeState";
import { createAtLoaderElement, pendingMdxQueries } from "../plugins/at-kit";
import {
  InlineCombobox,
  InlineComboboxContent,
  InlineComboboxEmpty,
  InlineComboboxGroup,
  InlineComboboxInput,
  InlineComboboxItem,
  useInlineComboboxSearchValue,
} from "./inline-combobox";

// ============================================================================
// Insert Item - Prefetches while typing, shows preview when ready
// ============================================================================

function InsertItem() {
  const editor = useEditorRef();
  const searchValue = useInlineComboboxSearchValue();
  const { data: manifest } = useManifest();
  const generateMdx = trpc.ai.generateMdx.useMutation();
  const generateMdxRef = useRef(generateMdx);
  generateMdxRef.current = generateMdx;

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [prefetchedMdx, setPrefetchedMdx] = useState<string | null>(null);
  const [prefetchedPrompt, setPrefetchedPrompt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const hasSearchValue = searchValue && searchValue.trim().length > 0;
  const prompt = hasSearchValue ? searchValue.trim() : "";

  // Debounced prefetch while typing
  useEffect(() => {
    if (!prompt) {
      setPrefetchedMdx(null);
      setPrefetchedPrompt(null);
      setIsLoading(false);
      return;
    }

    // If we already have the result for this prompt, don't refetch
    if (prefetchedPrompt === prompt && prefetchedMdx) {
      return;
    }

    // Clear previous debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    // Reset state for new prompt
    setPrefetchedMdx(null);
    setPrefetchedPrompt(null);

    debounceRef.current = setTimeout(() => {
      // Check if already have a pending query for this prompt
      let queryPromise = pendingMdxQueries.get(prompt);

      if (!queryPromise) {
        const tables = (manifest?.tables ?? []).map(t => ({
          name: t.name,
          columns: t.columns,
        }));

        console.log('[at-menu] Prefetching MDX for:', prompt);
        queryPromise = generateMdxRef.current.mutateAsync({ prompt, tables });
        pendingMdxQueries.set(prompt, queryPromise);

        // Clean up cache after resolution
        queryPromise.finally(() => {
          setTimeout(() => pendingMdxQueries.delete(prompt), 5000);
        });
      }

      setIsLoading(true);

      // Track the result for this prompt
      queryPromise
        .then((result) => {
          console.log('[at-menu] Got prefetch result:', result.mdx);
          setPrefetchedMdx(result.mdx);
          setPrefetchedPrompt(prompt);
        })
        .catch((err) => {
          console.error('[at-menu] Prefetch failed:', err);
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 300);

    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, [prompt, manifest?.tables, prefetchedPrompt, prefetchedMdx]);

  const handleInsert = useCallback(() => {
    if (!hasSearchValue) return;

    // If we have prefetched result, insert it directly
    if (prefetchedMdx) {
      try {
        const api = editor.getApi(MarkdownPlugin);
        let nodes = api.markdown.deserialize(prefetchedMdx);

        // If wrapped in a single paragraph, extract children for inline insertion
        if (nodes?.length === 1 && nodes[0].type === 'p' && nodes[0].children) {
          nodes = nodes[0].children;
        }

        if (nodes?.length > 0) {
          editor.tf.insertNodes(nodes as any);
          editor.tf.move({ unit: 'offset' });
        }
      } catch (err) {
        console.error('[at-menu] Failed to deserialize, inserting as text:', err);
        editor.tf.insertText(prefetchedMdx);
      }
    } else {
      // No prefetch ready, insert loader element
      const loaderNode = createAtLoaderElement(prompt);
      editor.tf.insertNodes(loaderNode);
      editor.tf.move({ unit: 'offset' });
    }
  }, [editor, prompt, hasSearchValue, prefetchedMdx]);

  if (!hasSearchValue) {
    return null;
  }

  // Show preview if we have prefetched result
  if (prefetchedMdx) {
    // Truncate for display
    const preview = prefetchedMdx.length > 60
      ? prefetchedMdx.slice(0, 60) + '...'
      : prefetchedMdx;

    return (
      <InlineComboboxItem
        value={`insert-${searchValue}`}
        alwaysShow
        onClick={handleInsert}
        className="!py-1.5"
      >
        <span className="text-sm">{preview}</span>
      </InlineComboboxItem>
    );
  }

  return (
    <InlineComboboxItem
      value={`insert-${searchValue}`}
      alwaysShow
      onClick={handleInsert}
      className="!py-1.5"
    >
      <span className="text-sm text-muted-foreground">
        {isLoading ? 'Loading...' : 'Insert →'}
      </span>
    </InlineComboboxItem>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function AtInputElement(props: PlateElementProps) {
  const { children, element } = props;

  return (
    <PlateElement {...props} as="span">
      <InlineCombobox element={element} trigger="@">
        <InlineComboboxInput
          placeholder="What do you need?"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
        />

        <InlineComboboxContent variant="slash">
          <InlineComboboxGroup>
            <InsertItem />
          </InlineComboboxGroup>
          <InlineComboboxEmpty>
            Type to generate content...
          </InlineComboboxEmpty>
        </InlineComboboxContent>
      </InlineCombobox>

      {children}
    </PlateElement>
  );
}
