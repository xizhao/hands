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
 * - Title/description from frontmatter are rendered as page-title/page-subtitle
 *   Plate elements (like Notion's non-deletable title)
 */

import type { Value } from "platejs";
import {
  createPlatePlugin,
  Plate,
  PlateContainer,
  PlateContent,
  usePlateEditor,
} from "platejs/react";
import { useCallback, useEffect, useMemo, useRef } from "react";
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
  runtimePort = 55000,
  workerPort = 55200,
  className,
  isRefreshing = false,
}: MdxVisualEditorProps) {
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
      {/* Plate editor - title and description are now inline Plate elements */}
      <div className="flex-1 min-h-0">
        <Plate editor={editor} onChange={handleChange}>
          <PlateContainer
            id="mdx-editor-container"
            className="relative h-full cursor-text overflow-y-auto overflow-x-visible"
          >
            <PlateContent
              className={cn(
                // Add extra left padding for drag handles
                "py-6 pl-16 pr-6 min-h-full outline-none",
                // Add selectable class to blocks
                "[&_.slate-selectable]:relative",
              )}
              placeholder="Type / to add blocks..."
              renderElement={elementFallbackRenderer}
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
