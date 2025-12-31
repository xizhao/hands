/**
 * Frontmatter - Title/Description header for page editor
 *
 * Renders editable title and description fields above the Plate editor.
 * Uses contentEditable for simple single-line editing.
 *
 * Keyboard navigation:
 * - Title: Enter/ArrowDown → focus subtitle
 * - Subtitle: Enter/ArrowDown → focus editor, ArrowUp → focus title
 * - Editor: ArrowUp at start → focus subtitle
 */

import { useCallback, useEffect, useRef } from "react";
import YAML from "yaml";
import { cn } from "./lib/utils";

// ============================================================================
// Types
// ============================================================================

export interface Frontmatter {
  title?: string;
  description?: string;
  /** Enable table of contents sidebar (default: true) */
  toc?: boolean;
  [key: string]: unknown;
}

export interface FrontmatterParseResult {
  frontmatter: Frontmatter;
  contentStart: number;
  error?: string;
}

export interface FrontmatterHeaderProps {
  /** Current frontmatter values */
  frontmatter: Frontmatter;
  /** Callback when frontmatter changes */
  onFrontmatterChange: (frontmatter: Frontmatter) => void;
  /** Callback to focus the Plate editor */
  onFocusEditor: () => void;
  /** Ref for subtitle element (for keyboard navigation from editor) */
  subtitleRef?: React.RefObject<HTMLDivElement | null>;
  /** Use compact styling (smaller text, less padding) */
  compact?: boolean;
  /** Show title field (default: true, set false when title is shown elsewhere like tabs) */
  showTitle?: boolean;
  /** Show description field (default: true, set false when using SpecBar) */
  showDescription?: boolean;
  /** CSS class name */
  className?: string;
}

// ============================================================================
// Parsing Utilities
// ============================================================================

const FRONTMATTER_REGEX = /^---\s*\n([\s\S]*?)\n---\s*\n?/;

/**
 * Parse YAML frontmatter from MDX source
 */
export function parseFrontmatter(source: string): FrontmatterParseResult {
  const match = source.match(FRONTMATTER_REGEX);

  if (!match) {
    return {
      frontmatter: {},
      contentStart: 0,
    };
  }

  const yamlContent = match[1];
  const fullMatch = match[0];

  try {
    const parsed = YAML.parse(yamlContent);
    const frontmatter: Frontmatter = typeof parsed === "object" && parsed !== null ? parsed : {};

    return {
      frontmatter,
      contentStart: fullMatch.length,
    };
  } catch (err) {
    return {
      frontmatter: {},
      contentStart: fullMatch.length,
      error: err instanceof Error ? err.message : "Failed to parse frontmatter",
    };
  }
}

/**
 * Serialize frontmatter to YAML string with delimiters
 */
export function serializeFrontmatter(frontmatter: Frontmatter): string {
  const cleaned = Object.fromEntries(
    Object.entries(frontmatter).filter(([, v]) => v !== undefined),
  );

  if (Object.keys(cleaned).length === 0) {
    return "";
  }

  const yaml = YAML.stringify(cleaned, {
    indent: 2,
    lineWidth: 0,
  }).trim();

  return `---\n${yaml}\n---\n\n`;
}

/**
 * Update frontmatter in source string
 */
export function updateFrontmatter(source: string, frontmatter: Frontmatter): string {
  const { contentStart } = parseFrontmatter(source);
  const content = source.slice(contentStart);
  return serializeFrontmatter(frontmatter) + content;
}

/**
 * Get content without frontmatter
 */
export function stripFrontmatter(source: string): string {
  const { contentStart } = parseFrontmatter(source);
  return source.slice(contentStart);
}

// ============================================================================
// Component
// ============================================================================

export function FrontmatterHeader({
  frontmatter,
  onFrontmatterChange,
  onFocusEditor,
  subtitleRef: externalSubtitleRef,
  compact = false,
  showTitle = true,
  showDescription = true,
  className,
}: FrontmatterHeaderProps) {
  const titleRef = useRef<HTMLDivElement>(null);
  const internalSubtitleRef = useRef<HTMLDivElement>(null);
  const subtitleRef = externalSubtitleRef ?? internalSubtitleRef;

  // Sync frontmatter to contentEditable elements
  useEffect(() => {
    if (titleRef.current && titleRef.current.textContent !== (frontmatter.title ?? "")) {
      titleRef.current.textContent = frontmatter.title ?? "";
    }
    if (
      subtitleRef.current &&
      subtitleRef.current.textContent !== (frontmatter.description ?? "")
    ) {
      subtitleRef.current.textContent = frontmatter.description ?? "";
    }
  }, [frontmatter.title, frontmatter.description, subtitleRef.current]);

  // Handle field changes
  const handleFieldChange = useCallback(
    (field: "title" | "description", value: string) => {
      const newFrontmatter = { ...frontmatter };
      if (value) {
        newFrontmatter[field] = value;
      } else {
        delete newFrontmatter[field];
      }
      onFrontmatterChange(newFrontmatter);
    },
    [frontmatter, onFrontmatterChange],
  );

  // Title keyboard handler
  const handleTitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        if (showDescription && subtitleRef.current) {
          subtitleRef.current.focus();
          // Move cursor to start
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(subtitleRef.current);
          range.collapse(true);
          sel?.removeAllRanges();
          sel?.addRange(range);
        } else {
          // No description - go directly to editor
          onFocusEditor();
        }
      }
    },
    [showDescription, onFocusEditor, subtitleRef.current],
  );

  // Subtitle keyboard handler
  const handleSubtitleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === "ArrowDown") {
        e.preventDefault();
        onFocusEditor();
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        titleRef.current?.focus();
        // Move cursor to end
        if (titleRef.current) {
          const range = document.createRange();
          const sel = window.getSelection();
          range.selectNodeContents(titleRef.current);
          range.collapse(false);
          sel?.removeAllRanges();
          sel?.addRange(range);
        }
      }
    },
    [onFocusEditor],
  );

  // Paste as plain text only
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain").replace(/\n/g, " ");
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(text));
      range.collapse(false);
    }
  }, []);

  // If neither title nor description is shown, render nothing
  if (!showTitle && !showDescription) {
    return null;
  }

  return (
    <div className={cn(compact ? "pt-4" : "pt-8", className)}>
      {/* Title - hidden when title is shown elsewhere (e.g., in tabs) */}
      {showTitle && (
        <div
          ref={titleRef}
          contentEditable
          suppressContentEditableWarning
          className={cn(
            "font-semibold outline-none",
            compact ? "text-2xl" : "text-4xl font-bold",
            "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40",
          )}
          data-placeholder="Untitled"
          onKeyDown={handleTitleKeyDown}
          onBlur={(e) => handleFieldChange("title", e.currentTarget.textContent ?? "")}
          onPaste={handlePaste}
        />
      )}

      {/* Description - hidden when SpecBar is used */}
      {showDescription && (
        <div
          ref={subtitleRef}
          contentEditable
          suppressContentEditableWarning
          className={cn(
            "text-muted-foreground/70 outline-none",
            compact ? "text-sm mt-0.5" : "text-lg mt-1",
            "empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30",
          )}
          data-placeholder="Add a description..."
          onKeyDown={handleSubtitleKeyDown}
          onBlur={(e) => handleFieldChange("description", e.currentTarget.textContent ?? "")}
          onPaste={handlePaste}
        />
      )}
    </div>
  );
}
