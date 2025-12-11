/**
 * Block Editor Sync Hook
 *
 * Orchestrates loading and saving between:
 * - Plate document (visual editor state)
 * - BlockModel (intermediate representation)
 * - TSX source code (persisted file)
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import type { TElement } from 'platejs';
import { useBlockSource } from '@/lib/blocks-client';
import { plateDocumentToJsxTree } from './converters/plate-to-model';
import { createEmptyDocument } from './converters/model-to-plate';
import { parseBlockSourceToPlate, isValidBlockSource } from './parsers/source-parser';

// Debounce delay for auto-save (ms)
const AUTO_SAVE_DELAY = 1500;

interface UseBlockEditorSyncOptions {
  /** Block ID to edit */
  blockId: string;
  /** Callback when document changes */
  onChange?: (document: TElement[]) => void;
}

interface UseBlockEditorSyncReturn {
  /** Current Plate document */
  document: TElement[];
  /** Whether document is loading */
  isLoading: boolean;
  /** Whether there are unsaved changes */
  hasUnsavedChanges: boolean;
  /** Whether save is in progress */
  isSaving: boolean;
  /** Error message if any */
  error: string | null;
  /** Current source code (for debugging/preview) */
  source: string | null;
  /** File path on disk */
  filePath: string | null;
  /** Update the document (triggers auto-save) */
  setDocument: (document: TElement[]) => void;
  /** Manually save the document */
  save: () => Promise<void>;
  /** Discard changes and reload from source */
  discard: () => void;
}

/**
 * Hook for syncing Plate editor with block source files
 *
 * Handles:
 * - Loading source → parsing → converting to Plate
 * - Converting Plate → model → generating source
 * - Debounced auto-save
 * - Dirty state tracking
 */
export function useBlockEditorSync({
  blockId,
  onChange,
}: UseBlockEditorSyncOptions): UseBlockEditorSyncReturn {
  // Source hook for loading/saving
  const {
    source,
    filePath,
    isLoading: isSourceLoading,
    save: saveSource,
    invalidate,
  } = useBlockSource(blockId);

  // Local state
  const [document, setDocumentInternal] = useState<TElement[]>(createEmptyDocument());
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs for debouncing
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastSourceRef = useRef<string | null>(null);

  // Parse source to document when source loads
  useEffect(() => {
    if (source && source !== lastSourceRef.current) {
      lastSourceRef.current = source;

      try {
        // Parse the TSX source into a Plate document
        if (isValidBlockSource(source)) {
          const parsedDoc = parseBlockSourceToPlate(source);
          setDocumentInternal(parsedDoc);
        } else {
          // Not a valid block file - start with empty document
          console.warn('[useBlockEditorSync] Source is not a valid block file');
          setDocumentInternal(createEmptyDocument());
        }
        setHasUnsavedChanges(false);
        setError(null);
      } catch (err) {
        console.error('[useBlockEditorSync] Failed to parse block:', err);
        setError(`Failed to parse block: ${err}`);
        // Fall back to empty document on parse error
        setDocumentInternal(createEmptyDocument());
      }
    }
  }, [source]);

  // Generate source from document
  const generateSource = useCallback((doc: TElement[]): string => {
    try {
      const jsxTree = plateDocumentToJsxTree(doc);

      // Generate basic TSX template
      // TODO: Use proper code generator from block-editor package
      const componentBody = generateJsxString(jsxTree);

      return `import { BlockFn } from "@hands/stdlib";

export default (async (ctx) => {
  return (
    ${componentBody}
  );
}) satisfies BlockFn;
`;
    } catch (err) {
      console.error('[useBlockEditorSync] Source generation failed:', err);
      return '';
    }
  }, []);

  // Save handler
  const save = useCallback(async () => {
    if (!hasUnsavedChanges) return;

    setIsSaving(true);
    setError(null);

    try {
      const newSource = generateSource(document);

      if (!newSource) {
        throw new Error('Failed to generate source code');
      }

      const result = await saveSource(newSource);

      if (result.success) {
        lastSourceRef.current = newSource;
        setHasUnsavedChanges(false);
      } else {
        throw new Error(result.error || 'Save failed');
      }
    } catch (err) {
      setError(`Save failed: ${err}`);
    } finally {
      setIsSaving(false);
    }
  }, [document, hasUnsavedChanges, generateSource, saveSource]);

  // Document change handler with debounced auto-save
  const setDocument = useCallback((newDocument: TElement[]) => {
    setDocumentInternal(newDocument);
    setHasUnsavedChanges(true);

    // Notify parent
    onChange?.(newDocument);

    // Clear existing timeout
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Schedule auto-save
    saveTimeoutRef.current = setTimeout(() => {
      // Note: Can't call save() directly due to stale closure
      // The actual save will be triggered by the effect below
    }, AUTO_SAVE_DELAY);
  }, [onChange]);

  // Auto-save effect
  useEffect(() => {
    if (hasUnsavedChanges && !isSaving) {
      const timeout = setTimeout(() => {
        save();
      }, AUTO_SAVE_DELAY);

      return () => clearTimeout(timeout);
    }
  }, [hasUnsavedChanges, isSaving, save]);

  // Discard handler
  const discard = useCallback(() => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    // Reload from source
    invalidate();
    setHasUnsavedChanges(false);
    setError(null);
  }, [invalidate]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, []);

  return {
    document,
    isLoading: isSourceLoading,
    hasUnsavedChanges,
    isSaving,
    error,
    source: source ?? null,
    filePath: filePath ?? null,
    setDocument,
    save,
    discard,
  };
}

/**
 * Generate JSX string from JsxNode tree
 * This is a simplified version - full implementation should use recast
 */
function generateJsxString(node: {
  type: string;
  tagName?: string;
  text?: string;
  expression?: string;
  props?: Record<string, { type: string; value: unknown }>;
  children?: unknown[];
}): string {
  if (node.type === 'text') {
    return node.text || '';
  }

  if (node.type === 'expression') {
    return `{${node.expression}}`;
  }

  if (node.type === 'fragment') {
    const children = (node.children as typeof node[] || [])
      .map(generateJsxString)
      .filter(Boolean)
      .join('\n    ');
    return `<>\n    ${children}\n  </>`;
  }

  if (node.type === 'element' && node.tagName) {
    const tag = node.tagName;
    const props = node.props || {};
    const children = node.children as typeof node[] || [];

    // Generate props string
    const propsStr = Object.entries(props)
      .map(([key, propValue]) => {
        const val = propValue.value;
        if (propValue.type === 'literal') {
          if (typeof val === 'string') {
            return `${key}="${val}"`;
          }
          return `${key}={${JSON.stringify(val)}}`;
        }
        return `${key}={${val}}`;
      })
      .join(' ');

    const propsWithSpace = propsStr ? ` ${propsStr}` : '';

    if (children.length === 0) {
      return `<${tag}${propsWithSpace} />`;
    }

    const childrenStr = children
      .map(generateJsxString)
      .filter(Boolean)
      .join('\n      ');

    return `<${tag}${propsWithSpace}>\n      ${childrenStr}\n    </${tag}>`;
  }

  return '';
}
