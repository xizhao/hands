/**
 * ActionFlowGraph - Unified visualization of action data flow
 *
 * Shows the complete data lineage from TS AST analysis:
 * - External sources (APIs, webhooks, schedules)
 * - SQL operations with compact relational algebra preview and AI hints
 * - Target tables (reads and writes)
 */

import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  Background,
  type Node,
  type Edge,
  Position,
  Handle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  Cloud,
  Clock,
  Globe,
  FileText,
  Database,
  Table,
  Funnel,
  GitMerge,
  Function,
  ArrowSquareOut,
  Envelope,
  Terminal,
  CloudArrowUp,
  ArrowRight,
  PencilSimple,
  Plus,
  Trash,
} from "@phosphor-icons/react";
import { useMemo, createContext, useContext, useState, useEffect, useRef } from "react";
import { cn } from "../lib/utils";
import { usePrefetchHints } from "../hooks/use-hint";
import type { SqlFlow } from "../action-flow";

// Node dimensions for dagre layout
const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;

/**
 * Apply dagre layout to nodes and edges
 */
function applyDagreLayout(
  nodes: Node[],
  edges: Edge[],
  direction: "horizontal" | "vertical"
): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction === "horizontal" ? "LR" : "TB",
    nodesep: 40,
    ranksep: 60,
    marginx: 20,
    marginy: 20,
  });

  // Add nodes to dagre
  for (const node of nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Add edges to dagre
  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  // Run layout
  dagre.layout(g);

  // Apply positions back to nodes
  return nodes.map((node) => {
    const dagreNode = g.node(node.id);
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - NODE_HEIGHT / 2,
      },
    };
  });
}

// Layout direction context
type LayoutDirection = "horizontal" | "vertical";
const LayoutContext = createContext<LayoutDirection>("horizontal");

// Context to share hints with child nodes
const HintContext = createContext<{
  getHint: (sql: string) => string | undefined;
  isLoading: boolean;
}>({ getHint: () => undefined, isLoading: false });

// Hook to get handle positions based on layout
function useHandlePositions() {
  const direction = useContext(LayoutContext);
  return direction === "horizontal"
    ? { source: Position.Right, target: Position.Left }
    : { source: Position.Bottom, target: Position.Top };
}

/** Source types */
type SourceType = "api" | "file" | "webhook" | "schedule";

/** External source node data */
interface SourceNodeData {
  label: string;
  sourceType: SourceType;
}

/** Single SQL query info */
interface SqlQueryInfo {
  description: string;
  operation: "select" | "insert" | "update" | "delete" | "unknown";
  tables: string[];
  flow?: SqlFlow;
  rawSql?: string;
}

/** SQL operation node with compact flow preview (single query) */
interface SqlNodeData extends SqlQueryInfo {
  onTableClick?: (table: string) => void;
}

/** Grouped SQL operations (multiple queries at same level) */
interface SqlGroupNodeData {
  /** Primary operation type for the group */
  operation: "select" | "insert" | "update" | "delete" | "unknown";
  /** All queries in this group */
  queries: SqlQueryInfo[];
  /** Combined unique tables */
  tables: string[];
  onTableClick?: (table: string) => void;
}

/** Table node data */
interface TableNodeData {
  table: string;
  operation?: "read" | "insert" | "update" | "upsert" | "delete";
  description?: string;
  onTableClick?: (table: string) => void;
}

/** Sink types */
type SinkType = "result" | "http_out" | "email" | "log";

/** Sink node data */
interface SinkNodeData {
  sinkType: SinkType;
  label: string;
  /** Additional context (URL, variable name, etc.) */
  detail?: string;
}

interface ActionFlowGraphProps {
  /** Parsed SQL queries with their flows */
  sqlQueries: Array<{
    description: string;
    operation: "select" | "insert" | "update" | "delete" | "unknown";
    tables: Array<{ table: string; usage: "read" | "write" | "both" }>;
    flow?: SqlFlow;
    /** Raw SQL for AI hint generation */
    rawSql?: string;
  }>;
  /** External data sources */
  sources?: Array<{
    id: string;
    name: string;
    type: SourceType;
  }>;
  /** Output sinks (HTTP calls, return values, etc.) */
  sinks?: Array<{
    id: string;
    type: SinkType;
    label: string;
    detail?: string;
  }>;
  /** Called when a table node is clicked */
  onTableClick?: (table: string) => void;
  className?: string;
}

