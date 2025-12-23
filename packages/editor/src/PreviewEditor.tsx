"use client";

/**
 * PreviewEditor - Read-only editor for previewing MDX content
 *
 * Uses the same plugins as the main Editor, so content looks identical.
 * Designed for previewing AI-generated content before insertion.
 *
 * Handles streaming/partial content gracefully by normalizing malformed
 * structures (e.g., incomplete tables) before rendering.
 */

import { MarkdownPlugin } from "@platejs/markdown";
import { cn } from "@udecode/cn";
import type { TElement, Descendant, Value } from "platejs";
import {
  Plate,
  PlateContent,
  usePlateEditor,
} from "platejs/react";
import { forwardRef, useMemo, type ReactNode } from "react";

import { EditorCorePlugins } from "./plugins/presets";
import { createMarkdownKit } from "./plugins/markdown-kit";

// ============================================================================
// Node Normalization (for streaming/partial content)
// ============================================================================

/**
 * Recursively normalize nodes to handle malformed/partial structures.
 * This is essential for streaming content where tables, lists, etc.
 * may be incomplete until the stream finishes.
 *
 * Returns Value (TElement[]) suitable for editor.tf.setValue()
 */
function normalizeNodes(nodes: Descendant[]): Value {
  if (!nodes || !Array.isArray(nodes)) {
    return [{ type: "p", children: [{ text: "" }] }] as Value;
  }

  const normalized = nodes
    .filter((node): node is Descendant => {
      // Filter out undefined/null nodes
      if (!node) return false;
      return true;
    })
    .map((node) => normalizeNode(node))
    .filter((node): node is TElement => {
      // Only keep valid elements (not text nodes at top level, not null)
      if (!node) return false;
      if ("text" in node) return false;
      return true;
    });

  // Ensure we always have at least one element
  if (normalized.length === 0) {
    return [{ type: "p", children: [{ text: "" }] }] as Value;
  }

  return normalized as Value;
}

/**
 * Normalize children array (can include text nodes).
 */
function normalizeChildren(children: Descendant[]): Descendant[] {
  if (!children || !Array.isArray(children)) {
    return [{ text: "" }];
  }

  const normalized = children
    .filter((node): node is Descendant => node != null)
    .map((node) => normalizeNode(node))
    .filter((node): node is Descendant => node !== null);

  // Ensure we always have at least one child
  if (normalized.length === 0) {
    return [{ text: "" }];
  }

  return normalized;
}

/**
 * Normalize a single node, fixing common issues with partial content.
 */
function normalizeNode(node: Descendant): Descendant | null {
  if (!node) return null;

  // Text nodes - ensure they have text property
  if ("text" in node) {
    const textNode = node as { text: string; [key: string]: unknown };
    return { ...textNode, text: String(textNode.text ?? "") };
  }

  // Element nodes - must have children array
  const element = node as TElement;
  if (!element.type) {
    return null;
  }

  // Ensure children exists and is an array
  let children = element.children;
  if (!children || !Array.isArray(children)) {
    children = [{ text: "" }];
  }

  // Handle specific element types that need special normalization
  switch (element.type) {
    case "table":
      return normalizeTable(element);
    case "tr":
      return normalizeTableRow(element);
    case "td":
    case "th":
      return normalizeTableCell(element);
    case "ul":
    case "ol":
      return normalizeList(element);
    case "li":
      return normalizeListItem(element);
    default:
      // Generic normalization - recursively normalize children
      return {
        ...element,
        children: normalizeChildren(children),
      };
  }
}

/**
 * Normalize table - ensure all rows are valid
 */
function normalizeTable(element: TElement): Descendant | null {
  const children = element.children;
  if (!children || !Array.isArray(children) || children.length === 0) {
    // Empty table - skip it entirely for now
    return null;
  }

  const validRows = children
    .filter((row): row is TElement => {
      if (!row || typeof row !== "object") return false;
      if (!("type" in row)) return false;
      return row.type === "tr";
    })
    .map((row) => normalizeTableRow(row))
    .filter((row): row is TElement => row !== null);

  if (validRows.length === 0) {
    return null;
  }

  return {
    ...element,
    children: validRows,
  };
}

