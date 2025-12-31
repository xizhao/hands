"use client";

/**
 * Markdown Code Editor
 *
 * A Monaco-based code editor for editing raw markdown/MDX content.
 * Provides syntax highlighting, diagnostics display, and full editor features.
 */

import { MonacoEditor } from "../code-editor/MonacoEditor";
import type { Diagnostic } from "../code-editor/types";
import { cn } from "../lib/utils";

export interface MarkdownCodeEditorProps {
  /** Raw content value */
  value: string;
  /** Called when content changes */
  onChange?: (value: string) => void;
  /** External diagnostics to display */
  diagnostics?: Diagnostic[];
  /** CSS class for the container */
  className?: string;
  /** Placeholder text */
  placeholder?: string;
  /** Read-only mode */
  readOnly?: boolean;
  /** Theme override */
  theme?: "light" | "dark" | "auto";
}

export function MarkdownCodeEditor({
  value,
  onChange,
  diagnostics,
  className,
  placeholder = "# Your markdown here...",
  readOnly = false,
  theme = "auto",
}: MarkdownCodeEditorProps) {
  return (
    <div className={cn("relative h-full min-h-[200px]", className)}>
      <MonacoEditor
        value={value}
        onChange={onChange}
        diagnostics={diagnostics}
        language="mdx"
        readOnly={readOnly}
        placeholder={placeholder}
        theme={theme}
        className="h-full"
      />
    </div>
  );
}

// Re-export Diagnostic type for convenience
export type { Diagnostic };
