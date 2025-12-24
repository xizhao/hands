/**
 * ActionEditor - Visual and code editor for actions
 *
 * Two modes:
 * - Visual (default): React Flow diagram showing data lineage
 * - Code: Syntax-highlighted TypeScript source
 */

import { Code, GitBranch } from "@phosphor-icons/react";
import { useState } from "react";
import { cn } from "../lib/utils";
import { DataLineageGraph } from "./DataLineageGraph";
import { ActionCodeView } from "./ActionCodeView";

export interface ActionEditorProps {
  /** Action ID */
  actionId: string;
  /** Action name for display */
  name: string;
  /** Action source code */
  source: string;
  /** Extracted lineage data */
  lineage?: ActionLineage;
  /** Additional CSS classes */
  className?: string;
  /** Called when a table node is clicked */
  onTableClick?: (table: string) => void;
}

export interface ActionLineage {
  /** External data sources (APIs, files) */
  sources: Array<{
    id: string;
    name: string;
    type: "api" | "file" | "webhook" | "schedule";
  }>;
  /** Tables the action reads from */
  reads: Array<{
    table: string;
  }>;
  /** Tables the action writes to */
  writes: Array<{
    table: string;
    operation: "insert" | "update" | "upsert" | "delete";
  }>;
}

type EditorMode = "visual" | "code";

export function ActionEditor({
  actionId,
  name,
  source,
  lineage,
  className,
  onTableClick,
}: ActionEditorProps) {
  const [mode, setMode] = useState<EditorMode>("visual");

  return (
    <div className={cn("h-full flex flex-col", className)}>
      {/* Mode toggle */}
      <div className="flex items-center gap-1 p-2 border-b border-border">
        <button
          onClick={() => setMode("visual")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
            mode === "visual"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <GitBranch weight="bold" className="h-4 w-4" />
          Visual
        </button>
        <button
          onClick={() => setMode("code")}
          className={cn(
            "flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-colors",
            mode === "code"
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:text-foreground hover:bg-muted"
          )}
        >
          <Code weight="bold" className="h-4 w-4" />
          Code
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 min-h-0">
        {mode === "visual" ? (
          <DataLineageGraph
            actionId={actionId}
            actionName={name}
            lineage={lineage}
            onTableClick={onTableClick}
          />
        ) : (
          <ActionCodeView source={source} />
        )}
      </div>
    </div>
  );
}
