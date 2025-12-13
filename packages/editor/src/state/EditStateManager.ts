/**
 * EditStateManager - Preserve edit state during RSC re-renders
 *
 * When RSC content refreshes after a source change, we need to preserve:
 * - Selected node IDs
 * - Focused node and cursor position
 * - In-progress edits (pending text/prop changes)
 * - Drag state
 *
 * This class captures state before refresh and restores it after.
 */

export interface EditState {
  /** Currently selected node IDs */
  selectedNodeIds: string[];
  /** Node ID that has focus */
  focusedNodeId: string | null;
  /** Cursor offset within focused text node */
  focusOffset?: number;
  /** Node being dragged */
  draggedNodeId: string | null;
  /** Pending edit that hasn't been committed yet */
  pendingEdit?: PendingEdit;
  /** Scroll position */
  scrollTop?: number;
  scrollLeft?: number;
}

export interface PendingEdit {
  type: "text" | "prop";
  nodeId: string;
  /** For text edits */
  text?: string;
  /** For prop edits */
  propName?: string;
  propValue?: unknown;
}

/**
 * Create an empty edit state
 */
export function createEmptyEditState(): EditState {
  return {
    selectedNodeIds: [],
    focusedNodeId: null,
    focusOffset: undefined,
    draggedNodeId: null,
    pendingEdit: undefined,
    scrollTop: undefined,
    scrollLeft: undefined,
  };
}

/**
 * EditStateManager class for capturing and restoring state
 */
export class EditStateManager {
  private container: HTMLElement | null = null;
  private capturedState: EditState | null = null;

  constructor(container?: HTMLElement) {
    this.container = container || null;
  }

  setContainer(container: HTMLElement | null) {
    this.container = container;
  }

  /**
   * Capture current edit state before RSC refresh
   */
  captureState(currentState: Partial<EditState>): EditState {
    const state: EditState = {
      selectedNodeIds: currentState.selectedNodeIds || [],
      focusedNodeId: currentState.focusedNodeId || this.getFocusedNodeId(),
      focusOffset: currentState.focusOffset || this.getFocusOffset(),
      draggedNodeId: currentState.draggedNodeId || null,
      pendingEdit: currentState.pendingEdit,
      scrollTop: this.container?.scrollTop,
      scrollLeft: this.container?.scrollLeft,
    };

    this.capturedState = state;
    return state;
  }

  /**
   * Get the captured state (or null if not captured)
   */
  getCapturedState(): EditState | null {
    return this.capturedState;
  }

  /**
   * Restore edit state after RSC refresh
   * Call this after new RSC content has been rendered
   */
  restoreState(state?: EditState): void {
    const stateToRestore = state || this.capturedState;
    if (!stateToRestore) return;

    // Use requestAnimationFrame to ensure DOM is updated
    requestAnimationFrame(() => {
      // Restore scroll position
      if (this.container && stateToRestore.scrollTop !== undefined) {
        this.container.scrollTop = stateToRestore.scrollTop;
        this.container.scrollLeft = stateToRestore.scrollLeft || 0;
      }

      // Restore focus if we can find the node
      if (stateToRestore.focusedNodeId) {
        const focusEl = document.querySelector(
          `[data-node-id="${stateToRestore.focusedNodeId}"]`,
        ) as HTMLElement | null;

        if (focusEl) {
          focusEl.focus();

          // If it's editable and we have an offset, restore cursor
          if (stateToRestore.focusOffset !== undefined && focusEl.isContentEditable) {
            this.restoreCursorPosition(focusEl, stateToRestore.focusOffset);
          }
        }
      }

      // Clear captured state
      this.capturedState = null;
    });
  }

  /**
   * Check if a node ID still exists in the DOM
   */
  nodeExists(nodeId: string): boolean {
    return !!document.querySelector(`[data-node-id="${nodeId}"]`);
  }

  /**
   * Filter selected IDs to only include nodes that still exist
   */
  filterExistingNodes(nodeIds: string[]): string[] {
    return nodeIds.filter((id) => this.nodeExists(id));
  }

  /**
   * Get the currently focused node ID
   */
  private getFocusedNodeId(): string | null {
    const focused = document.activeElement;
    if (!focused) return null;

    // Walk up to find data-node-id
    let current: Element | null = focused;
    while (current) {
      const nodeId = current.getAttribute("data-node-id");
      if (nodeId) return nodeId;
      current = current.parentElement;
    }

    return null;
  }

  /**
   * Get the cursor offset within the focused element
   */
  private getFocusOffset(): number | undefined {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return undefined;

    const range = selection.getRangeAt(0);
    return range.startOffset;
  }

  /**
   * Restore cursor position within an element
   */
  private restoreCursorPosition(element: HTMLElement, offset: number): void {
    const textNode = this.findFirstTextNode(element);
    if (!textNode) return;

    const range = document.createRange();
    const selection = window.getSelection();

    // Clamp offset to valid range
    const maxOffset = textNode.textContent?.length || 0;
    const safeOffset = Math.min(offset, maxOffset);

    try {
      range.setStart(textNode, safeOffset);
      range.collapse(true);
      selection?.removeAllRanges();
      selection?.addRange(range);
    } catch (_e) {
      // Ignore - cursor position may not be valid
    }
  }

  /**
   * Find the first text node within an element
   */
  private findFirstTextNode(element: Node): Text | null {
    if (element.nodeType === Node.TEXT_NODE) {
      return element as Text;
    }

    for (const child of element.childNodes) {
      const textNode = this.findFirstTextNode(child);
      if (textNode) return textNode;
    }

    return null;
  }
}

/**
 * React context for edit state management
 */
import { createContext, useContext } from "react";

interface EditStateContextValue {
  manager: EditStateManager;
  captureState: (currentState: Partial<EditState>) => EditState;
  restoreState: (state?: EditState) => void;
}

export const EditStateContext = createContext<EditStateContextValue | null>(null);

/**
 * Hook to use edit state manager
 */
export function useEditStateManager() {
  return useContext(EditStateContext);
}

/**
 * Create edit state context value for provider
 */
export function createEditStateContextValue(container: HTMLElement | null): EditStateContextValue {
  const manager = new EditStateManager(container);

  return {
    manager,
    captureState: (currentState) => manager.captureState(currentState),
    restoreState: (state) => manager.restoreState(state),
  };
}
