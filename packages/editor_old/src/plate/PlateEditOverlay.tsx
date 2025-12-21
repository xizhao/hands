/**
 * PlateEditOverlay - Edit overlay for RSC-rendered content
 *
 * TODO: This is a simplified placeholder. Full implementation needs:
 * - Match AST nodes to rendered DOM elements (by structure/position)
 * - Selection highlights positioned over DOM elements
 * - Drag handles for moving elements
 * - Drop zones for drag targets
 */

import type * as React from "react";
import type { ParseResult } from "../ast/oxc-parser";

// ============================================================================
// Types
// ============================================================================

export type EditOperation =
  | { type: "select"; nodeIds: string[] }
  | { type: "move"; nodeId: string; targetId: string; position: "before" | "after" | "inside" }
  | { type: "delete"; nodeIds: string[] }
  | { type: "duplicate"; nodeId: string }
  | { type: "edit-text"; nodeId: string; text: string }
  | { type: "edit-prop"; nodeId: string; propName: string; value: unknown };

export interface PlateEditOverlayProps {
  /** Parsed AST of the source */
  parseResult: ParseResult;
  /** Callback when an edit operation occurs */
  onEditOperation: (operation: EditOperation) => void;
  /** Container element for position tracking */
  containerRef: React.RefObject<HTMLElement | null>;
  /** Currently selected node IDs */
  selectedNodeIds?: string[];
  /** Whether editing is disabled */
  disabled?: boolean;
}

// ============================================================================
// Main Component
// ============================================================================

export function PlateEditOverlay({
  parseResult,
  onEditOperation,
  containerRef,
  selectedNodeIds,
  disabled = false,
}: PlateEditOverlayProps) {
  if (disabled) return null;

  // For now, just show that edit mode is active
  // Full implementation needs AST-to-DOM matching
  return (
    <div className="plate-edit-overlay absolute inset-0 pointer-events-none">
      {/* Placeholder - edit overlay active */}
      <div className="absolute bottom-2 left-2 text-xs text-muted-foreground bg-card/80 px-2 py-1 rounded">
        Edit mode active • {parseResult.root?.children.length || 0} nodes
      </div>
    </div>
  );
}
