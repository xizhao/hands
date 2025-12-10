/**
 * VisualCanvas - Live preview of the block using Plate-style components
 *
 * Renders JsxNode tree as actual React components for WYSIWYG editing.
 * Uses the same styled primitives from @/registry/ui for consistency.
 */

import type { JsxNode } from "../types";
import { cn } from "@/lib/utils";
import { useDrop } from "react-dnd";
import type { DragItem } from "../types";

// Import Plate-style components
import { Button } from "@/registry/ui/button";
import { Input } from "@/registry/ui/input";

interface VisualCanvasProps {
  root: JsxNode;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onAddNode?: (nodeType: string) => void;
  onMoveNode?: (nodeId: string, targetId: string, position: "before" | "after" | "inside") => void;
  onDeleteNode?: (nodeId: string) => void;
}

export function VisualCanvas({
  root,
  selectedNodeId,
  onSelectNode,
  onAddNode,
  onMoveNode,
  onDeleteNode,
}: VisualCanvasProps) {
  // Root drop zone for adding components
  const [{ isOver }, drop] = useDrop({
    accept: ["palette"],
    drop: (item: DragItem, monitor) => {
      if (monitor.didDrop()) return;
      if (item.type === "palette" && item.nodeType && onAddNode) {
        onAddNode(item.nodeType);
      }
    },
    collect: (monitor) => ({
      isOver: monitor.isOver({ shallow: true }),
    }),
  });

  const isEmpty = !root.children || root.children.length === 0;

  return (
    <div
      ref={(node) => { drop(node); }}
      className={cn(
        "min-h-full p-6 bg-background rounded-lg border transition-colors",
        isOver && "ring-2 ring-primary/50 bg-primary/5",
        isEmpty && "flex items-center justify-center"
      )}
      onClick={() => onSelectNode(null)}
    >
      {isEmpty ? (
        <div className="text-center text-muted-foreground">
          <p className="text-sm">Drop components here to start building</p>
          <p className="text-xs mt-1 opacity-70">or click items in the palette</p>
        </div>
      ) : (
        <div className="space-y-2">
          {root.children?.map((child) => (
            <VisualNode
              key={child.id}
              node={child}
              selectedNodeId={selectedNodeId}
              onSelectNode={onSelectNode}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface VisualNodeProps {
  node: JsxNode;
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
}

/**
 * Renders a JsxNode as an actual visual component
 */
function VisualNode({ node, selectedNodeId, onSelectNode }: VisualNodeProps) {
  const isSelected = node.id === selectedNodeId;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onSelectNode(node.id);
  };

  // Selection wrapper
  const SelectionWrapper = ({ children }: { children: React.ReactNode }) => (
    <div
      onClick={handleClick}
      className={cn(
        "relative cursor-pointer transition-all rounded",
        isSelected && "ring-2 ring-primary ring-offset-2",
        !isSelected && "hover:ring-1 hover:ring-border"
      )}
    >
      {isSelected && (
        <div className="absolute -top-5 left-0 px-1.5 py-0.5 text-[10px] font-medium bg-primary text-primary-foreground rounded-t">
          {node.tagName || node.type}
        </div>
      )}
      {children}
    </div>
  );

  // Render based on node type
  switch (node.type) {
    case "text":
      return (
        <SelectionWrapper>
          <span className="text-sm">{node.text}</span>
        </SelectionWrapper>
      );

    case "expression":
      return (
        <SelectionWrapper>
          <span className="px-2 py-1 rounded bg-amber-500/10 text-amber-600 font-mono text-xs">
            {`{${node.expression}}`}
          </span>
        </SelectionWrapper>
      );

    case "fragment":
      return (
        <SelectionWrapper>
          <div className="space-y-2">
            {node.children?.map((child) => (
              <VisualNode
                key={child.id}
                node={child}
                selectedNodeId={selectedNodeId}
                onSelectNode={onSelectNode}
              />
            ))}
          </div>
        </SelectionWrapper>
      );

    case "element":
      return (
        <SelectionWrapper>
          {renderElement(node, selectedNodeId, onSelectNode)}
        </SelectionWrapper>
      );

    default:
      return null;
  }
}

/**
 * Render JSX element using Plate-style components
 */
function renderElement(
  node: JsxNode,
  selectedNodeId: string | null,
  onSelectNode: (nodeId: string | null) => void
): React.ReactNode {
  const tag = node.tagName?.toLowerCase() ?? "div";
  const className = getPropValue(node.props?.className) as string | undefined;

  // Get text content from children
  const textContent = node.children
    ?.filter((c) => c.type === "text")
    .map((c) => c.text)
    .join("") || "";

  // Render children (non-text)
  const childElements = node.children
    ?.filter((c) => c.type !== "text")
    .map((child) => (
      <VisualNode
        key={child.id}
        node={child}
        selectedNodeId={selectedNodeId}
        onSelectNode={onSelectNode}
      />
    ));

  switch (tag) {
    // Use Plate-style Button
    case "button":
      return (
        <Button variant="default" size="default">
          {textContent || "Button"}
        </Button>
      );

    // Use Plate-style Input
    case "input":
      return (
        <Input
          placeholder={getPropValue(node.props?.placeholder) as string || "Enter text..."}
          type={getPropValue(node.props?.type) as string || "text"}
          readOnly
        />
      );

    // Headings
    case "h1":
      return <h1 className={cn("text-2xl font-bold", className)}>{textContent}</h1>;
    case "h2":
      return <h2 className={cn("text-xl font-semibold", className)}>{textContent}</h2>;
    case "h3":
      return <h3 className={cn("text-lg font-medium", className)}>{textContent}</h3>;

    // Text elements
    case "p":
      return <p className={cn("text-sm", className)}>{textContent}</p>;
    case "span":
      return <span className={cn("text-sm", className)}>{textContent}</span>;

    // Card - styled container
    case "card":
    case "div":
      if (className?.includes("card") || className?.includes("border")) {
        return (
          <div className={cn("p-4 rounded-lg border bg-card", className)}>
            {childElements}
            {!childElements?.length && (
              <span className="text-muted-foreground text-xs">Empty card</span>
            )}
          </div>
        );
      }
      // Container div
      return (
        <div className={cn("p-2", className)}>
          {childElements}
          {!childElements?.length && textContent && (
            <span className="text-sm">{textContent}</span>
          )}
          {!childElements?.length && !textContent && (
            <span className="text-muted-foreground text-xs italic">Empty container</span>
          )}
        </div>
      );

    // DataTable placeholder
    case "datatable":
      return (
        <div className="border rounded-lg overflow-hidden">
          <div className="bg-muted/50 px-3 py-2 border-b">
            <span className="text-xs font-medium text-muted-foreground">DataTable</span>
          </div>
          <div className="p-4 text-center text-muted-foreground text-sm">
            <div className="grid grid-cols-3 gap-2 mb-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-3 bg-muted rounded animate-pulse" />
              ))}
            </div>
            {[...Array(3)].map((_, row) => (
              <div key={row} className="grid grid-cols-3 gap-2 mb-1">
                {[...Array(3)].map((_, col) => (
                  <div key={col} className="h-2 bg-muted/50 rounded" />
                ))}
              </div>
            ))}
          </div>
        </div>
      );

    // Image placeholder
    case "img":
      return (
        <div className="border rounded-lg bg-muted/30 p-8 text-center">
          <span className="text-muted-foreground text-sm">Image</span>
        </div>
      );

    // Default fallback
    default:
      return (
        <div className={cn("p-2 border border-dashed rounded", className)}>
          <span className="text-xs text-muted-foreground">&lt;{tag}&gt;</span>
          {childElements}
          {textContent && <span className="text-sm ml-1">{textContent}</span>}
        </div>
      );
  }
}

/**
 * Extract value from PropValue
 */
function getPropValue(prop: { type: string; value: unknown } | undefined): unknown {
  if (!prop) return undefined;
  return prop.value;
}
