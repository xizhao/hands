/**
 * Plate Visual Editor - Operation-Based Edition
 *
 * Source is the single source of truth:
 * - Source changes → Plate value is overwritten
 * - Plate operations → Applied to source, then re-parsed back to Plate
 *
 * Uses Slate's built-in operation system for precise edits:
 * - insert_node, remove_node, move_node → source changes
 * - insert_text, remove_text → text updates
 * - set_node → prop changes
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
import { type ParseResult, parseSourceWithLocations } from "../ast/oxc-parser";
import { applySlateOperations } from "../ast/slate-operations";
import { cn } from "../lib/utils";
import { EditorKit } from "./editor-kit";
import { elementFallbackRenderer } from "./plugins/element-plugin";
import { sourceToPlateValueSurgical } from "./surgical-converters";

interface PlateVisualEditorProps {
  source: string;
  onSourceChange: (source: string) => void;
  className?: string;
}

/** Internal state for operation tracking */
interface SourceSyncState {
  source: string;
  parseResult: ParseResult;
  isSyncing: boolean;
  onSourceChange: (source: string) => void;
}

export function PlateVisualEditor({ source, onSourceChange, className }: PlateVisualEditorProps) {
  // Refs for operation tracking
  const stateRef = useRef<SourceSyncState>({
    source,
    parseResult: parseSourceWithLocations(source),
    isSyncing: false,
    onSourceChange,
  });

  // Update callback ref
  stateRef.current.onSourceChange = onSourceChange;

  // Parse source and create initial Plate value
  const initialValue = useMemo(() => {
    const { value, parseResult } = sourceToPlateValueSurgical(source);
    stateRef.current.parseResult = parseResult;
    stateRef.current.source = source;
    return value;
  }, [source]); // Only on mount

  // Create the source sync plugin that intercepts operations
  const SourceSyncPlugin = useMemo(
    () =>
      createPlatePlugin({
        key: "source-sync",
        extendEditor: ({ editor }) => {
          const { apply } = editor;

          editor.apply = (op: Operation) => {
            const state = stateRef.current;

            // If currently syncing from external source, just apply normally
            if (state.isSyncing) {
              return apply(op);
            }

            // Skip selection-only operations
            if (op.type === "set_selection") {
              return apply(op);
            }

            // Apply to Slate first
            apply(op);

            // Then try to apply to source
            const newSource = applySlateOperations(state.source, [op]);

            if (newSource !== null && newSource !== state.source) {
              // Update state
              state.source = newSource;
              state.parseResult = parseSourceWithLocations(newSource);

              // Notify parent
              state.onSourceChange(newSource);

              console.debug("[source-sync] Applied operation:", op.type);
            } else if (newSource === null) {
              // Operation couldn't be mapped - this is fine for complex ops
              console.debug("[source-sync] Could not apply operation to source:", op.type);
            }
          };

          return editor;
        },
      }),
    [],
  );

  // Create editor with all plugins
  const editor = usePlateEditor({
    plugins: [...EditorKit, SourceSyncPlugin],
    value: initialValue,
  });

  // SOURCE IS TRUTH: When source changes externally, overwrite Plate
  useEffect(() => {
    const state = stateRef.current;

    // Only update if source actually changed
    if (source === state.source) return;

    console.debug("[PlateEditor] Source changed externally, syncing to Plate");

    // Mark that we're syncing to prevent operation feedback
    state.isSyncing = true;

    try {
      const { value, parseResult } = sourceToPlateValueSurgical(source);

      // Only update if parsing succeeded
      if (parseResult.root && parseResult.errors.length === 0) {
        // Update refs
        state.source = source;
        state.parseResult = parseResult;

        // Overwrite Plate value completely
        editor.tf.setValue(value);

        console.debug("[PlateEditor] Synced source to Plate successfully");
      } else {
        // Parse failed - still update source ref but don't touch Plate
        // This happens during intermediate typing states in code editor
        state.source = source;
        console.debug("[PlateEditor] Parse failed, keeping Plate state:", parseResult.errors);
      }
    } catch (err) {
      console.error("[PlateEditor] Error syncing source:", err);
    } finally {
      // Reset sync flag after a tick to allow state to settle
      setTimeout(() => {
        state.isSyncing = false;
      }, 0);
    }
  }, [source, editor]);

  // Optional: Handle any additional Plate changes (beyond operations)
  const handleChange = useCallback(({ value }: { value: Value }) => {
    // Operations are already handled via apply override
    // This callback can be used for additional state tracking if needed
  }, []);

  return (
    <div className={cn("h-full", className)}>
      <Plate editor={editor} onChange={handleChange}>
        <PlateContainer
          id="plate-editor-container"
          className="relative h-full cursor-text overflow-y-auto"
        >
          <PlateContent
            className={cn(
              // Add extra left padding for drag handles (pl-16 = 64px)
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
  );
}
