/**
 * DataLineageGraph - React Flow visualization of action data flow
 *
 * Shows:
 * - Source nodes (APIs, webhooks, schedules)
 * - Action node (center)
 * - Table nodes (reads and writes)
 */

import {
  ReactFlow,
  Background,
  Controls,
  type Node,
  type Edge,
  Position,
  Handle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Clock,
  Cloud,
  Database,
  FileText,
  Globe,
  Lightning,
  Table,
} from "@phosphor-icons/react";
import { useMemo } from "react";
import { cn } from "../lib/utils";
import type { ActionLineage } from "./ActionEditor";

// Node data types
interface SourceNodeData {
  label: string;
  type: "api" | "file" | "webhook" | "schedule";
}

interface ActionNodeData {
  label: string;
}

interface TableNodeData {
  table: string;
  operation?: "insert" | "update" | "upsert" | "delete";
  onTableClick?: (table: string) => void;
}

interface DataLineageGraphProps {
  actionId: string;
  actionName: string;
  lineage?: ActionLineage;
  /** Called when a table node is clicked */
  onTableClick?: (table: string) => void;
}

// Custom node components
function SourceNode({ data }: { data: SourceNodeData }) {
  const icons = {
    api: Cloud,
    file: FileText,
    webhook: Globe,
    schedule: Clock,
  };
  const Icon = icons[data.type] || Cloud;

  return (
    <div className="px-4 py-3 rounded-lg border-2 border-blue-500/50 bg-blue-500/10 min-w-[120px]">
      <Handle type="source" position={Position.Right} className="!bg-blue-500" />
      <div className="flex items-center gap-2">
        <Icon weight="duotone" className="h-5 w-5 text-blue-500" />
        <span className="text-sm font-medium">{data.label}</span>
      </div>
      <div className="text-xs text-muted-foreground mt-0.5">{data.type}</div>
    </div>
  );
}

function ActionNode({ data }: { data: ActionNodeData }) {
  return (
    <div className="px-5 py-4 rounded-xl border-2 border-purple-500 bg-purple-500/10 min-w-[140px]">
      <Handle type="target" position={Position.Left} className="!bg-purple-500" />
      <Handle type="source" position={Position.Right} className="!bg-purple-500" />
      <div className="flex items-center gap-2">
        <Lightning weight="fill" className="h-5 w-5 text-purple-500" />
        <span className="text-sm font-semibold">{data.label}</span>
      </div>
      <div className="text-xs text-purple-400 mt-0.5">Action</div>
    </div>
  );
}

function TableNode({ data }: { data: TableNodeData }) {
  const isWrite = !!data.operation;
  const operationColors = {
    insert: "text-green-500",
    update: "text-amber-500",
    upsert: "text-blue-500",
    delete: "text-red-500",
  };

  return (
    <div
      onClick={() => data.onTableClick?.(data.table)}
      className={cn(
        "px-4 py-3 rounded-lg border-2 min-w-[120px] transition-colors cursor-pointer hover:bg-accent/50",
        isWrite
          ? "border-green-500/50 bg-green-500/10"
          : "border-amber-500/50 bg-amber-500/10"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={cn(isWrite ? "!bg-green-500" : "!bg-amber-500")}
      />
      {!isWrite && (
        <Handle
          type="source"
          position={Position.Right}
          className="!bg-amber-500"
        />
      )}
      <div className="flex items-center gap-2">
        <Table
          weight="duotone"
          className={cn("h-5 w-5", isWrite ? "text-green-500" : "text-amber-500")}
        />
        <span className="text-sm font-medium font-mono">{data.table}</span>
      </div>
      {data.operation && (
        <div
          className={cn(
            "text-xs mt-0.5",
            operationColors[data.operation]
          )}
        >
          {data.operation}
        </div>
      )}
      {!isWrite && (
        <div className="text-xs text-amber-400 mt-0.5">reads</div>
      )}
    </div>
  );
}

const nodeTypes = {
  source: SourceNode,
  action: ActionNode,
  table: TableNode,
};

export function DataLineageGraph({
  actionId,
  actionName,
  lineage,
  onTableClick,
}: DataLineageGraphProps) {
  // Build nodes and edges from lineage data
  const { nodes, edges } = useMemo(() => {
    const nodes: Node[] = [];
    const edges: Edge[] = [];

    // Layout constants
    const sourceX = 50;
    const actionX = 300;
    const tableX = 550;
    const startY = 50;
    const nodeSpacing = 100;

    // Add source nodes (left side)
    const sources = lineage?.sources ?? [];
    sources.forEach((source, i) => {
      nodes.push({
        id: `source-${source.id}`,
        type: "source",
        position: { x: sourceX, y: startY + i * nodeSpacing },
        data: { label: source.name, type: source.type },
      });
      edges.push({
        id: `edge-source-${source.id}`,
        source: `source-${source.id}`,
        target: "action",
        animated: true,
        style: { stroke: "#6366f1" },
      });
    });

    // Add read table nodes (left side, below sources)
    const reads = lineage?.reads ?? [];
    const readStartY = startY + sources.length * nodeSpacing;
    reads.forEach((read, i) => {
      nodes.push({
        id: `read-${read.table}`,
        type: "table",
        position: { x: sourceX, y: readStartY + i * nodeSpacing },
        data: { table: read.table, onTableClick },
      });
      edges.push({
        id: `edge-read-${read.table}`,
        source: `read-${read.table}`,
        target: "action",
        animated: true,
        style: { stroke: "#f59e0b" },
      });
    });

    // Calculate action Y position (centered)
    const totalLeftNodes = sources.length + reads.length;
    const writes = lineage?.writes ?? [];
    const totalRightNodes = writes.length;
    const maxNodes = Math.max(totalLeftNodes, totalRightNodes, 1);
    const actionY = startY + ((maxNodes - 1) * nodeSpacing) / 2;

    // Add action node (center)
    nodes.push({
      id: "action",
      type: "action",
      position: { x: actionX, y: actionY },
      data: { label: actionName },
    });

    // Add write table nodes (right side)
    writes.forEach((write, i) => {
      nodes.push({
        id: `write-${write.table}`,
        type: "table",
        position: { x: tableX, y: startY + i * nodeSpacing },
        data: { table: write.table, operation: write.operation, onTableClick },
      });
      edges.push({
        id: `edge-write-${write.table}`,
        source: "action",
        target: `write-${write.table}`,
        animated: true,
        style: { stroke: "#22c55e" },
      });
    });

    // If no lineage data, show placeholder
    if (nodes.length === 1) {
      // Just the action node
    }

    return { nodes, edges };
  }, [actionName, lineage, onTableClick]);

  // Empty state
  if (!lineage || (lineage.sources.length === 0 && lineage.reads.length === 0 && lineage.writes.length === 0)) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <Database weight="duotone" className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm font-medium">No data lineage detected</p>
        <p className="text-xs mt-1 text-center max-w-[300px]">
          This action doesn't appear to read or write any tables.
          Switch to Code view to see the source.
        </p>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.5}
        maxZoom={1.5}
        proOptions={{ hideAttribution: true }}
      >
        <Background color="#888" gap={16} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
