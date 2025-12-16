/**
 * RSC Block Plugin
 *
 * Plate plugin for RSC (React Server Component) blocks.
 * These are special void elements that render JSX content via the RSC system.
 */

import { createPlatePlugin } from "platejs/react";
import type { TElement } from "platejs";
import { RscBlockElementComponent } from "./rsc-block-element";

// ============================================================================
// RSC Block Element Type
// ============================================================================

/** RSC Block element stored in the Plate tree */
export interface RscBlockElement extends TElement {
  type: "rsc-block";
  /** Block source identifier (from src prop) - empty string for new blocks */
  blockId: string;
  /** TSX source code for the block content */
  source: string;
  /** Additional props passed to the block */
  blockProps: Record<string, unknown>;
  /** Stable ID for tracking */
  id: string;
  /** Whether this block is being created/edited (shows shimmer placeholder) */
  editing?: boolean;
  /** Plate requires children, even for void elements */
  children: [{ text: "" }];
}

/** Type guard for RSC block elements */
export function isRscBlockElement(element: TElement): element is RscBlockElement {
  return element.type === "rsc-block";
}

// ============================================================================
// Plugin
// ============================================================================

export const RscBlockPlugin = createPlatePlugin({
  key: "rsc-block",

  node: {
    type: "rsc-block",
    isVoid: true,
    isElement: true,
    component: RscBlockElementComponent,
  },

  extendEditor: ({ editor }) => {
    // Mark rsc-block as void (content is RSC-rendered, not Slate-editable)
    const origIsVoid = editor.isVoid as (element: TElement) => boolean;
    editor.isVoid = (element: TElement) => {
      if (element.type === "rsc-block") return true;
      return origIsVoid(element);
    };

    return editor;
  },
});
