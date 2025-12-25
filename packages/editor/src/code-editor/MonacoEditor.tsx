"use client";

/**
 * Monaco Editor Component
 *
 * A Monaco-based code editor for editing raw MDX/markdown content
 * with syntax highlighting and external diagnostics support.
 */

import MonacoReact, { type Monaco } from "@monaco-editor/react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { editor } from "monaco-editor";

import { cn } from "../lib/utils";
import { registerMdxLanguage } from "./mdx-language";
import { defineEditorThemes, getThemeName, updateEditorThemes } from "./themes";
import type { Diagnostic, MonacoEditorProps } from "./types";

// Track if we've initialized Monaco globally
let monacoInitialized = false;

/**
 * Convert our severity to Monaco severity.
 */
function severityToMonaco(
  monaco: Monaco,
  severity: Diagnostic["severity"]
): number {
  switch (severity) {
    case "error":
      return monaco.MarkerSeverity.Error;
    case "warning":
      return monaco.MarkerSeverity.Warning;
    case "info":
      return monaco.MarkerSeverity.Info;
    case "hint":
      return monaco.MarkerSeverity.Hint;
    default:
      return monaco.MarkerSeverity.Info;
  }
}

/**
 * Monaco-based code editor for MDX/Markdown editing.
 */
export function MonacoEditor({
  value,
  onChange,
  diagnostics,
  language = "mdx",
  readOnly = false,
  className,
  theme = "auto",
  placeholder,
  onMount,
}: MonacoEditorProps) {
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const [isDarkMode, setIsDarkMode] = useState(false);

  // Detect system dark mode
  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
    setIsDarkMode(mediaQuery.matches);

    const handler = (e: MediaQueryListEvent) => setIsDarkMode(e.matches);
    mediaQuery.addEventListener("change", handler);
    return () => mediaQuery.removeEventListener("change", handler);
  }, []);

  // Update theme when preference changes
  // Re-defines themes to pick up new CSS variable values
  useEffect(() => {
    if (monacoRef.current && editorRef.current) {
      // Re-define themes to read current CSS variables
      updateEditorThemes(monacoRef.current);
      const themeName = getThemeName(theme, isDarkMode);
      monacoRef.current.editor.setTheme(themeName);
    }
  }, [theme, isDarkMode]);

  // Handle Monaco initialization
  const handleBeforeMount = useCallback((monaco: Monaco) => {
    if (!monacoInitialized) {
      defineEditorThemes(monaco);
      registerMdxLanguage(monaco);
      monacoInitialized = true;
    }
    monacoRef.current = monaco;
  }, []);

  // Handle editor mount
  const handleEditorMount = useCallback(
    (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
      editorRef.current = editor;
      monacoRef.current = monaco;

      // Set initial theme
      const themeName = getThemeName(theme, isDarkMode);
      monaco.editor.setTheme(themeName);

      // Call external onMount if provided
      onMount?.(editor);
    },
    [theme, isDarkMode, onMount]
  );

  // Handle content changes
  const handleChange = useCallback(
    (newValue: string | undefined) => {
      if (newValue !== undefined && onChange) {
        onChange(newValue);
      }
    },
    [onChange]
  );

  // Apply diagnostics as markers
  useEffect(() => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;

    const model = editor.getModel();
    if (!model) return;

    if (!diagnostics || diagnostics.length === 0) {
      // Clear all markers
      monaco.editor.setModelMarkers(model, "external", []);
      return;
    }

    // Convert diagnostics to Monaco markers
    const markers = diagnostics.map((d) => ({
      startLineNumber: d.line,
      startColumn: d.column,
      endLineNumber: d.endLine ?? d.line,
      endColumn: d.endColumn ?? d.column + 1,
      message: d.message,
      severity: severityToMonaco(monaco, d.severity),
      source: d.source,
      code: d.code?.toString(),
    }));

    monaco.editor.setModelMarkers(model, "external", markers);
  }, [diagnostics]);

  return (
    <div className={cn("h-full w-full", className)}>
      <MonacoReact
        value={value}
        onChange={handleChange}
        language={language}
        theme={getThemeName(theme, isDarkMode)}
        beforeMount={handleBeforeMount}
        onMount={handleEditorMount}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 12,
          fontFamily:
            "ui-monospace, SFMono-Regular, SF Mono, Menlo, Consolas, Liberation Mono, monospace",
          lineNumbers: "on",
          lineNumbersMinChars: 3,
          glyphMargin: false,
          folding: true,
          foldingStrategy: "indentation",
          wordWrap: "on",
          wrappingIndent: "same",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          insertSpaces: true,
          renderLineHighlight: "line",
          cursorBlinking: "blink",
          cursorSmoothCaretAnimation: "off",
          smoothScrolling: false,
          padding: { top: 16, bottom: 16 },
          overviewRulerBorder: false,
          hideCursorInOverviewRuler: true,
          renderWhitespace: "selection",
          guides: {
            indentation: true,
            bracketPairs: true,
          },
          bracketPairColorization: {
            enabled: true,
          },
          // Accessibility
          accessibilitySupport: "auto",
          // Placeholder-like behavior (show when empty)
          placeholder: placeholder,
        }}
      />
    </div>
  );
}
