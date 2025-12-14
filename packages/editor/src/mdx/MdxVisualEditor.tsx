/**
 * MDX Visual Editor
 *
 * Top-level editor component for MDX files.
 * Handles MDX source ↔ Plate value synchronization.
 *
 * Architecture:
 * - MDX source is the single source of truth
 * - Source changes → Plate value is recomputed
 * - Plate changes → MDX is serialized back
 * - Title/description from frontmatter are simple contentEditable fields
 *   above the Plate editor (single-line, unstyled)
 */

import type { Value } from "platejs";
import {
  createPlatePlugin,
  Plate,
  PlateContainer,
  PlateContent,
  usePlateEditor,
} from "platejs/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Operation } from "slate";
import { cn } from "../lib/utils";
import { elementFallbackRenderer } from "../plate/plugins/element-plugin";
import { MdxEditorKit } from "../plate/plugins/mdx-kit";
import { parseMdx } from "./parser";
import { serializeMdx } from "./serializer";
import type { MdxFrontmatter, MdxParseResult } from "./types";

// ============================================================================
// Props
// ============================================================================

export interface MdxVisualEditorProps {
  /** MDX source string */
  source: string;
  /** Callback when source changes */
  onSourceChange: (source: string) => void;
  /** Callback when frontmatter changes */
  onFrontmatterChange?: (frontmatter: MdxFrontmatter) => void;
  /** Current page ID (slug) for rename functionality */
  pageId?: string;
  /** Callback when page should be renamed (title → slug sync) */
  onRename?: (newSlug: string) => Promise<boolean>;
  /** Runtime port for RSC rendering */
  runtimePort?: number;
  /** Worker port for RSC rendering */
  workerPort?: number;
  /** CSS class name */
  className?: string;
  /** Whether content is being refreshed (shows at reduced opacity) */
  isRefreshing?: boolean;
}

// ============================================================================
// Internal State
// ============================================================================

interface MdxSyncState {
  source: string;
  parseResult: MdxParseResult;
  isSyncing: boolean;
  onSourceChange: (source: string) => void;
  onFrontmatterChange?: (frontmatter: MdxFrontmatter) => void;
}

// ============================================================================
// Component
// ============================================================================

