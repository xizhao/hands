/**
 * PropsPanel - Property editor for selected node
 */

import type { JsxNode, PropValue } from "../types";
import { cn } from "@/lib/utils";
import { Trash, X } from "@phosphor-icons/react";

interface PropsPanelProps {
  node: JsxNode | null;
  onUpdate: (updates: Partial<JsxNode>) => void;
  onDelete: () => void;
}

export function PropsPanel({ node, onUpdate, onDelete }: PropsPanelProps) {
  if (!node) {
    return (
      <div className="p-4 text-center text-muted-foreground">
        <p className="text-sm">Select a node to edit its properties</p>
      </div>
    );
  }

  return (
    <div className="p-3">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold">
          {getNodeTitle(node)}
        </h3>
        <button
          onClick={onDelete}
          className="p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
          title="Delete node"
        >
          <Trash weight="bold" className="h-4 w-4" />
        </button>
      </div>

      {/* Properties */}
      <div className="space-y-4">
        {/* Tag name (for elements) */}
        {node.type === "element" && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Tag Name
            </label>
            <input
              type="text"
              value={node.tagName ?? "div"}
              onChange={(e) => onUpdate({ tagName: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded-md bg-background"
            />
          </div>
        )}

        {/* Text content */}
        {node.type === "text" && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Text
            </label>
            <textarea
              value={node.text ?? ""}
              onChange={(e) => onUpdate({ text: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border rounded-md bg-background min-h-[60px] resize-y"
            />
          </div>
        )}

        {/* Expression */}
        {node.type === "expression" && (
          <div>
            <label className="block text-xs font-medium text-muted-foreground mb-1">
              Expression
            </label>
            <textarea
              value={node.expression ?? ""}
              onChange={(e) => onUpdate({ expression: e.target.value })}
              className="w-full px-2 py-1.5 text-sm font-mono border rounded-md bg-background min-h-[60px] resize-y"
              placeholder="data.map(item => ...)"
            />
          </div>
        )}

        {/* Props (for elements) */}
        {node.type === "element" && node.props && (
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-muted-foreground">
                Props
              </label>
              <button
                onClick={() => {
                  const newName = prompt("Property name:");
                  if (newName) {
                    onUpdate({
                      props: {
                        ...node.props,
                        [newName]: { type: "literal", value: "" },
                      },
                    });
                  }
                }}
                className="text-xs text-primary hover:underline"
              >
                + Add
              </button>
            </div>
            <div className="space-y-2">
              {Object.entries(node.props).map(([name, value]) => (
                <PropEditor
                  key={name}
                  name={name}
                  value={value}
                  onChange={(newValue) => {
                    onUpdate({
                      props: {
                        ...node.props,
                        [name]: newValue,
                      },
                    });
                  }}
                  onRemove={() => {
                    const { [name]: _, ...rest } = node.props!;
                    onUpdate({ props: rest });
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

interface PropEditorProps {
  name: string;
  value: PropValue;
  onChange: (value: PropValue) => void;
  onRemove: () => void;
}

function PropEditor({ name, value, onChange, onRemove }: PropEditorProps) {
  const isExpression = value.type === "expression";

  return (
    <div className="flex items-start gap-2 p-2 border rounded-md bg-muted/30">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground">{name}</span>
          <button
            onClick={() => onChange({
              type: isExpression ? "literal" : "expression",
              value: value.value,
              rawSource: value.rawSource,
            })}
            className={cn(
              "text-xs px-1.5 py-0.5 rounded",
              isExpression ? "bg-amber-500/20 text-amber-600" : "bg-blue-500/20 text-blue-600"
            )}
          >
            {isExpression ? "{}" : '""'}
          </button>
        </div>
        {isExpression ? (
          <input
            type="text"
            value={value.rawSource ?? String(value.value ?? "")}
            onChange={(e) => onChange({
              type: "expression",
              value: e.target.value,
              rawSource: e.target.value,
            })}
            className="w-full px-2 py-1 text-xs font-mono border rounded bg-background"
            placeholder="expression"
          />
        ) : (
          <input
            type="text"
            value={String(value.value ?? "")}
            onChange={(e) => onChange({
              type: "literal",
              value: e.target.value,
            })}
            className="w-full px-2 py-1 text-xs border rounded bg-background"
            placeholder="value"
          />
        )}
      </div>
      <button
        onClick={onRemove}
        className="p-1 rounded hover:bg-destructive/20 hover:text-destructive transition-colors"
      >
        <X weight="bold" className="h-3 w-3" />
      </button>
    </div>
  );
}

function getNodeTitle(node: JsxNode): string {
  switch (node.type) {
    case "text":
      return "Text Node";
    case "expression":
      return "Expression";
    case "fragment":
      return "Fragment";
    case "element":
      return `<${node.tagName ?? "div"}>`;
    default:
      return "Node";
  }
}
