/**
 * Source Sync Plugin
 *
 * Intercepts Slate operations and applies them directly to source code.
 * This provides precise, surgical updates that preserve non-JSX code.
 */

import { createPlatePlugin, type PlateEditor } from "platejs/react";
import type { Operation } from "slate";
import type { ParseResult } from "../../ast/oxc-parser";
import { parseSourceWithLocations } from "../../ast/oxc-parser";
import { applySlateOperations } from "../../ast/slate-operations";

/** State stored in the editor */
interface SourceSyncState {
  source: string;
  parseResult: ParseResult;
  onSourceChange: ((source: string) => void) | null;
  /** Flag to prevent re-entrancy */
  isSyncing: boolean;
}

/** Get the plugin state from editor */
function getState(editor: PlateEditor): SourceSyncState | undefined {
  return (editor as any).__sourceSyncState;
}

/** Set the plugin state on editor */
function setState(editor: PlateEditor, state: SourceSyncState): void {
  (editor as any).__sourceSyncState = state;
}

/**
 * Initialize source sync on an editor
 */
export function initSourceSync(
  editor: PlateEditor,
  source: string,
  onSourceChange: (source: string) => void,
): void {
  const parseResult = parseSourceWithLocations(source);
  setState(editor, {
    source,
    parseResult,
    onSourceChange,
    isSyncing: false,
  });
}

/**
 * Update source externally (e.g., from code editor)
 */
export function updateSourceExternal(editor: PlateEditor, newSource: string): void {
  const state = getState(editor);
  if (!state) return;

  state.isSyncing = true;
  state.source = newSource;
  state.parseResult = parseSourceWithLocations(newSource);
  state.isSyncing = false;
}

/**
 * Source Sync Plugin
 *
 * Overrides editor.apply to intercept operations and sync to source
 */
export const SourceSyncPlugin = createPlatePlugin({
  key: "source-sync",

  extendEditor: ({ editor }) => {
    const { apply } = editor;

    // Override apply to capture operations
    editor.apply = (op: Operation) => {
      const state = getState(editor);

      // If not initialized or currently syncing from external, just apply normally
      if (!state || state.isSyncing || !state.onSourceChange) {
        return apply(op);
      }

      // Skip selection operations
      if (op.type === "set_selection") {
        return apply(op);
      }

      // Apply to Slate first
      apply(op);

      // Then try to apply to source
      const newSource = applySlateOperations(state.source, [op]);

      if (newSource !== null && newSource !== state.source) {
        state.source = newSource;
        state.parseResult = parseSourceWithLocations(newSource);
        state.onSourceChange(newSource);

        console.debug("[source-sync] Applied operation:", op.type, {
          sourceLen: newSource.length,
          parseSuccess: state.parseResult.errors.length === 0,
        });
      } else if (newSource === null) {
        // Operation couldn't be mapped to source
        // This is fine - complex operations will be handled by full re-sync
        console.debug("[source-sync] Could not apply operation:", op.type);
      }
    };

    return editor;
  },
});

export default SourceSyncPlugin;
