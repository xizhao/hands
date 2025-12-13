/**
 * Overlay Editor - RSC-based block editor with edit overlays
 *
 * Architecture:
 * 1. Polls runtime for source changes (via useEditorSource)
 * 2. Fetches RSC and renders directly (live, interactive)
 * 3. Injects node IDs into DOM after render (matches AST)
 * 4. Overlay provides selection, drag handles, and editing
 * 5. Mutations save to runtime, await success, then refetch
 * 6. Caches rendered HTML in localStorage for instant load & smooth transitions
 *
 * State Management:
 * - EditorContext: UI state (selection, hover, editing, menus, history, clipboard)
 * - useEditorSource: Source state (polling, mutations, version)
 */

import { Database } from "@phosphor-icons/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DndProvider } from "react-dnd";
import { HTML5Backend } from "react-dnd-html5-backend";
import type { EditableNode } from "../ast/oxc-parser";
import { parseSourceWithLocations } from "../ast/oxc-parser";
import { extractDataDependencies } from "../ast/sql-extractor";
import { initFlightClient, renderBlockViaRsc } from "../rsc/client";
import { useRscCache } from "./cache";
import { DragSelect } from "./DragSelect";
import { DragHandle, DropZone, NodeHighlight } from "./dnd";
import {
  EditorProvider,
  useEditor,
  useEditorClipboard,
  useEditorEditing,
  useEditorHistory,
  useEditorHover,
  useEditorSelection,
} from "./EditorContext";
import type { EditOperation } from "./operations";
import { extractJsxForNodes, getNodeParentInfo } from "./operations";
import { useEditorSource } from "./useEditorSource";

// ============================================================================
// Node ID Injection
// ============================================================================

function injectNodeIdsIntoDom(container: HTMLElement, astRoot: EditableNode): void {
  function walkAndInject(domNode: Element, astNode: EditableNode): void {
    domNode.setAttribute("data-node-id", astNode.id);

    const domChildren = Array.from(domNode.children);
    let domIndex = 0;

    for (const astChild of astNode.children) {
      if (astChild.isText) continue;

      while (domIndex < domChildren.length) {
        const domChild = domChildren[domIndex];
        if (domChild instanceof HTMLElement) {
          walkAndInject(domChild, astChild);
          domIndex++;
          break;
        }
        domIndex++;
      }
    }
  }

  const rootElement = container.querySelector(":scope > *");
  if (rootElement && rootElement instanceof HTMLElement) {
    walkAndInject(rootElement, astRoot);
  }
}

// ============================================================================
// Get All Node IDs from DOM (for range selection)
// ============================================================================

function getAllNodeIds(container: HTMLElement): string[] {
  const elements = container.querySelectorAll("[data-node-id]");
  return Array.from(elements)
    .map((el) => el.getAttribute("data-node-id"))
    .filter((id): id is string => id !== null);
}

// ============================================================================
// Data Dependency Chip
// ============================================================================

interface DataDepChipProps {
  nodeId: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  tables: string[];
}

function DataDepChip({ nodeId, containerRef, tables }: DataDepChipProps) {
  const [position, setPosition] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const el = containerRef.current.querySelector(`[data-node-id="${nodeId}"]`);
    if (!el) return;

    const containerRect = containerRef.current.getBoundingClientRect();
    const elRect = el.getBoundingClientRect();

    setPosition({
      top: elRect.top - containerRect.top + containerRef.current.scrollTop,
      right: containerRect.right - elRect.right + containerRef.current.scrollLeft,
    });
  }, [nodeId, containerRef]);

  if (!position || tables.length === 0) return null;

  return (
    <div
      className="absolute z-20 pointer-events-none"
      style={{
        top: position.top - 6,
        right: position.right - 6,
      }}
    >
      <div className="flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-blue-500/90 text-white text-[10px] font-medium shadow-sm backdrop-blur-sm">
        <Database size={10} weight="bold" />
        <span>{tables.join(", ")}</span>
      </div>
    </div>
  );
}

// ============================================================================
// Types
// ============================================================================

interface OverlayEditorProps {
  blockId: string;
  runtimePort: number;
  workerPort: number;
  initialSource: string;
  readOnly?: boolean;
}

// ============================================================================
// Inner Component (uses context)
// ============================================================================

interface OverlayEditorInnerProps extends OverlayEditorProps {
  containerRef: React.RefObject<HTMLDivElement | null>;
}

