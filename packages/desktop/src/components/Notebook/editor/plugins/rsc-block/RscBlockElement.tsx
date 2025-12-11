/**
 * RSC Block Element - Renders server-side content in the editor
 * Uses Flight wire format for full RSC reactivity
 */

import { useState, useCallback, Suspense } from "react";
import { PlateElement, type PlateElementProps } from "platejs/react";
import { useBlock } from "@/lib/blocks-client";
import { RefreshCw, AlertCircle, Settings } from "lucide-react";
import { cn } from "@/lib/utils";
import { RscErrorBoundary } from "@/components/ui/rsc-error-boundary";

interface RscBlockElementData {
  type: "rsc_block";
  blockId: string;
  blockType: "sql" | "chart" | "text" | "table";
  blockProps: Record<string, unknown>;
  children: [{ text: "" }];
  [key: string]: unknown;
}

export function RscBlockElement(props: PlateElementProps<RscBlockElementData>) {
  const { element, children } = props;
  const [isEditing, setIsEditing] = useState(false);
  const blockElement = element as unknown as RscBlockElementData;
  const [editProps, setEditProps] = useState(blockElement.blockProps);

  // Use RSC hook for Flight wire format
  const { data, isLoading, invalidate, isRefetching, runtimeReady, isWaitingForRuntime } = useBlock(blockElement.blockId, editProps);

  const handleRefresh = useCallback(() => {
    invalidate();
  }, [invalidate]);

  const loading = isLoading || isRefetching;

  return (
    <PlateElement {...props}>
      <div contentEditable={false} className="my-4">
        <div className="border border-border rounded-lg overflow-hidden bg-card">
          {/* Block toolbar */}
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/50 border-b border-border">
            <div className="flex items-center gap-2">
              <BlockTypeIcon type={blockElement.blockType} />
              <span className="text-xs font-medium text-muted-foreground">
                {getBlockTypeName(blockElement.blockType)}
              </span>
            </div>
            {/* Toolbar buttons - only show when runtime is ready */}
            {runtimeReady ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setIsEditing(!isEditing)}
                  className={cn(
                    "p-1 rounded hover:bg-muted transition-colors",
                    isEditing && "bg-muted"
                  )}
                  title="Edit block settings"
                >
                  <Settings className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <button
                  onClick={handleRefresh}
                  disabled={loading}
                  className="p-1 rounded hover:bg-muted transition-colors"
                  title="Refresh"
                >
                  <RefreshCw
                    className={cn(
                      "h-3.5 w-3.5 text-muted-foreground",
                      loading && "animate-spin"
                    )}
                  />
                </button>
              </div>
            ) : (
              <div className="h-1.5 w-1.5 rounded-full bg-yellow-500 animate-pulse" title="Starting..." />
            )}
          </div>

          {/* Edit mode - only available when runtime is ready */}
          {isEditing && runtimeReady && (
            <div className="p-3 bg-muted/30 border-b border-border">
              <BlockPropsEditor
                type={blockElement.blockType}
                props={editProps}
                onChange={(newProps) => {
                  setEditProps(newProps);
                  // TODO: Update the element in the editor
                }}
              />
            </div>
          )}

          {/* Block content - RSC element */}
          <div className="p-4">
            {isWaitingForRuntime ? (
              // Show booting state placeholder
              <div className="flex items-center justify-center h-24 rounded bg-muted/30 border border-dashed border-border/50">
                <div className="h-2 w-2 rounded-full bg-yellow-500 animate-pulse" title="Starting..." />
              </div>
            ) : data?.error ? (
              <div className="flex items-center gap-2 text-destructive">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm">{data.error}</span>
              </div>
            ) : loading ? (
              <div className="animate-pulse bg-muted h-24 rounded" />
            ) : data?.element ? (
              <RscErrorBoundary
                resetKey={blockElement.blockId}
                onRetry={handleRefresh}
                compact
              >
                <Suspense fallback={<div className="animate-pulse bg-muted h-24 rounded" />}>
                  <div className="[&>*]:!m-0">
                    {data.element}
                  </div>
                </Suspense>
              </RscErrorBoundary>
            ) : (
              <div className="text-muted-foreground text-sm">
                Configure this block to see content
              </div>
            )}
          </div>
        </div>

        {/* Plate requires children for void elements */}
        {children}
      </div>
    </PlateElement>
  );
}

function BlockTypeIcon({ type }: { type: string }) {
  switch (type) {
    case "sql":
      return <span className="text-xs font-mono">&lt;/&gt;</span>;
    case "chart":
      return <span className="text-xs">📊</span>;
    case "table":
      return <span className="text-xs">📋</span>;
    case "text":
      return <span className="text-xs">T</span>;
    default:
      return <span className="text-xs">📦</span>;
  }
}

function getBlockTypeName(type: string): string {
  switch (type) {
    case "sql":
      return "SQL Query";
    case "chart":
      return "Chart";
    case "table":
      return "Data Table";
    case "text":
      return "Text";
    default:
      return "Block";
  }
}

// Props editor for different block types
interface BlockPropsEditorProps {
  type: string;
  props: Record<string, unknown>;
  onChange: (props: Record<string, unknown>) => void;
}

function BlockPropsEditor({ type, props, onChange }: BlockPropsEditorProps) {
  switch (type) {
    case "sql":
      return (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              SQL Query
            </span>
            <textarea
              value={(props.query as string) || ""}
              onChange={(e) => onChange({ ...props, query: e.target.value })}
              placeholder="SELECT * FROM users LIMIT 10"
              className="mt-1 w-full px-3 py-2 text-sm font-mono bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={3}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Title
            </span>
            <input
              type="text"
              value={(props.title as string) || ""}
              onChange={(e) => onChange({ ...props, title: e.target.value })}
              placeholder="Query Results"
              className="mt-1 w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      );

    case "chart":
      return (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Chart Type
            </span>
            <select
              value={(props.chartType as string) || "bar"}
              onChange={(e) => onChange({ ...props, chartType: e.target.value })}
              className="mt-1 w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="bar">Bar</option>
              <option value="line">Line</option>
              <option value="pie">Pie</option>
              <option value="area">Area</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              SQL Query (label, value columns)
            </span>
            <textarea
              value={(props.query as string) || ""}
              onChange={(e) => onChange({ ...props, query: e.target.value })}
              placeholder="SELECT category, COUNT(*) FROM items GROUP BY category"
              className="mt-1 w-full px-3 py-2 text-sm font-mono bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Title
            </span>
            <input
              type="text"
              value={(props.title as string) || ""}
              onChange={(e) => onChange({ ...props, title: e.target.value })}
              placeholder="Chart Title"
              className="mt-1 w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      );

    case "table":
      return (
        <div className="space-y-2">
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              SQL Query
            </span>
            <textarea
              value={(props.query as string) || ""}
              onChange={(e) => onChange({ ...props, query: e.target.value })}
              placeholder="SELECT * FROM users LIMIT 50"
              className="mt-1 w-full px-3 py-2 text-sm font-mono bg-background border border-border rounded-md resize-none focus:outline-none focus:ring-2 focus:ring-ring"
              rows={2}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted-foreground">
              Title
            </span>
            <input
              type="text"
              value={(props.title as string) || ""}
              onChange={(e) => onChange({ ...props, title: e.target.value })}
              placeholder="Data Table"
              className="mt-1 w-full px-3 py-1.5 text-sm bg-background border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </label>
        </div>
      );

    default:
      return (
        <div className="text-sm text-muted-foreground">
          No configuration available for this block type.
        </div>
      );
  }
}
