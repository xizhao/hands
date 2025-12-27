/**
 * WorkflowStepGraph - Visualization of workflow step execution
 *
 * Shows the runtime execution of workflow steps:
 * - step.do() operations with status
 * - step.sleep() delays
 * - step.sleepUntil() scheduled waits
 * - step.waitForEvent() human-in-the-loop
 *
 * Uses React Flow for visualization with status-based styling.
 */

import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type Node,
  type Edge,
  Position,
  Handle,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  CheckCircle,
  XCircle,
  CircleNotch,
  Clock,
  Hourglass,
  Play,
  Pause,
  Timer,
  UserCircle,
  Lightning,
  CaretRight,
} from "@phosphor-icons/react";
import { useMemo, createContext, useContext } from "react";
import { cn } from "../lib/utils";

// =============================================================================
// Types (matching @hands/core/primitives StepRecord)
// =============================================================================

export type StepStatus = "pending" | "running" | "success" | "failed" | "waiting";
export type StepType = "do" | "sleep" | "sleepUntil" | "waitForEvent";

export interface StepRecord {
  name: string;
  type: StepType;
  startedAt?: string;
  finishedAt?: string;
  status: StepStatus;
  result?: unknown;
  error?: string;
  children?: StepRecord[];
  config?: {
    retries?: { limit: number; delay: string | number; backoff?: string };
    timeout?: string | number;
  };
}

export interface WorkflowStepGraphProps {
  /** Steps from workflow execution */
  steps: StepRecord[];
  /** Height of the graph container */
  height?: number | string;
  /** Additional CSS classes */
  className?: string;
  /** Callback when a step node is clicked */
  onStepClick?: (step: StepRecord) => void;
}

// =============================================================================
// Layout
// =============================================================================

const NODE_WIDTH = 180;
const NODE_HEIGHT = 56;

interface NodeData {
  step?: StepRecord;
  children?: StepRecord[];
  onClick?: (step: StepRecord) => void;
  status?: "success" | "failed";
}

function applyDagreLayout(nodes: Node[], edges: Edge[]): Node[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: "LR",
    nodesep: 24,
    ranksep: 48,
    marginx: 16,
    marginy: 16,
  });

  for (const node of nodes) {
    const data = node.data as NodeData;
    const childCount = data.children?.length ?? 0;
    const height = childCount > 0 ? NODE_HEIGHT + childCount * 28 : NODE_HEIGHT;
    g.setNode(node.id, { width: NODE_WIDTH, height });
  }

  for (const edge of edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  return nodes.map((node) => {
    const dagreNode = g.node(node.id);
    const data = node.data as NodeData;
    const childCount = data.children?.length ?? 0;
    const height = childCount > 0 ? NODE_HEIGHT + childCount * 28 : NODE_HEIGHT;
    return {
      ...node,
      position: {
        x: dagreNode.x - NODE_WIDTH / 2,
        y: dagreNode.y - height / 2,
      },
    };
  });
}

// =============================================================================
// Status Styling
// =============================================================================

const statusConfig: Record<
  StepStatus,
  { icon: typeof CheckCircle; color: string; bg: string; border: string; animate?: boolean }
> = {
  pending: {
    icon: Clock,
    color: "text-muted-foreground",
    bg: "bg-muted/50",
    border: "border-muted-foreground/30",
  },
  running: {
    icon: CircleNotch,
    color: "text-blue-500",
    bg: "bg-blue-500/10",
    border: "border-blue-500/30",
    animate: true,
  },
  success: {
    icon: CheckCircle,
    color: "text-green-500",
    bg: "bg-green-500/10",
    border: "border-green-500/30",
  },
  failed: {
    icon: XCircle,
    color: "text-red-500",
    bg: "bg-red-500/10",
    border: "border-red-500/30",
  },
  waiting: {
    icon: Hourglass,
    color: "text-amber-500",
    bg: "bg-amber-500/10",
    border: "border-amber-500/30",
    animate: true,
  },
};

