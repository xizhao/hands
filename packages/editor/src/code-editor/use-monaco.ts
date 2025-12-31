/**
 * Monaco Editor Hook
 *
 * A hook for accessing the Monaco editor instance programmatically.
 */

import type { editor as MonacoEditor } from "monaco-editor";
import { useCallback, useRef, useState } from "react";

export interface UseMonacoOptions {
  /** Called when the editor is ready */
  onReady?: (editor: MonacoEditor.IStandaloneCodeEditor) => void;
}

export interface UseMonacoReturn {
  /** Ref callback to pass to MonacoEditor's onMount prop */
  onMount: (editor: MonacoEditor.IStandaloneCodeEditor) => void;
  /** The editor instance (null until mounted) */
  editor: MonacoEditor.IStandaloneCodeEditor | null;
  /** Whether the editor is mounted and ready */
  isReady: boolean;
  /** Focus the editor */
  focus: () => void;
  /** Get the current value */
  getValue: () => string;
  /** Set the cursor position */
  setCursor: (line: number, column: number) => void;
  /** Reveal a line in the editor */
  revealLine: (line: number) => void;
}

/**
 * Hook for programmatically controlling the Monaco editor.
 *
 * @example
 * ```tsx
 * const { onMount, focus, revealLine } = useMonaco();
 *
 * return (
 *   <MonacoEditor
 *     value={content}
 *     onChange={setContent}
 *     onMount={onMount}
 *   />
 * );
 * ```
 */
export function useMonaco(options: UseMonacoOptions = {}): UseMonacoReturn {
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const [isReady, setIsReady] = useState(false);

  const onMount = useCallback(
    (editor: MonacoEditor.IStandaloneCodeEditor) => {
      editorRef.current = editor;
      setIsReady(true);
      options.onReady?.(editor);
    },
    [options.onReady],
  );

  const focus = useCallback(() => {
    editorRef.current?.focus();
  }, []);

  const getValue = useCallback(() => {
    return editorRef.current?.getValue() ?? "";
  }, []);

  const setCursor = useCallback((line: number, column: number) => {
    const editor = editorRef.current;
    if (editor) {
      editor.setPosition({ lineNumber: line, column });
      editor.focus();
    }
  }, []);

  const revealLine = useCallback((line: number) => {
    editorRef.current?.revealLineInCenter(line);
  }, []);

  return {
    onMount,
    editor: editorRef.current,
    isReady,
    focus,
    getValue,
    setCursor,
    revealLine,
  };
}