// Icons for source types
const sourceIcons: Record<SourceType, typeof Cloud> = {
  api: Cloud,
  file: FileText,
  webhook: Globe,
  schedule: Clock,
};

/** Source node component - muted styling, icon-focused */
function SourceNode({ data }: { data: SourceNodeData }) {
  const Icon = sourceIcons[data.sourceType] || Cloud;
  const { source } = useHandlePositions();
  return (
    <div className="px-3 py-2 rounded-lg border border-border bg-card w-[140px] shadow-sm overflow-hidden">
      <Handle type="source" position={source} className="!bg-muted-foreground" />
      <div className="flex items-center gap-2">
        <div className="p-1 rounded bg-muted shrink-0">
          <Icon weight="duotone" className="h-4 w-4 text-foreground" />
        </div>
        <div className="overflow-hidden">
          <div className="text-xs font-medium truncate">{data.label}</div>
          <div className="text-[10px] text-muted-foreground">{data.sourceType}</div>
        </div>
      </div>
    </div>
  );
}

/** Compact SQL flow preview - shows key operations inline with muted styling */
function SqlFlowPreview({ flow }: { flow: SqlFlow }) {
  const ops: Array<{ icon: typeof Funnel; label: string }> = [];

  for (const node of flow.nodes) {
    switch (node.type) {
      case "filter":
        ops.push({ icon: Funnel, label: "filter" });
        break;
      case "join":
        ops.push({ icon: GitMerge, label: "join" });
        break;
      case "aggregate":
        ops.push({ icon: Function, label: "group" });
        break;
    }
  }

  if (ops.length === 0) return null;

  // Dedupe consecutive same operations
  const uniqueOps = ops.filter((op, i) => i === 0 || op.label !== ops[i - 1].label);

  return (
    <div className="flex items-center gap-1 mt-1.5">
      {uniqueOps.slice(0, 3).map((op, i) => {
        const Icon = op.icon;
        return (
          <span
            key={i}
            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] bg-muted text-muted-foreground"
          >
            <Icon weight="bold" className="h-2.5 w-2.5" />
            {op.label}
          </span>
        );
      })}
      {uniqueOps.length > 3 && (
        <span className="text-[9px] text-muted-foreground">+{uniqueOps.length - 3}</span>
      )}
    </div>
  );
}

// Icons for SQL operations - differentiate by icon, not color
const sqlOpIcons: Record<string, typeof Database> = {
  select: ArrowRight,
  insert: Plus,
  update: PencilSimple,
  delete: Trash,
  unknown: Database,
};

/** SQL operation node - muted colors, icon-focused differentiation */
function SqlNode({ data }: { data: SqlNodeData }) {
  const { source, target } = useHandlePositions();
  const Icon = sqlOpIcons[data.operation] || Database;

  // Get AI-generated hint from context
  const { getHint, isLoading } = useContext(HintContext);
  const hint = data.rawSql ? getHint(data.rawSql) : undefined;
  const displayText = hint || data.description;

  return (
    <div className="px-3 py-2 rounded-lg border border-border bg-card w-[160px] shadow-sm overflow-hidden">
      <Handle type="target" position={target} className="!bg-muted-foreground" />
      <Handle type="source" position={source} className="!bg-muted-foreground" />

      {/* Operation badge */}
      <div className="flex items-center gap-2 mb-1">
        <div className="p-1 rounded bg-muted shrink-0">
          <Icon weight="bold" className="h-3 w-3 text-foreground" />
        </div>
        <span className="text-[10px] font-medium uppercase text-muted-foreground">
          {data.operation}
        </span>
      </div>

      {/* AI hint or fallback description */}
      <div className="text-[11px] font-medium truncate">
        {isLoading && !hint ? (
          <span className="text-muted-foreground animate-pulse">...</span>
        ) : (
          displayText
        )}
      </div>

      {/* Tables involved */}
      {data.tables.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 overflow-hidden">
          {data.tables.slice(0, 2).map((table) => (
            <span
              key={table}
              onClick={() => data.onTableClick?.(table)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-mono bg-muted text-muted-foreground cursor-pointer hover:text-foreground transition-colors truncate max-w-[60px]"
            >
              <Table weight="bold" className="h-2 w-2 shrink-0" />
              <span className="truncate">{table}</span>
            </span>
          ))}
          {data.tables.length > 2 && (
            <span className="text-[8px] text-muted-foreground">+{data.tables.length - 2}</span>
          )}
        </div>
      )}

      {/* Compact SQL flow preview */}
      {data.flow && <SqlFlowPreview flow={data.flow} />}
    </div>
  );
}