function OverlayEditorInner({
  blockId,
  runtimePort,
  workerPort,
  initialSource,
  readOnly = false,
  containerRef,
}: OverlayEditorInnerProps) {
  const { state, dispatch } = useEditor();
  const { selectedNodeIds, focusedNodeId, select, selectMany, clearSelection } =
    useEditorSelection();
  const { hoveredNodeId, setHover } = useEditorHover();
  const { editingNodeId, startEditing, stopEditing } = useEditorEditing();
  const history = useEditorHistory();
  const clipboard = useEditorClipboard();

  // RSC state
  const [rscElement, setRscElement] = React.useState<React.ReactNode>(null);
  const [isRscLoading, setIsRscLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // RSC cache for instant display during loads
  const { cachedHtml, hasCachedContent, updateCache } = useRscCache({
    blockId,
    containerRef,
  });
  // Original text for inline editing
  const originalTextRef = useRef<string>("");

  // Track if mouse is on drag handle (to prevent hover clear)
  const isOnDragHandleRef = useRef(false);

  // Source management (isLoading is set immediately on mutation, before network)
  const {
    source,
    isSaving,
    isLoading: isMutationLoading,
    version,
    mutate,
    setSource,
  } = useEditorSource({
    blockId,
    runtimePort,
    initialSource,
  });

  // Combined loading state: either RSC is loading OR mutation triggered loading
  const isLoading = isRscLoading || isMutationLoading;

  // Track if we're in a "refresh" (have cached content, loading new)
  const isRefreshing = isLoading && hasCachedContent;

  // Parse source for AST
  const parseResult = useMemo(() => {
    return parseSourceWithLocations(source);
  }, [source]);

  // Extract SQL data dependencies and build node->tables map
  const { dataDeps, nodeToTables } = useMemo(() => {
    const deps = extractDataDependencies(source);
    const map = new Map<string, string[]>();

    // Map JSX element locations from sql-extractor to AST node IDs
    // The extractor walks forward from SQL variables to find JSX elements that display the data
    if (parseResult.root && deps.jsxDataUsages.length > 0) {
      // Walk AST to find nodes that match the JSX element locations
      function walkNode(node: EditableNode) {
        for (const usage of deps.jsxDataUsages) {
          // Check if this node matches the JSX element location
          if (node.loc.start === usage.elementLoc.start && node.loc.end === usage.elementLoc.end) {
            const existing = map.get(node.id) || [];
            const newTables = usage.tables.filter((t) => !existing.includes(t));
            if (newTables.length > 0) {
              map.set(node.id, [...existing, ...newTables]);
            }
          }
        }
        for (const child of node.children) {
          walkNode(child);
        }
      }
      walkNode(parseResult.root);
    }

    return { dataDeps: deps, nodeToTables: map };
  }, [source, parseResult.root]);

  // Fetch RSC when source/version changes
  useEffect(() => {
    let mounted = true;

    async function loadRsc() {
      setIsRscLoading(true);
      setError(null);

      try {
        await initFlightClient();
        const result = await renderBlockViaRsc(workerPort, blockId, { edit: "true" });

        if (!mounted) return;

        if (result.error) {
          setError(result.error);
        } else {
          setRscElement(result.element);
        }
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (mounted) setIsRscLoading(false);
      }
    }

    loadRsc();
    return () => {
      mounted = false;
    };
  }, [blockId, workerPort]);

  // Cache rendered HTML after RSC settles
  useEffect(() => {
    if (isLoading || !containerRef.current || error) return;

    // Small delay to ensure React has finished rendering
    const timeout = setTimeout(() => {
      updateCache();
    }, 100);

    return () => clearTimeout(timeout);
  }, [isLoading, error, updateCache, containerRef.current]);

  // Inject node IDs after RSC renders
  useEffect(() => {
    if (isLoading || !containerRef.current || !parseResult.root) return;

    const timeout = setTimeout(() => {
      injectNodeIdsIntoDom(containerRef.current!, parseResult.root!);
    }, 50);

    return () => clearTimeout(timeout);
  }, [isLoading, parseResult.root, containerRef]);

  // Apply operation with history
  const applyOperation = useCallback(
    async (operation: EditOperation): Promise<boolean> => {
      // Push to history before mutation
      history.push({
        source,
        selectedNodeIds,
        timestamp: Date.now(),
      });

      const result = await mutate(operation);
      if (!result.success) {
        console.error("[OverlayEditor] Operation failed:", result.error);
        return false;
      }
      return true;
    },
    [source, selectedNodeIds, history, mutate],
  );

  // Operation handlers
  const handleMove = useCallback(
    (nodeId: string, targetId: string, position: "before" | "after" | "inside") => {
      applyOperation({ type: "move", nodeId, targetId, position });
    },
    [applyOperation],
  );

  const handleDelete = useCallback(
    (nodeId: string) => {
      applyOperation({ type: "delete", nodeId }).then((ok) => {
        if (ok) clearSelection();
      });
    },
    [applyOperation, clearSelection],
  );

  const handleDeleteMany = useCallback(
    (nodeIds: string[]) => {
      if (nodeIds.length === 0) return;
      if (nodeIds.length === 1) {
        handleDelete(nodeIds[0]);
        return;
      }
      applyOperation({ type: "delete-many", nodeIds }).then((ok) => {
        if (ok) clearSelection();
      });
    },
    [applyOperation, handleDelete, clearSelection],
  );

  // Clipboard operations
  const handleCopy = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const jsxStrings = extractJsxForNodes(source, selectedNodeIds);
    if (jsxStrings.length > 0) {
      clipboard.setClipboard(jsxStrings, "copy");
    }
  }, [selectedNodeIds, source, clipboard]);

  const handleCut = useCallback(() => {
    if (selectedNodeIds.length === 0) return;
    const jsxStrings = extractJsxForNodes(source, selectedNodeIds);
    if (jsxStrings.length > 0) {
      clipboard.setClipboard(jsxStrings, "cut");
      handleDeleteMany(selectedNodeIds);
    }
  }, [selectedNodeIds, source, clipboard, handleDeleteMany]);

  const handlePaste = useCallback(async () => {
    if (!clipboard.clipboard) return;

    // Find where to paste - after focused node, or at end of root
    let parentId: string;
    let insertIndex: number;

    if (focusedNodeId) {
      const parentInfo = getNodeParentInfo(source, focusedNodeId);
      if (parentInfo) {
        parentId = parentInfo.parentId;
        insertIndex = parentInfo.index + 1;
      } else if (parseResult.root) {
        parentId = parseResult.root.id;
        insertIndex = parseResult.root.children.length;
      } else {
        return;
      }
    } else if (parseResult.root) {
      parentId = parseResult.root.id;
      insertIndex = parseResult.root.children.length;
    } else {
      return;
    }

    // Insert the clipboard content
    const ok = await applyOperation({
      type: "insert-many",
      parentId,
      index: insertIndex,
      jsxArray: clipboard.clipboard.jsx,
    });

    if (ok) {
      // Clear clipboard if it was a cut operation
      if (clipboard.clipboard?.operation === "cut") {
        clipboard.clearClipboard();
      }
    }
  }, [clipboard, focusedNodeId, source, parseResult.root, applyOperation]);

  const handleTextEdit = useCallback(
    (nodeId: string, text: string) => {
      applyOperation({ type: "set-text", nodeId, text });
    },
    [applyOperation],
  );

  // Text elements that support inline editing (Linear-style: click to edit)
  const TEXT_ELEMENTS = [
    "p",
    "span",
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "li",
    "a",
    "label",
    "td",
    "th",
  ];

  // Find AST node by ID
  const findAstNode = useCallback(
    (nodeId: string): EditableNode | null => {
      if (!parseResult.root) return null;

      function walk(node: EditableNode): EditableNode | null {
        if (node.id === nodeId) return node;
        for (const child of node.children) {
          const found = walk(child);
          if (found) return found;
        }
        return null;
      }
      return walk(parseResult.root);
    },
    [parseResult.root],
  );

  // Check if AST node has literal text children (not just expressions)
  // This determines if the element supports inline text editing
  const hasLiteralTextChildren = useCallback(
    (nodeId: string): boolean => {
      const node = findAstNode(nodeId);
      if (!node) return false;
      // Check if any child is a text node (literal text, not expression)
      return node.children.some((child) => child.isText && child.text?.trim());
    },
    [findAstNode],
  );

  // Check if a node is selectable (exists in AST as a real JSX element, not text)
  const isSelectableNode = useCallback(
    (nodeId: string): boolean => {
      const node = findAstNode(nodeId);
      // Must exist in AST and not be a text node (text nodes don't get data-node-ids anyway)
      return node !== null && !node.isText;
    },
    [findAstNode],
  );

  // Check if an element is editable text (must have literal text in AST, not expressions)
  const isTextElement = useCallback(
    (el: HTMLElement, nodeId: string): boolean => {
      const tagName = el.tagName.toLowerCase();

      // First check if it's a text-type element
      const isTextTag =
        TEXT_ELEMENTS.includes(tagName) ||
        (tagName === "div" && !el.querySelector("[data-node-id]") && el.textContent?.trim());

      if (!isTextTag) return false;

      // Then verify it has literal text children in the AST (not just expressions like {data.name})
      return hasLiteralTextChildren(nodeId);
    },
    [hasLiteralTextChildren],
  );

  // Start inline editing on an element
  const startInlineEdit = useCallback(
    (el: HTMLElement, nodeId: string, selectAll: boolean = true) => {
      el.contentEditable = "true";
      el.focus();

      if (selectAll) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(el);
        selection?.removeAllRanges();
        selection?.addRange(range);
      }
      // If not selectAll, browser will place cursor at click position

      originalTextRef.current = el.textContent || "";
      startEditing(nodeId);
    },
    [startEditing],
  );

  // Event handlers
  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;

      const target = e.target as HTMLElement;
      const editableEl = target.closest("[data-node-id]") as HTMLElement;
      const nodeId = editableEl?.getAttribute("data-node-id");

      // Debug: log what we're clicking
      console.log("[OverlayEditor] click:", {
        target: target.tagName,
        editableEl: editableEl?.tagName,
        nodeId,
        hasNodeId: !!nodeId,
        allNodeIds: containerRef.current ? getAllNodeIds(containerRef.current) : [],
      });

      // Commit editing if clicking outside current edit
      if (editingNodeId && editingNodeId !== nodeId) {
        const currentEditEl = containerRef.current?.querySelector(
          `[data-node-id="${editingNodeId}"]`,
        ) as HTMLElement;
        if (currentEditEl) {
          const newText = currentEditEl.textContent || "";
          if (newText !== originalTextRef.current) {
            handleTextEdit(editingNodeId, newText);
          }
          stopEditing();
          currentEditEl.contentEditable = "false";
        }
      }

      // If clicking inside current edit, let it happen naturally
      if (editingNodeId === nodeId) return;

      if (!nodeId || !editableEl) return;

      // Verify node is selectable (exists in AST as a real JSX element)
      if (!isSelectableNode(nodeId)) return;

      // Multi-select with modifier keys
      if (e.metaKey || e.ctrlKey) {
        e.preventDefault();
        e.stopPropagation();
        select(nodeId, true);
        return;
      }

      if (e.shiftKey && focusedNodeId && containerRef.current) {
        e.preventDefault();
        e.stopPropagation();
        const allIds = getAllNodeIds(containerRef.current);
        dispatch({
          type: "SELECT_RANGE",
          fromId: focusedNodeId,
          toId: nodeId,
          allNodeIds: allIds,
        });
        return;
      }

      // Linear-style: single click on text elements starts editing immediately
      if (isTextElement(editableEl, nodeId)) {
        e.preventDefault();
        e.stopPropagation();
        select(nodeId, false);
        // Small delay so selection renders, then start editing
        requestAnimationFrame(() => {
          startInlineEdit(editableEl, nodeId, false);
        });
        return;
      }

      // Non-text elements: just select
      e.preventDefault();
      e.stopPropagation();
      select(nodeId, false);
    },
    [
      readOnly,
      editingNodeId,
      focusedNodeId,
      containerRef,
      select,
      dispatch,
      handleTextEdit,
      stopEditing,
      isTextElement,
      isSelectableNode,
      startInlineEdit,
    ],
  );

  // Double-click: select all text in element
  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;

      const target = e.target as HTMLElement;
      const editableEl = target.closest("[data-node-id]") as HTMLElement;
      if (!editableEl) return;

      const nodeId = editableEl.getAttribute("data-node-id");
      if (!nodeId) return;

      if (!isTextElement(editableEl, nodeId)) return;

      e.preventDefault();
      e.stopPropagation();

      // If already editing, select all text (like double-click to select word, then all)
      if (editingNodeId === nodeId) {
        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(editableEl);
        selection?.removeAllRanges();
        selection?.addRange(range);
        return;
      }

      // Start editing with all text selected
      startInlineEdit(editableEl, nodeId, true);
    },
    [readOnly, editingNodeId, isTextElement, startInlineEdit],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      // Handle inline editing
      if (editingNodeId) {
        const editingEl = containerRef.current?.querySelector(
          `[data-node-id="${editingNodeId}"]`,
        ) as HTMLElement;

        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (editingEl) {
            const newText = editingEl.textContent || "";
            if (newText !== originalTextRef.current) {
              handleTextEdit(editingNodeId, newText);
            }
            editingEl.contentEditable = "false";
            editingEl.blur();
          }
          stopEditing();
          return;
        } else if (e.key === "Escape") {
          e.preventDefault();
          if (editingEl) {
            editingEl.textContent = originalTextRef.current;
            editingEl.contentEditable = "false";
            editingEl.blur();
          }
          stopEditing();
          return;
        }
        // Let other keys pass through for editing
        return;
      }

      // Global shortcuts (when not editing)
      if (e.key === "Escape") {
        clearSelection();
        return;
      }

      // Delete selected nodes
      if ((e.key === "Delete" || e.key === "Backspace") && selectedNodeIds.length > 0) {
        e.preventDefault();
        handleDeleteMany(selectedNodeIds);
        return;
      }

      // Select all (Cmd+A)
      if ((e.metaKey || e.ctrlKey) && e.key === "a" && containerRef.current) {
        e.preventDefault();
        const allIds = getAllNodeIds(containerRef.current);
        selectMany(allIds);
        return;
      }

      // Copy (Cmd+C)
      if ((e.metaKey || e.ctrlKey) && e.key === "c") {
        e.preventDefault();
        handleCopy();
        return;
      }

      // Cut (Cmd+X)
      if ((e.metaKey || e.ctrlKey) && e.key === "x") {
        e.preventDefault();
        handleCut();
        return;
      }

      // Paste (Cmd+V)
      if ((e.metaKey || e.ctrlKey) && e.key === "v") {
        e.preventDefault();
        handlePaste();
        return;
      }

      // Undo (Cmd+Z)
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && !e.shiftKey) {
        e.preventDefault();
        if (history.canUndo) {
          const entry = history.getUndoEntry();
          if (entry) {
            // Restore source from history
            setSource(entry.source);
            history.undo();
          }
        }
        return;
      }

      // Redo (Cmd+Shift+Z)
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && e.shiftKey) {
        e.preventDefault();
        if (history.canRedo) {
          const entry = history.getRedoEntry();
          if (entry) {
            // Restore source from history
            setSource(entry.source);
            history.redo();
          }
        }
        return;
      }

      // Duplicate (Cmd+D)
      if ((e.metaKey || e.ctrlKey) && e.key === "d" && selectedNodeIds.length > 0) {
        e.preventDefault();
        if (selectedNodeIds.length === 1) {
          applyOperation({ type: "duplicate", nodeId: selectedNodeIds[0] });
        } else {
          applyOperation({ type: "duplicate-many", nodeIds: selectedNodeIds });
        }
        return;
      }

      // Arrow key navigation
      if (e.key === "ArrowUp" || e.key === "ArrowDown") {
        if (!containerRef.current) return;
        e.preventDefault();

        const allIds = getAllNodeIds(containerRef.current);
        if (allIds.length === 0) return;

        const currentIndex = focusedNodeId ? allIds.indexOf(focusedNodeId) : -1;
        let newIndex: number;

        if (e.key === "ArrowUp") {
          newIndex = currentIndex <= 0 ? allIds.length - 1 : currentIndex - 1;
        } else {
          newIndex = currentIndex >= allIds.length - 1 ? 0 : currentIndex + 1;
        }

        if (e.shiftKey && focusedNodeId) {
          // Extend selection
          dispatch({
            type: "SELECT_RANGE",
            fromId: selectedNodeIds[0] || focusedNodeId,
            toId: allIds[newIndex],
            allNodeIds: allIds,
          });
        } else {
          select(allIds[newIndex], false);
        }
        return;
      }

      // Enter to start editing (if text element)
      if (e.key === "Enter" && focusedNodeId && containerRef.current) {
        const el = containerRef.current.querySelector(
          `[data-node-id="${focusedNodeId}"]`,
        ) as HTMLElement;
        if (el && isTextElement(el, focusedNodeId)) {
          e.preventDefault();
          startInlineEdit(el, focusedNodeId, true);
        }
        return;
      }
    },
    [
      editingNodeId,
      selectedNodeIds,
      focusedNodeId,
      containerRef,
      handleTextEdit,
      handleDeleteMany,
      handleCopy,
      handleCut,
      handlePaste,
      stopEditing,
      clearSelection,
      selectMany,
      select,
      dispatch,
      history,
      setSource,
      applyOperation,
      isTextElement,
      startInlineEdit,
    ],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (readOnly) return;
      const target = e.target as HTMLElement;
      const nodeId = target.closest("[data-node-id]")?.getAttribute("data-node-id");
      setHover(nodeId || null);
    },
    [readOnly, setHover],
  );

  const handleMouseLeave = useCallback(() => {
    // Small delay to allow mouse to reach drag handle
    setTimeout(() => {
      if (!isOnDragHandleRef.current) {
        setHover(null);
      }
    }, 50);
  }, [setHover]);

  // Loading state (only show if no cached content)
  if (isLoading && !hasCachedContent) {
    return (
      <div className="flex items-center justify-center h-full p-8">
        <div className="flex items-center gap-2 text-muted-foreground">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="p-4">
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4">
          <div className="text-sm font-medium text-red-400">Render Error</div>
          <div className="text-xs text-red-400/70 mt-1 font-mono">{error}</div>
        </div>
      </div>
    );
  }

  // Primary selected node (first in array)
  const primarySelectedId = selectedNodeIds[0] ?? null;

  return (
    <div className="h-full pl-10 relative">
      {/* Overlays positioned relative to this outer wrapper (in pl-10 area) */}

      {/* Selection highlight - only for non-editing elements */}
      {selectedNodeIds
        .filter((nodeId) => nodeId !== editingNodeId)
        .map((nodeId) => (
          <NodeHighlight key={nodeId} nodeId={nodeId} containerRef={containerRef} mode="select" />
        ))}

      {/* Drag handle for selected element - always visible when selected */}
      {primarySelectedId && (
        <DragHandle
          nodeId={primarySelectedId}
          containerRef={containerRef}
          onDelete={() => handleDelete(primarySelectedId)}
          onHoverChange={(isHovered) => {
            isOnDragHandleRef.current = isHovered;
          }}
        />
      )}

      {/* Drag handle for hovered element - only show if different from selected */}
      {hoveredNodeId && hoveredNodeId !== primarySelectedId && (
        <DragHandle
          nodeId={hoveredNodeId}
          containerRef={containerRef}
          onDelete={() => handleDelete(hoveredNodeId)}
          onHoverChange={(isHovered) => {
            isOnDragHandleRef.current = isHovered;
            if (isHovered) {
              setHover(hoveredNodeId);
            }
          }}
        />
      )}

      {/* Data dependency chip - show on hover OR when selected if element has data deps */}
      {(() => {
        const nodeId = hoveredNodeId || primarySelectedId;
        if (!nodeId) return null;
        const tables = nodeToTables.get(nodeId);
        if (!tables || tables.length === 0) return null;
        return <DataDepChip nodeId={nodeId} containerRef={containerRef} tables={tables} />;
      })()}

      {/* Drop zone */}
      <DropZone containerRef={containerRef} onDrop={handleMove} />

      {/* Drag select (area selection) */}
      <DragSelect
        containerRef={containerRef}
        onSelect={selectMany}
        disabled={readOnly || isRefreshing || !!editingNodeId}
      />

      <div className="overlay-editor h-full" onKeyDown={handleKeyDown}>
        {/* RSC content */}
        <div
          ref={containerRef}
          className={`overlay-content h-full overflow-auto p-4 transition-opacity duration-150 ${
            isRefreshing ? "opacity-60 pointer-events-none" : ""
          }`}
          onClick={!isRefreshing ? handleClick : undefined}
          onDoubleClick={!isRefreshing ? handleDoubleClick : undefined}
          onMouseMove={!isRefreshing ? handleMouseMove : undefined}
          onMouseLeave={!isRefreshing ? handleMouseLeave : undefined}
        >
          {/* Show cached HTML during refresh, otherwise RSC element */}
          {isRefreshing && cachedHtml ? (
            <div dangerouslySetInnerHTML={{ __html: cachedHtml }} />
          ) : (
            rscElement
          )}
        </div>
      </div>
    </div>
  );
}

// Need React import
import React from "react";

// ============================================================================
// Main Component (wraps with providers)
// ============================================================================

export function OverlayEditor(props: OverlayEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <DndProvider backend={HTML5Backend}>
      <EditorProvider>
        <OverlayEditorInner {...props} containerRef={containerRef} />
      </EditorProvider>
    </DndProvider>
  );
}
