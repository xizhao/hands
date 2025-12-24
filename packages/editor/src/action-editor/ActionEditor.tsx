/**
 * ActionEditor - Visual and code editor for actions
 *
 * Two modes:
 * - Visual (default): Unified flow diagram showing data lineage with compact SQL flow
 * - Code: Syntax-highlighted TypeScript source
 *
 * Uses AST-based extraction to analyze action source code and
 * display the complete data flow from sources through SQL operations to tables.
 */

import { Code, GitBranch } from "@phosphor-icons/react";
import { useState, useMemo } from "react";
import { cn } from "../lib/utils";
import { ActionFlowGraph } from "./ActionFlowGraph";
import { ActionCodeView } from "./ActionCodeView";
import { extractActionFlow, parseSqlToFlow, type SqlFlow } from "../action-flow";

export interface ActionEditorProps {
  /** Action ID */
  actionId: string;
  /** Action name for display */
  name: string;
  /** Action source code */
  source: string;
  /** Additional CSS classes */
  className?: string;
  /** Called when a table node is clicked */
  onTableClick?: (table: string) => void;
  /** Called when an action node is clicked (for chains/inline calls) */
  onActionClick?: (actionId: string) => void;
}

/** Source types */
type SourceType = "api" | "file" | "webhook" | "schedule";

/** Parsed SQL query with flow */
interface ParsedQuery {
  description: string;
  operation: "select" | "insert" | "update" | "delete" | "unknown";
  tables: Array<{ table: string; usage: "read" | "write" | "both" }>;
  flow?: SqlFlow;
  /** Raw SQL for AI hint generation */
  rawSql?: string;
}

/** External source */
interface ExternalSource {
  id: string;
  name: string;
  type: SourceType;
}

/** Sink types */
type SinkType = "result" | "http_out" | "email" | "log";

/** Output sink */
interface Sink {
  id: string;
  type: SinkType;
  label: string;
  detail?: string;
}

/** Cloud call */
interface CloudCall {
  id: string;
  service: "email" | "slack" | "github" | "salesforce" | "fetch";
  method: string;
  args?: string;
  assignedTo?: string;
}

/** Action call */
interface ActionCall {
  id: string;
  actionId: string;
  input?: string;
  assignedTo?: string;
}

/** Chained action */
interface ChainedAction {
  actionId: string;
  input?: string;
  delay?: number;
  condition?: "success" | "always";
}

type EditorMode = "visual" | "code";

/**
 * Generate a human-readable description for a SQL step
 */
function describeSqlStep(sql: {
  operation: string;
  tables: Array<{ table: string }>;
  assignedTo?: string;
}): string {
  const varName = sql.assignedTo;
  const table = sql.tables[0]?.table ?? "data";

  // Try to infer from variable name
  if (varName) {
    const readable = varName
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
      .trim();
    return readable.charAt(0).toUpperCase() + readable.slice(1);
  }

  // Fallback based on operation
  switch (sql.operation) {
    case "select":
      return `Query ${table}`;
    case "insert":
      return `Insert into ${table}`;
    case "update":
      return `Update ${table}`;
    case "upsert":
      return `Upsert ${table}`;
    case "delete":
      return `Delete from ${table}`;
    default:
      return `Access ${table}`;
  }
}