/** Aggregate flow operations from multiple queries for preview badges */
function aggregateFlowOps(queries: SqlQueryInfo[]): SqlFlow | undefined {
  const allNodes: SqlFlow["nodes"] = [];
  for (const q of queries) {
    if (q.flow) {
      allNodes.push(...q.flow.nodes);
    }
  }
  if (allNodes.length === 0) return undefined;
  // Return minimal SqlFlow for badge display (only nodes matter for SqlFlowPreview)
  return { nodes: allNodes, rootId: "aggregated", operation: "select" };
}

/** Grouped SQL node - shows multiple queries at the same level */
function SqlGroupNode({ data }: { data: SqlGroupNodeData }) {
  const { source, target } = useHandlePositions();
  const Icon = sqlOpIcons[data.operation] || Database;
  const { getHint, isLoading } = useContext(HintContext);

  // Aggregate flow operations from all queries
  const aggregatedFlow = useMemo(() => aggregateFlowOps(data.queries), [data.queries]);

  return (
    <div className="px-3 py-2 rounded-lg border border-border bg-card w-[180px] shadow-sm overflow-hidden">
      <Handle type="target" position={target} className="!bg-muted-foreground" />
      <Handle type="source" position={source} className="!bg-muted-foreground" />

      {/* Operation header */}
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1 rounded bg-muted shrink-0">
          <Icon weight="bold" className="h-3 w-3 text-foreground" />
        </div>
        <span className="text-[10px] font-medium uppercase text-muted-foreground truncate">
          {data.operation}
        </span>
        <span className="text-[9px] text-muted-foreground ml-auto shrink-0">
          {data.queries.length}
        </span>
      </div>

      {/* Query list */}
      <div className="space-y-0.5">
        {data.queries.slice(0, 3).map((query, i) => {
          const hint = query.rawSql ? getHint(query.rawSql) : undefined;
          const displayText = hint || query.description;
          return (
            <div
              key={i}
              className="flex items-center gap-1 text-[10px] text-foreground overflow-hidden"
            >
              <span className="text-muted-foreground shrink-0">•</span>
              <span className="truncate">
                {isLoading && !hint ? (
                  <span className="text-muted-foreground animate-pulse">...</span>
                ) : (
                  displayText
                )}
              </span>
            </div>
          );
        })}
        {data.queries.length > 3 && (
          <div className="text-[9px] text-muted-foreground pl-2.5">
            +{data.queries.length - 3} more
          </div>
        )}
      </div>

      {/* Aggregated flow badges */}
      {aggregatedFlow && <SqlFlowPreview flow={aggregatedFlow} />}

      {/* Tables involved */}
      {data.tables.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-1.5 overflow-hidden">
          {data.tables.slice(0, 2).map((table) => (
            <span
              key={table}
              onClick={() => data.onTableClick?.(table)}
              className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[8px] font-mono bg-muted text-muted-foreground cursor-pointer hover:text-foreground transition-colors truncate max-w-[70px]"
            >
              <Table weight="bold" className="h-2 w-2 shrink-0" />
              <span className="truncate">{table}</span>
            </span>
          ))}
          {data.tables.length > 2 && (
            <span className="text-[8px] text-muted-foreground">+{data.tables.length - 2}</span>
          )}
        </div>
      )}
    </div>
  );
}

// Icons for table operations
const tableOpIcons: Record<string, typeof Database> = {
  read: ArrowRight,
  insert: Plus,
  update: PencilSimple,
  upsert: PencilSimple,
  delete: Trash,
};