const stepTypeConfig: Record<StepType, { icon: typeof Play; label: string }> = {
  do: { icon: Lightning, label: "Execute" },
  sleep: { icon: Timer, label: "Sleep" },
  sleepUntil: { icon: Clock, label: "Sleep Until" },
  waitForEvent: { icon: UserCircle, label: "Wait for Event" },
};

// =============================================================================
// Node Components
// =============================================================================

interface StepNodeData {
  step: StepRecord;
  onClick?: (step: StepRecord) => void;
}

function StepNode({ data }: { data: StepNodeData }) {
  const { step, onClick } = data;
  const status = statusConfig[step.status];
  const typeConfig = stepTypeConfig[step.type];
  const StatusIcon = status.icon;
  const TypeIcon = typeConfig.icon;

  const duration = step.startedAt && step.finishedAt
    ? new Date(step.finishedAt).getTime() - new Date(step.startedAt).getTime()
    : null;

  return (
    <div
      onClick={() => onClick?.(step)}
      className={cn(
        "rounded-lg border px-3 py-2 min-w-[160px] cursor-pointer transition-all hover:shadow-md",
        status.bg,
        status.border,
        onClick && "hover:scale-[1.02]"
      )}
    >
      <Handle
        type="target"
        position={Position.Left}
        className={cn("!w-2 !h-2 !bg-muted-foreground", status.border)}
      />

      {/* Header */}
      <div className="flex items-center gap-2">
        <div className={cn("shrink-0", status.color)}>
          <StatusIcon
            weight={step.status === "success" ? "fill" : "bold"}
            className={cn("h-4 w-4", status.animate && "animate-spin")}
          />
        </div>
        <span className="text-xs font-medium truncate flex-1">{step.name}</span>
        <div className="text-muted-foreground">
          <TypeIcon weight="duotone" className="h-3.5 w-3.5" />
        </div>
      </div>

      {/* Type label and duration */}
      <div className="flex items-center justify-between mt-1">
        <span className="text-[10px] text-muted-foreground">{typeConfig.label}</span>
        {duration !== null && (
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {duration < 1000 ? `${duration}ms` : `${(duration / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>

      {/* Error message */}
      {step.error && (
        <div className="mt-1 text-[10px] text-red-500 truncate" title={step.error}>
          {step.error.slice(0, 40)}...
        </div>
      )}

      {/* Retry config badge */}
      {step.config?.retries && (
        <div className="mt-1">
          <span className="text-[9px] px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            retries: {step.config.retries.limit}
          </span>
        </div>
      )}

      {/* Nested children (parallel steps) */}
      {step.children && step.children.length > 0 && (
        <div className="mt-2 pt-2 border-t border-dashed space-y-1">
          {step.children.map((child, i) => {
            const childStatus = statusConfig[child.status];
            const ChildIcon = childStatus.icon;
            return (
              <div key={i} className="flex items-center gap-1.5 text-[10px]">
                <ChildIcon
                  weight={child.status === "success" ? "fill" : "bold"}
                  className={cn("h-3 w-3", childStatus.color, childStatus.animate && "animate-spin")}
                />
                <span className="truncate">{child.name}</span>
              </div>
            );
          })}
        </div>
      )}

      <Handle
        type="source"
        position={Position.Right}
        className={cn("!w-2 !h-2 !bg-muted-foreground", status.border)}
      />
    </div>
  );
}

function StartNode() {
  return (
    <div className="rounded-full bg-green-500/20 border border-green-500/40 p-2">
      <Play weight="fill" className="h-4 w-4 text-green-500" />
      <Handle
        type="source"
        position={Position.Right}
        className="!w-2 !h-2 !bg-green-500"
      />
    </div>
  );
}

function EndNode({ data }: { data: { status: "success" | "failed" } }) {
  const isSuccess = data.status === "success";
  return (
    <div
      className={cn(
        "rounded-full p-2 border",
        isSuccess
          ? "bg-green-500/20 border-green-500/40"
          : "bg-red-500/20 border-red-500/40"
      )}
    >
      {isSuccess ? (
        <CheckCircle weight="fill" className="h-4 w-4 text-green-500" />
      ) : (
        <XCircle weight="fill" className="h-4 w-4 text-red-500" />
      )}
      <Handle
        type="target"
        position={Position.Left}
        className={cn("!w-2 !h-2", isSuccess ? "!bg-green-500" : "!bg-red-500")}
      />
    </div>
  );
}

const nodeTypes = {
  step: StepNode,
  start: StartNode,
  end: EndNode,
};

// =============================================================================
// Graph Building
// =============================================================================

function buildGraph(
  steps: StepRecord[],
  onStepClick?: (step: StepRecord) => void
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [];
  const edges: Edge[] = [];

  // Start node
  nodes.push({
    id: "start",
    type: "start",
    position: { x: 0, y: 0 },
    data: {},
  });

  // Step nodes
  let prevId = "start";
  steps.forEach((step, index) => {
    const nodeId = `step-${index}`;
    nodes.push({
      id: nodeId,
      type: "step",
      position: { x: 0, y: 0 },
      data: { step, onClick: onStepClick, children: step.children },
    });

    // Edge from previous
    edges.push({
      id: `edge-${prevId}-${nodeId}`,
      source: prevId,
      target: nodeId,
      animated: step.status === "running" || step.status === "waiting",
      style: {
        stroke:
          step.status === "failed"
            ? "hsl(0 84% 60%)"
            : step.status === "success"
            ? "hsl(142 76% 36%)"
            : "hsl(var(--muted-foreground))",
        strokeWidth: 2,
      },
    });

    prevId = nodeId;
  });

  // End node (if workflow completed)
  const lastStep = steps[steps.length - 1];
  if (lastStep && (lastStep.status === "success" || lastStep.status === "failed")) {
    nodes.push({
      id: "end",
      type: "end",
      position: { x: 0, y: 0 },
      data: { status: lastStep.status },
    });

    edges.push({
      id: `edge-${prevId}-end`,
      source: prevId,
      target: "end",
      style: {
        stroke:
          lastStep.status === "failed"
            ? "hsl(0 84% 60%)"
            : "hsl(142 76% 36%)",
        strokeWidth: 2,
      },
    });
  }

  return { nodes, edges };
}

// =============================================================================
// Main Component
// =============================================================================

function WorkflowStepGraphInner({
  steps,
  height = 200,
  className,
  onStepClick,
}: WorkflowStepGraphProps) {
  const { nodes, edges } = useMemo(() => {
    const { nodes: rawNodes, edges } = buildGraph(steps, onStepClick);
    const layoutedNodes = applyDagreLayout(rawNodes, edges);
    return { nodes: layoutedNodes, edges };
  }, [steps, onStepClick]);

  if (steps.length === 0) {
    return (
      <div
        className={cn("flex items-center justify-center text-muted-foreground text-sm", className)}
        style={{ height }}
      >
        No steps recorded
      </div>
    );
  }

  return (
    <div className={cn("rounded-lg border bg-muted/30", className)} style={{ height }}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{ padding: 0.3, minZoom: 0.5, maxZoom: 1.5 }}
        minZoom={0.5}
        maxZoom={1.5}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnDrag={true}
        zoomOnScroll={true}
        zoomOnPinch={true}
        preventScrolling={false}
      >
        <Background gap={16} size={1} color="hsl(var(--muted-foreground) / 0.1)" />
      </ReactFlow>
    </div>
  );
}

export function WorkflowStepGraph(props: WorkflowStepGraphProps) {
  return (
    <ReactFlowProvider>
      <WorkflowStepGraphInner {...props} />
    </ReactFlowProvider>
  );
}
