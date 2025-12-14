/**
 * Page Frontmatter Plugin
 *
 * Renders page-title and page-subtitle elements from frontmatter.
 * These elements:
 * - Cannot be deleted (like Notion's title)
 * - Are always at the top of the document
 * - Sync back to frontmatter when edited
 */

import { createPlatePlugin } from "platejs/react";
import type { TElement, Operation } from "platejs";
import React, { useCallback, useRef, useEffect } from "react";
import type { RenderElementProps } from "slate-react";
import { cn } from "../../lib/utils";
import { isPageTitleElement, isPageSubtitleElement } from "../../mdx/types";

// ============================================================================
// Element Components
// ============================================================================

/**
 * Page Title Element - renders as H1, cannot be deleted
 */
function PageTitleElement({
  attributes,
  children,
  element,
}: RenderElementProps) {
  return (
    <h1
      {...attributes}
      className={cn(
        "page-title",
        "text-4xl font-bold text-foreground mb-1",
        "outline-none border-none",
        // Placeholder styling when empty
        "[&:has([data-slate-placeholder])]:text-muted-foreground/50",
      )}
      data-page-title
      placeholder="Untitled"
    >
      {children}
    </h1>
  );
}

/**
 * Page Subtitle Element - renders as subtitle, cannot be deleted
 */
function PageSubtitleElement({
  attributes,
  children,
  element,
}: RenderElementProps) {
  return (
    <p
      {...attributes}
      className={cn(
        "page-subtitle",
        "text-lg text-muted-foreground mb-6",
        "outline-none border-none",
        // Placeholder styling when empty
        "[&:has([data-slate-placeholder])]:text-muted-foreground/40",
      )}
      data-page-subtitle
      placeholder="Add a description..."
    >
      {children}
    </p>
  );
}

// ============================================================================
// Plugin Definition
// ============================================================================

/**
 * Page Title Plugin
 *
 * Handles the page-title element:
 * - Renders as H1 with large text
 * - Cannot be deleted
 * - Always stays at position 0
 */
export const PageTitlePlugin = createPlatePlugin({
  key: "page-title",
  node: {
    component: PageTitleElement,
    isElement: true,
    isVoid: false,
  },
});

/**
 * Page Subtitle Plugin
 *
 * Handles the page-subtitle element:
 * - Renders as subtitle text
 * - Cannot be deleted
 * - Always stays at position 1 (after title)
 */
export const PageSubtitlePlugin = createPlatePlugin({
  key: "page-subtitle",
  node: {
    component: PageSubtitleElement,
    isElement: true,
    isVoid: false,
  },
});

/**
 * Frontmatter Protection Plugin
 *
 * Prevents deletion of page-title and page-subtitle elements.
 * These are managed by the MDX sync system, not user deletion.
 */
export const FrontmatterProtectionPlugin = createPlatePlugin({
  key: "frontmatter-protection",

  extendEditor: ({ editor }) => {
    const origApply = editor.apply as (op: Operation) => void;

    editor.apply = (op: Operation) => {
      // Intercept remove_node operations
      if (op.type === "remove_node") {
        const node = op.node as TElement;

        // Block deletion of page-title
        if (isPageTitleElement(node)) {
          console.debug("[frontmatter-protection] Blocked deletion of page-title");
          return; // Don't apply this operation
        }

        // Block deletion of page-subtitle
        if (isPageSubtitleElement(node)) {
          console.debug("[frontmatter-protection] Blocked deletion of page-subtitle");
          return; // Don't apply this operation
        }
      }

      // Intercept merge_node that would merge into title/subtitle
      if (op.type === "merge_node") {
        const path = op.path;
        // If merging at path [0] or [1], check if it's title/subtitle
        if (path.length === 1 && (path[0] === 0 || path[0] === 1)) {
          const targetNode = editor.children[path[0] - 1] as TElement | undefined;
          if (targetNode && (isPageTitleElement(targetNode) || isPageSubtitleElement(targetNode))) {
            console.debug("[frontmatter-protection] Blocked merge into frontmatter element");
            return;
          }
        }
      }

      // Allow all other operations
      origApply(op);
    };

    return editor;
  },
});

/**
 * Combined frontmatter plugins
 */
export const PageFrontmatterPlugins = [
  PageTitlePlugin,
  PageSubtitlePlugin,
  FrontmatterProtectionPlugin,
];