/**
 * Normalize table row - ensure all cells are valid
 */
function normalizeTableRow(element: TElement): TElement | null {
  const children = element.children;
  if (!children || !Array.isArray(children) || children.length === 0) {
    // Row with no cells - skip it
    return null;
  }

  const validCells = children
    .filter((cell): cell is TElement => {
      if (!cell || typeof cell !== "object") return false;
      if (!("type" in cell)) return false;
      return cell.type === "td" || cell.type === "th";
    })
    .map((cell) => normalizeTableCell(cell))
    .filter((cell): cell is TElement => cell !== null);

  if (validCells.length === 0) {
    return null;
  }

  return {
    ...element,
    children: validCells,
  };
}

/**
 * Normalize table cell - ensure it has content
 */
function normalizeTableCell(element: TElement): TElement | null {
  let children = element.children;
  if (!children || !Array.isArray(children) || children.length === 0) {
    children = [{ text: "" }];
  }

  return {
    ...element,
    children: normalizeChildren(children),
  };
}

/**
 * Normalize list - ensure all items are valid
 */
function normalizeList(element: TElement): Descendant | null {
  const children = element.children;
  if (!children || !Array.isArray(children) || children.length === 0) {
    return null;
  }

  const validItems = children
    .filter((item): item is TElement => {
      if (!item || typeof item !== "object") return false;
      if (!("type" in item)) return false;
      return item.type === "li" || item.type === "lic";
    })
    .map((item) => normalizeListItem(item))
    .filter((item): item is TElement => item !== null);

  if (validItems.length === 0) {
    return null;
  }

  return {
    ...element,
    children: validItems,
  };
}

/**
 * Normalize list item - ensure it has content
 */
function normalizeListItem(element: TElement): TElement | null {
  let children = element.children;
  if (!children || !Array.isArray(children) || children.length === 0) {
    children = [{ text: "" }];
  }

  return {
    ...element,
    children: normalizeChildren(children),
  };
}

// ============================================================================
// Types
// ============================================================================

export interface PreviewEditorProps {
  /** MDX/Markdown content to preview */
  value: string;
  /** Additional CSS class for container */
  className?: string;
  /** Additional CSS class for content area */
  contentClassName?: string;
  /** Wrapper component (e.g., for providers) */
  wrapper?: (props: { children: ReactNode }) => ReactNode;
}

// ============================================================================
// Component
// ============================================================================

export const PreviewEditor = forwardRef<HTMLDivElement, PreviewEditorProps>(
  function PreviewEditor(
    { value, className, contentClassName, wrapper: Wrapper },
    ref
  ) {
    // Build plugins - same as main editor but without copilot
    const plugins = useMemo(
      () => [...EditorCorePlugins, ...createMarkdownKit({})],
      []
    );

    // Create editor instance
    const editor = usePlateEditor({
      plugins,
      value: [{ type: "p", children: [{ text: "" }] }],
    });

    // Parse MDX and set editor value
    // Normalizes nodes to handle streaming/partial content gracefully
    useMemo(() => {
      if (!value) return;

      try {
        const api = editor.getApi(MarkdownPlugin);
        const nodes = api.markdown.deserialize(value);
        if (nodes && nodes.length > 0) {
          // Normalize nodes to fix malformed structures from partial streaming
          const normalized = normalizeNodes(nodes);
          if (normalized.length > 0) {
            editor.tf.setValue(normalized);
          }
        }
      } catch (err) {
        // Silently handle parse errors during streaming - content will render
        // correctly once the stream completes
        if (process.env.NODE_ENV === "development") {
          console.debug("[PreviewEditor] Parse error (expected during streaming):", err);
        }
      }
    }, [value, editor]);

    const content = (
      <div ref={ref} className={cn("preview-editor", className)}>
        <Plate editor={editor} readOnly>
          <PlateContent
            readOnly
            className={cn(
              "prose prose-sm dark:prose-invert max-w-none",
              contentClassName
            )}
          />
        </Plate>
      </div>
    );

    return Wrapper ? <Wrapper>{content}</Wrapper> : content;
  }
);

export default PreviewEditor;