export function ActionEditor({
  actionId,
  name,
  source,
  className,
  onTableClick,
  onActionClick,
}: ActionEditorProps) {
  const [mode, setMode] = useState<EditorMode>("visual");

  // Extract flow data from source using AST analysis
  const { sources, sqlQueries, sinks, cloudCalls, actionCalls, chains } = useMemo<{
    sources: ExternalSource[];
    sqlQueries: ParsedQuery[];
    sinks: Sink[];
    cloudCalls: CloudCall[];
    actionCalls: ActionCall[];
    chains: ChainedAction[];
  }>(() => {
    if (!source) return { sources: [], sqlQueries: [], sinks: [], cloudCalls: [], actionCalls: [], chains: [] };

    try {
      const actionFlow = extractActionFlow(source);
      const queries: ParsedQuery[] = [];
      const sinks: Sink[] = [];
      let hasWrites = false;
      let hasHttpOut = false;

      // Convert external sources
      const sources: ExternalSource[] = actionFlow.sources.map((s) => ({
        id: s.id,
        name: s.name,
        type: s.type as SourceType,
      }));

      let returnFields: string[] = [];

      // Walk through steps to collect SQL queries and sinks
      function processSteps(steps: typeof actionFlow.steps) {
        for (const step of steps) {
          if (step.sql?.raw) {
            const parsed = parseSqlToFlow(step.sql.raw, step.sql.assignedTo);
            const tables = step.sql.tables.map((t) => ({
              table: t.table,
              usage: t.usage as "read" | "write" | "both",
            }));

            queries.push({
              description: describeSqlStep(step.sql),
              operation: step.sql.operation as ParsedQuery["operation"],
              tables,
              flow: parsed.success ? parsed.flow : undefined,
              rawSql: step.sql.raw,
            });

            // Track if we have write operations
            if (["insert", "update", "delete", "upsert"].includes(step.sql.operation)) {
              hasWrites = true;
            }
          }

          // Check for outbound HTTP calls (POST/PUT/DELETE)
          if (step.fetch) {
            const method = step.fetch.method.toUpperCase();
            if (["POST", "PUT", "DELETE", "PATCH"].includes(method)) {
              hasHttpOut = true;
              sinks.push({
                id: `http-${sinks.length}`,
                type: "http_out",
                label: `${method} request`,
                detail: step.fetch.url,
              });
            }
          }

          // Capture return statement references
          if (step.returnValue) {
            returnFields = step.returnValue.references;
          }

          // Process nested steps
          if (step.condition) {
            processSteps(step.condition.thenBranch);
            if (step.condition.elseBranch) {
              processSteps(step.condition.elseBranch);
            }
          }
          if (step.loop) {
            processSteps(step.loop.body);
          }
        }
      }

      processSteps(actionFlow.steps);

      // Extract cloud calls from steps
      const cloudCalls: CloudCall[] = [];
      let cloudCallIdx = 0;
      function extractCloudCalls(steps: typeof actionFlow.steps) {
        for (const step of steps) {
          if (step.cloudCall) {
            cloudCalls.push({
              id: `cloud-${cloudCallIdx++}`,
              service: step.cloudCall.service,
              method: step.cloudCall.method,
              args: step.cloudCall.args,
              assignedTo: step.cloudCall.assignedTo,
            });
          }
          if (step.condition) {
            extractCloudCalls(step.condition.thenBranch);
            if (step.condition.elseBranch) extractCloudCalls(step.condition.elseBranch);
          }
          if (step.loop) extractCloudCalls(step.loop.body);
        }
      }
      extractCloudCalls(actionFlow.steps);

      // Extract action calls from steps
      const actionCallsList: ActionCall[] = [];
      let actionCallIdx = 0;
      function extractActionCalls(steps: typeof actionFlow.steps) {
        for (const step of steps) {
          if (step.actionCall) {
            actionCallsList.push({
              id: `action-${actionCallIdx++}`,
              actionId: step.actionCall.actionId,
              input: step.actionCall.input,
              assignedTo: step.actionCall.assignedTo,
            });
          }
          if (step.condition) {
            extractActionCalls(step.condition.thenBranch);
            if (step.condition.elseBranch) extractActionCalls(step.condition.elseBranch);
          }
          if (step.loop) extractActionCalls(step.loop.body);
        }
      }
      extractActionCalls(actionFlow.steps);

      // Get chained actions from the flow
      const chains: ChainedAction[] = actionFlow.chains.map((c) => ({
        actionId: c.actionId,
        input: c.input,
        delay: c.delay,
        condition: c.condition,
      }));

      // Determine the final sink based on side effects
      const hasSideEffects = hasWrites || hasHttpOut || cloudCalls.length > 0;

      if (!hasSideEffects && chains.length === 0) {
        sinks.push({
          id: "no-op",
          type: "log",
          label: "Do Nothing",
        });
      }
      // If has side effects, those are already added as sinks (DB writes shown as table nodes, HTTP as sink nodes)

      return { sources, sqlQueries: queries, sinks, cloudCalls, actionCalls: actionCallsList, chains };
    } catch (err) {
      console.warn("Failed to extract action flow:", err);
      return { sources: [], sqlQueries: [], sinks: [], cloudCalls: [], actionCalls: [], chains: [] };
    }
  }, [source]);

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
          <ActionFlowGraph
            sources={sources}
            sqlQueries={sqlQueries}
            sinks={sinks}
            cloudCalls={cloudCalls}
            actionCalls={actionCalls}
            chains={chains}
            onTableClick={onTableClick}
            onActionClick={onActionClick}
          />
        ) : (
          <ActionCodeView source={source} />
        )}
      </div>
    </div>
  );
}
