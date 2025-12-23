/**
 * Code Editor Types
 *
 * Type definitions for the Monaco-based code editor.
 */

/**
 * Represents a diagnostic message (error, warning, etc.) to display in the editor.
 * These are typically provided by external tools like TypeScript or ESLint.
 */
export interface Diagnostic {
  /** Line number (1-indexed) */
  line: number;
  /** Column number (1-indexed) */
  column: number;
  /** End line number (optional, defaults to line) */
  endLine?: number;
  /** End column number (optional) */
  endColumn?: number;
  /** The diagnostic message to display */
  message: string;
  /** Severity level */
  severity: "error" | "warning" | "info" | "hint";
  /** Source of the diagnostic (e.g., "typescript", "eslint") */
  source?: string;
  /** Optional error code */
  code?: string | number;
}

/**
 * Props for the MonacoEditor component.
 */
export interface MonacoEditorProps {
  /** Raw file content (including frontmatter if present) */
  value: string;
  /** Called when content changes */
  onChange?: (value: string) => void;
  /** External diagnostics to display (from tsc, eslint, etc.) */
  diagnostics?: Diagnostic[];
  /** Language mode for syntax highlighting */
  language?: "mdx" | "markdown" | "typescript" | "tsx" | "javascript" | "jsx";
  /** Read-only mode */
  readOnly?: boolean;
  /** CSS class for the container */
  className?: string;
  /** Theme override (auto uses system preference) */
  theme?: "light" | "dark" | "auto";
  /** Placeholder text when empty */
  placeholder?: string;
  /** Called when editor is mounted */
  onMount?: (editor: unknown) => void;
}