export function MdxVisualEditor({
  source,
  onSourceChange,
  onFrontmatterChange,
  pageId,
  onRename,
  runtimePort = 55000,
  workerPort = 55200,
  className,
  isRefreshing = false,
}: MdxVisualEditorProps) {
  // Refs for contentEditable elements
  const titleRef = useRef<HTMLDivElement>(null);
  const subtitleRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);

  // Refs for operation tracking
  const stateRef = useRef<MdxSyncState>({
    source,
    parseResult: parseMdx(source),
    isSyncing: false,
    onSourceChange,
    onFrontmatterChange,
  });

  // Update callback refs
  stateRef.current.onSourceChange = onSourceChange;
  stateRef.current.onFrontmatterChange = onFrontmatterChange;

  // Parse source and create initial Plate value
  const initialValue = useMemo(() => {
    const parseResult = parseMdx(source);
    stateRef.current.parseResult = parseResult;
    stateRef.current.source = source;
    return parseResult.value;
  }, []); // Only on mount

  // Sync title/subtitle from source to contentEditable elements
  useEffect(() => {
    const { frontmatter } = stateRef.current.parseResult;
    if (titleRef.current && titleRef.current.textContent !== (frontmatter.title ?? "")) {
      titleRef.current.textContent = frontmatter.title ?? "";
    }
    if (subtitleRef.current && subtitleRef.current.textContent !== (frontmatter.description ?? "")) {
      subtitleRef.current.textContent = frontmatter.description ?? "";
    }
  }, [source]);

  // Handle frontmatter field changes
  const handleFrontmatterChange = useCallback((field: "title" | "description", value: string) => {
    const state = stateRef.current;
    const newFrontmatter = { ...state.parseResult.frontmatter };

    if (value) {
      newFrontmatter[field] = value;
    } else {
      delete newFrontmatter[field];
    }

    // Update parse result
    state.parseResult = { ...state.parseResult, frontmatter: newFrontmatter };

    // Reserialize with new frontmatter
    const newSource = serializeMdx(state.parseResult.value, newFrontmatter);
    state.source = newSource;
    state.onSourceChange(newSource);
    state.onFrontmatterChange?.(newFrontmatter);
  }, []);

  // Handle title blur - update frontmatter and trigger rename if needed
  const handleTitleBlur = useCallback((e: React.FocusEvent<HTMLDivElement>) => {
    const newTitle = e.currentTarget.textContent ?? "";
    handleFrontmatterChange("title", newTitle);

    // Sync title to slug if rename callback provided
    if (onRename && pageId) {
      const newSlug = slugify(newTitle);
      // Only rename if slug changed and is valid
      if (newSlug && newSlug !== pageId && /^[a-z0-9][a-z0-9-]*$/.test(newSlug)) {
        onRename(newSlug).catch((err) => {
          console.error("[MdxEditor] Failed to rename page:", err);
        });
      }
    }
  }, [handleFrontmatterChange, onRename, pageId]);

  // Handle keyboard navigation between title, subtitle, and Plate
  const handleTitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      subtitleRef.current?.focus();
      // Move cursor to start
      if (subtitleRef.current) {
        const range = document.createRange();
        const sel = window.getSelection();
        range.selectNodeContents(subtitleRef.current);
        range.collapse(true);
        sel?.removeAllRanges();
        sel?.addRange(range);
      }
    }
  }, []);

  const handleSubtitleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === "ArrowDown") {
      e.preventDefault();
      // Focus Plate editor
      const ed = editorRef.current;
      if (ed) {
        ed.tf.focus();
        // Move to start of first block
        ed.tf.select({ path: [0, 0], offset: 0 });
      }
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
  }, []);

  // Handle Up arrow from Plate to move to subtitle
  const handlePlateKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "ArrowUp") {
      // Check if cursor is at start of first block
      const ed = editorRef.current;
      if (!ed) return;
      const { selection } = ed;
      if (selection) {
        const [start] = ed.api.edges(selection);
        // Check if at path [0, 0] offset 0
        if (start.path[0] === 0 && start.offset === 0) {
          e.preventDefault();
          subtitleRef.current?.focus();
          // Move cursor to end
          if (subtitleRef.current) {
            const range = document.createRange();
            const sel = window.getSelection();
            range.selectNodeContents(subtitleRef.current);
            range.collapse(false);
            sel?.removeAllRanges();
            sel?.addRange(range);
          }
        }
      }
    }
  }, []);

  // Create the MDX sync plugin that handles Plate → MDX serialization
  const MdxSyncPlugin = useMemo(
    () =>
      createPlatePlugin({
        key: "mdx-sync",
        extendEditor: ({ editor }) => {
          const origApply = editor.apply as (op: Operation) => void;

          // Store runtime ports on editor for RSC blocks
          (editor as any).runtimePort = runtimePort;
          (editor as any).workerPort = workerPort;

          editor.apply = (op: Operation) => {
            const state = stateRef.current;

            // If currently syncing from external source, just apply normally
            if (state.isSyncing) {
              return origApply(op);
            }

            // Skip selection-only operations
            if (op.type === "set_selection") {
              return origApply(op);
            }

            // Apply to Slate first
            origApply(op);

            // For significant changes, serialize back to MDX
            if (shouldSerialize(op)) {
              // Serialize current Plate value to MDX
              const value = editor.children as Value;
              const newSource = serializeMdx(value, state.parseResult.frontmatter);

              if (newSource !== state.source) {
                state.source = newSource;
                state.parseResult = parseMdx(newSource);
                state.onSourceChange(newSource);

                console.debug("[mdx-sync] Serialized MDX after operation:", op.type);
              }
            }
          };

          return editor;
        },
      }),
    [runtimePort, workerPort],
  );

  // Create editor with all plugins
  const editor = usePlateEditor({
    plugins: [...MdxEditorKit, MdxSyncPlugin],
    value: initialValue,
  });

  // Store editor ref for keyboard handlers
  editorRef.current = editor;

  // SOURCE IS TRUTH: When source changes externally, overwrite Plate
  useEffect(() => {
    const state = stateRef.current;

    // Only update if source actually changed
    if (source === state.source) return;

    console.debug("[MdxEditor] Source changed externally, syncing to Plate");

    // Mark that we're syncing to prevent operation feedback
    state.isSyncing = true;

    try {
      const parseResult = parseMdx(source);

      // Notify frontmatter change if callback provided
      if (JSON.stringify(parseResult.frontmatter) !== JSON.stringify(state.parseResult.frontmatter)) {
        state.onFrontmatterChange?.(parseResult.frontmatter);
      }

      // Only update Plate if parsing succeeded
      if (parseResult.errors.length === 0) {
        // Update refs
        state.source = source;
        state.parseResult = parseResult;

        // Overwrite Plate value completely
        editor.tf.setValue(parseResult.value);

        console.debug("[MdxEditor] Synced source to Plate successfully");
      } else {
        // Parse failed - still update source ref but don't touch Plate
        state.source = source;
        console.debug("[MdxEditor] Parse failed, keeping Plate state:", parseResult.errors);
      }
    } catch (err) {
      console.error("[MdxEditor] Error syncing source:", err);
    } finally {
      // Reset sync flag after a tick to allow state to settle
      setTimeout(() => {
        state.isSyncing = false;
      }, 0);
    }
  }, [source, editor]);

  // Handle Plate value changes
  const handleChange = useCallback(({ value }: { value: Value }) => {
    // Operations are already handled via apply override
    // This callback can be used for additional state tracking if needed
  }, []);

  return (
    <div
      className={cn(
        "mdx-visual-editor h-full flex flex-col transition-opacity duration-150",
        isRefreshing && "opacity-60 pointer-events-none",
        className,
      )}
    >
      {/* Plate editor with frontmatter fields */}
      <div className="flex-1 min-h-0">
        <Plate editor={editor} onChange={handleChange}>
          <PlateContainer
            id="mdx-editor-container"
            className="relative h-full cursor-text overflow-y-auto overflow-x-visible"
          >
            {/* Frontmatter fields - simple contentEditable, single line */}
            <div className="pl-16 pr-6 pt-8">
              {/* Title - H1 style */}
              <div
                ref={titleRef}
                contentEditable
                suppressContentEditableWarning
                className="text-4xl font-bold outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/40"
                data-placeholder="Untitled"
                onKeyDown={handleTitleKeyDown}
                onBlur={handleTitleBlur}
                onPaste={(e) => {
                  // Paste as plain text only
                  e.preventDefault();
                  const text = e.clipboardData.getData("text/plain").replace(/\n/g, " ");
                  document.execCommand("insertText", false, text);
                }}
              />
              {/* Subtitle - smaller, muted */}
              <div
                ref={subtitleRef}
                contentEditable
                suppressContentEditableWarning
                className="text-lg text-muted-foreground/70 outline-none empty:before:content-[attr(data-placeholder)] empty:before:text-muted-foreground/30 mt-1"
                data-placeholder="Add a description..."
                onKeyDown={handleSubtitleKeyDown}
                onBlur={(e) => handleFrontmatterChange("description", e.currentTarget.textContent ?? "")}
                onPaste={(e) => {
                  // Paste as plain text only
                  e.preventDefault();
                  const text = e.clipboardData.getData("text/plain").replace(/\n/g, " ");
                  document.execCommand("insertText", false, text);
                }}
              />
            </div>
            <PlateContent
              className={cn(
                // Add extra left padding for drag handles
                "py-4 pl-16 pr-6 min-h-full outline-none",
                // Add selectable class to blocks
                "[&_.slate-selectable]:relative",
              )}
              placeholder="Type / to add blocks..."
              renderElement={elementFallbackRenderer}
              onKeyDown={handlePlateKeyDown}
            />
          </PlateContainer>
        </Plate>
      </div>
    </div>
  );
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert a title to a URL-safe slug
 */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "") // Remove non-word chars except spaces and hyphens
    .replace(/\s+/g, "-") // Replace spaces with hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-+|-+$/g, ""); // Trim hyphens from start/end
}

/**
 * Determine if an operation should trigger MDX serialization
 */
function shouldSerialize(op: Operation): boolean {
  switch (op.type) {
    // Content modifications should serialize
    case "insert_node":
    case "remove_node":
    case "move_node":
    case "insert_text":
    case "remove_text":
    case "set_node":
    case "merge_node":
    case "split_node":
      return true;

    // Selection changes should not
    case "set_selection":
      return false;

    default:
      return false;
  }
}
