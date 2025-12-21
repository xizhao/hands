"use client";

/**
 * PreviewEditor - Read-only editor for previewing MDX content
 *
 * Uses the same plugins as the main Editor, so content looks identical.
 * Designed for previewing AI-generated content before insertion.
 */

import { MarkdownPlugin } from "@platejs/markdown";
import { cn } from "@udecode/cn";
import type { TElement } from "platejs";
import {
  createPlateEditor,
  Plate,
  PlateContent,
  usePlateEditor,
} from "platejs/react";
import { forwardRef, useMemo, type ReactNode } from "react";

import { EditorCorePlugins } from "./plugins/presets";
import { createMarkdownKit } from "./plugins/markdown-kit";

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
    useMemo(() => {
      if (!value) return;

      try {
        const api = editor.getApi(MarkdownPlugin);
        const nodes = api.markdown.deserialize(value);
        if (nodes && nodes.length > 0) {
          editor.tf.setValue(nodes);
        }
      } catch (err) {
        console.error("[PreviewEditor] Failed to parse:", err);
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