/** Table node component - muted styling, icon-focused */
function TableNode({ data }: { data: TableNodeData }) {
  const { source, target } = useHandlePositions();
  const isWrite = data.operation && data.operation !== "read";
  const Icon = tableOpIcons[data.operation || "read"] || Table;

  return (
    <div
      onClick={() => data.onTableClick?.(data.table)}
      className="px-3 py-2 rounded-lg border border-border bg-card w-[130px] cursor-pointer hover:bg-accent/50 transition-colors shadow-sm overflow-hidden"
    >
      <Handle type="target" position={target} className="!bg-muted-foreground" />
      {!isWrite && <Handle type="source" position={source} className="!bg-muted-foreground" />}

      <div className="flex items-center gap-2">
        <div className="p-1 rounded bg-muted shrink-0">
          <Table weight="duotone" className="h-3.5 w-3.5 text-foreground" />
        </div>
        <div className="overflow-hidden">
          <div className="text-xs font-mono truncate">{data.table}</div>
          {data.operation && (
            <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
              <Icon weight="bold" className="h-2.5 w-2.5 shrink-0" />
              {data.operation}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// Icons for sink types
const sinkIcons: Record<SinkType, typeof ArrowSquareOut> = {
  result: ArrowSquareOut,
  http_out: CloudArrowUp,
  email: Envelope,
  log: Terminal,
};

// Sink type labels (log type doesn't need a label - it's just "Do Nothing")
const sinkLabels: Partial<Record<SinkType, string>> = {
  result: "Output",
  http_out: "API Call",
  email: "Email",
};

/** Sink node component - muted styling, icon-focused differentiation */
function SinkNode({ data }: { data: SinkNodeData }) {
  const { target } = useHandlePositions();
  const Icon = sinkIcons[data.sinkType] || ArrowSquareOut;

  // Simple "Do Nothing" style - centered, minimal
  if (data.sinkType === "log" && !data.detail) {
    return (
      <div className="relative">
        <Handle type="target" position={target} className="!bg-muted-foreground" />
        <div className="px-4 py-2 rounded-lg w-[120px] border border-dashed border-border bg-muted/20 text-center">
          <span className="text-xs text-muted-foreground">{data.label}</span>
        </div>
      </div>
    );
  }

  // Regular sink with icon and details
  const typeLabel = sinkLabels[data.sinkType] || data.sinkType;
  const isDashed = data.sinkType === "result" || data.sinkType === "log";

  return (
    <div className="relative">
      <Handle type="target" position={target} className="!bg-muted-foreground" />
      <div
        className={cn(
          "px-3 py-2 rounded-lg w-[130px] shadow-sm overflow-hidden",
          isDashed
            ? "border border-dashed border-border bg-muted/30"
            : "border border-border bg-card"
        )}
      >
        <div className="flex items-center gap-2">
          <div className="p-1 rounded bg-muted shrink-0">
            <Icon weight="duotone" className="h-3.5 w-3.5 text-foreground" />
          </div>
          <div className="overflow-hidden">
            <div className="text-[10px] font-medium uppercase text-muted-foreground">
              {typeLabel}
            </div>
            <div className="text-[11px] font-medium truncate">{data.label}</div>
          </div>
        </div>
        {data.detail && (
          <div className="text-[9px] text-muted-foreground mt-1 truncate font-mono">
            {data.detail}
          </div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  source: SourceNode,
  sql: SqlNode,
  sqlGroup: SqlGroupNode,
  table: TableNode,
  sink: SinkNode,
};

/**
 * Build graph nodes and edges from action flow data
 */
function buildGraph(
  sources: ActionFlowGraphProps["sources"],
  sqlQueries: ActionFlowGraphProps["sqlQueries"],
  sinks: ActionFlowGraphProps["sinks"],
  onTableClick?: (table: string) => void,
  direction: LayoutDirection = "horizontal"
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  const pos = { x: 0, y: 0 }; // Placeholder - dagre will calculate actual positions

  // Track tables by usage to avoid duplicates
  const readTables = new Map<string, { description?: string }>();
  const writeTables = new Map<string, { operation: string; description?: string }>();

  // Collect all tables from SQL queries
  for (const query of sqlQueries) {
    for (const tableRef of query.tables) {
      if (tableRef.usage === "read" || tableRef.usage === "both") {
        if (!readTables.has(tableRef.table)) {
          readTables.set(tableRef.table, { description: query.description });
        }
      }
      if (tableRef.usage === "write" || tableRef.usage === "both") {
        writeTables.set(tableRef.table, {
          operation: query.operation,
          description: query.description,
        });
      }
    }
  }

  // Add external sources
  for (const source of sources || []) {
    nodes.push({
      id: `source-${source.id}`,
      type: "source",
      position: pos,
      data: { label: source.name, sourceType: source.type },
    });
  }

  // Add read tables
  for (const [table, info] of readTables) {
    // Skip if also written (will show in output)
    if (writeTables.has(table)) continue;

    nodes.push({
      id: `read-${table}`,
      type: "table",
      position: pos,
      data: { table, operation: "read", description: info.description, onTableClick },
    });
  }

  // Group SQL queries by level: reads (select) vs writes (insert/update/delete/upsert)
  const readQueries = sqlQueries.filter((q) => q.operation === "select");
  const writeQueries = sqlQueries.filter((q) => q.operation !== "select");

  // Track group node IDs for edge connections
  const sqlGroupIds: string[] = [];

  // SQL operations (grouped by level)
  // Add read group if there are read queries
  if (readQueries.length > 0) {
    const groupId = "sql-reads";
    sqlGroupIds.push(groupId);

    const allTables = [...new Set(readQueries.flatMap((q) => q.tables.map((t) => t.table)))];

    if (readQueries.length === 1) {
      const query = readQueries[0];
      nodes.push({
        id: groupId,
        type: "sql",
        position: pos,
        data: {
          description: query.description,
          operation: query.operation,
          tables: query.tables.map((t) => t.table),
          flow: query.flow,
          rawSql: query.rawSql,
          onTableClick,
        },
      });
    } else {
      nodes.push({
        id: groupId,
        type: "sqlGroup",
        position: pos,
        data: {
          operation: "select",
          queries: readQueries.map((q) => ({
            description: q.description,
            operation: q.operation,
            tables: q.tables.map((t) => t.table),
            flow: q.flow,
            rawSql: q.rawSql,
          })),
          tables: allTables,
          onTableClick,
        },
      });
    }

    // Connect sources/read tables to this group
    for (const source of sources || []) {
      edges.push({
        id: `edge-source-${source.id}-${groupId}`,
        source: `source-${source.id}`,
        target: groupId,
      });
    }

    for (const [table] of readTables) {
      if (!writeTables.has(table)) {
        edges.push({
          id: `edge-read-${table}-${groupId}`,
          source: `read-${table}`,
          target: groupId,
        });
      }
    }
  }

  // Add write group if there are write queries
  if (writeQueries.length > 0) {
    const groupId = "sql-writes";
    sqlGroupIds.push(groupId);

    const allTables = [...new Set(writeQueries.flatMap((q) => q.tables.map((t) => t.table)))];
    const opCounts = writeQueries.reduce((acc, q) => {
      acc[q.operation] = (acc[q.operation] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const primaryOp = Object.entries(opCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || "insert";

    if (writeQueries.length === 1) {
      const query = writeQueries[0];
      nodes.push({
        id: groupId,
        type: "sql",
        position: pos,
        data: {
          description: query.description,
          operation: query.operation,
          tables: query.tables.map((t) => t.table),
          flow: query.flow,
          rawSql: query.rawSql,
          onTableClick,
        },
      });
    } else {
      nodes.push({
        id: groupId,
        type: "sqlGroup",
        position: pos,
        data: {
          operation: primaryOp as SqlGroupNodeData["operation"],
          queries: writeQueries.map((q) => ({
            description: q.description,
            operation: q.operation,
            tables: q.tables.map((t) => t.table),
            flow: q.flow,
            rawSql: q.rawSql,
          })),
          tables: allTables,
          onTableClick,
        },
      });
    }

    // Connect from read group if it exists
    if (readQueries.length > 0) {
      edges.push({
        id: `edge-reads-to-writes`,
        source: "sql-reads",
        target: groupId,
      });
    } else {
      // Connect directly from sources/read tables
      for (const source of sources || []) {
        edges.push({
          id: `edge-source-${source.id}-${groupId}`,
          source: `source-${source.id}`,
          target: groupId,
        });
      }
    }
  }

  // Write tables
  for (const [table] of writeTables) {
    nodes.push({
      id: `write-${table}`,
      type: "table",
      position: pos,
      data: {
        table,
        operation: writeTables.get(table)?.operation as TableNodeData["operation"],
        onTableClick,
      },
    });

    if (writeQueries.length > 0) {
      edges.push({
        id: `edge-writes-to-${table}`,
        source: "sql-writes",
        target: `write-${table}`,
      });
    }
  }

  // Sinks
  for (const sink of sinks || []) {
    nodes.push({
      id: `sink-${sink.id}`,
      type: "sink",
      position: pos,
      data: {
        sinkType: sink.type,
        label: sink.label,
        detail: sink.detail,
      },
    });

    // Connect SQL groups to sinks
    if (sink.type === "result" && readQueries.length > 0) {
      edges.push({
        id: `edge-reads-sink-${sink.id}`,
        source: "sql-reads",
        target: `sink-${sink.id}`,
      });
    } else if (sink.type === "http_out" && writeQueries.length > 0) {
      edges.push({
        id: `edge-writes-sink-${sink.id}`,
        source: "sql-writes",
        target: `sink-${sink.id}`,
      });
    } else if (sink.type === "log") {
      const lastGroup = writeQueries.length > 0 ? "sql-writes" : "sql-reads";
      if (sqlGroupIds.length > 0) {
        edges.push({
          id: `edge-${lastGroup}-sink-${sink.id}`,
          source: lastGroup,
          target: `sink-${sink.id}`,
          animated: true,
          style: { stroke: "hsl(var(--muted-foreground))", strokeWidth: 1.5, opacity: 0.5 },
        });
      }
    }

  }

  // Apply dagre layout to position all nodes
  const layoutedNodes = applyDagreLayout(nodes, edges, direction);
  return { nodes: layoutedNodes, edges };
}

// Breakpoint for switching layouts (px)
const HORIZONTAL_BREAKPOINT = 600;

/** Auto-fit the graph when container resizes */
function AutoFitView() {
  const { fitView } = useReactFlow();

  useEffect(() => {
    // Small delay to ensure nodes are positioned
    const timer = setTimeout(() => {
      fitView({ padding: 0.2, duration: 200 });
    }, 50);
    return () => clearTimeout(timer);
  }, [fitView]);

  return null;
}

export function ActionFlowGraph({
  sqlQueries,
  sources,
  sinks,
  onTableClick,
  className,
}: ActionFlowGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<LayoutDirection>("horizontal");
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Detect container size and switch layout direction
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        setContainerSize({ width, height });
        setDirection(width >= HORIZONTAL_BREAKPOINT ? "horizontal" : "vertical");
      }
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const { nodes, edges } = useMemo(
    () => buildGraph(sources, sqlQueries, sinks, onTableClick, direction),
    [sources, sqlQueries, sinks, onTableClick, direction]
  );

  // Collect raw SQL for hint prefetching
  const sqlContents = useMemo(
    () => sqlQueries.map((q) => q.rawSql).filter((sql): sql is string => !!sql),
    [sqlQueries]
  );

  // Prefetch hints for all SQL operations
  const { getHint, isLoading } = usePrefetchHints(sqlContents);

  // Empty state
  if (sqlQueries.length === 0 && (!sources || sources.length === 0)) {
    return (
      <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-8">
        <Database weight="duotone" className="h-12 w-12 mb-4 opacity-50" />
        <p className="text-sm font-medium">No data flow detected</p>
        <p className="text-xs mt-1 text-center max-w-[300px]">
          This action doesn't appear to have any SQL operations.
          Switch to Code view to see the source.
        </p>
      </div>
    );
  }

  return (
    <LayoutContext.Provider value={direction}>
      <HintContext.Provider value={{ getHint, isLoading }}>
        <div ref={containerRef} className={cn("h-full w-full overflow-hidden", className)}>
          <ReactFlowProvider>
            <ReactFlow
              key={`${direction}-${containerSize.width}-${containerSize.height}`}
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              fitView
              fitViewOptions={{
                padding: 0.2,
                minZoom: 0.5,
                maxZoom: 1.5,
              }}
              minZoom={0.5}
              maxZoom={1.5}
              proOptions={{ hideAttribution: true }}
              nodesDraggable={false}
              nodesConnectable={false}
              elementsSelectable={false}
              panOnDrag={false}
              zoomOnScroll={false}
              zoomOnPinch={false}
              zoomOnDoubleClick={false}
              preventScrolling={false}
            >
              <AutoFitView />
              <Background color="hsl(var(--muted-foreground))" gap={16} size={1} className="opacity-20" />
            </ReactFlow>
          </ReactFlowProvider>
        </div>
      </HintContext.Provider>
    </LayoutContext.Provider>
  );
}
