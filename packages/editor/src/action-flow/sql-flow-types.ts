/**
 * SQL Flow Types
 *
 * Represents SQL queries as a directed acyclic graph (DAG) of relational operations.
 * Based on relational algebra: source → filter → join → aggregate → project → output
 */

/** Unique identifier for a node in the SQL flow */
export type NodeId = string;

/** Base interface for all SQL flow nodes */
export interface SqlFlowNodeBase {
  id: NodeId;
  /** IDs of nodes that feed into this node */
  inputs: NodeId[];
}

/** Source node - represents a table or CTE reference */
export interface SourceNode extends SqlFlowNodeBase {
  type: "source";
  table: string;
  schema?: string;
  alias?: string;
}

/** Filter node - represents WHERE or HAVING clause */
export interface FilterNode extends SqlFlowNodeBase {
  type: "filter";
  /** The filter condition as a string */
  condition: string;
  /** Whether this is a HAVING clause (post-aggregation) */
  isHaving?: boolean;
}

/** Join node - represents a JOIN operation */
export interface JoinNode extends SqlFlowNodeBase {
  type: "join";
  joinType: "inner" | "left" | "right" | "full" | "cross";
  /** The right-side table being joined */
  table: string;
  alias?: string;
  /** The ON condition */
  condition?: string;
}

/** Aggregation function call */
export interface AggregateFunction {
  fn: "count" | "sum" | "avg" | "min" | "max" | "array_agg" | "string_agg" | "other";
  /** The column or expression being aggregated */
  column: string;
  /** Output alias */
  alias?: string;
  /** For functions like string_agg that have additional args */
  args?: string[];
}

/** Aggregate node - represents GROUP BY with aggregate functions */
export interface AggregateNode extends SqlFlowNodeBase {
  type: "aggregate";
  /** Columns in GROUP BY clause */
  groupBy: string[];
  /** Aggregate functions being applied */
  functions: AggregateFunction[];
}

/** Column projection */
export interface ProjectColumn {
  /** The expression (column name, function call, etc.) */
  expression: string;
  /** Output alias */
  alias?: string;
  /** Whether this is a star (*) or table.* */
  isStar?: boolean;
  table?: string;
}

/** Project node - represents SELECT columns */
export interface ProjectNode extends SqlFlowNodeBase {
  type: "project";
  columns: ProjectColumn[];
  distinct?: boolean;
}

/** Sort specification */
export interface SortSpec {
  column: string;
  direction: "asc" | "desc";
  nulls?: "first" | "last";
}

/** Sort node - represents ORDER BY */
export interface SortNode extends SqlFlowNodeBase {
  type: "sort";
  specs: SortSpec[];
}

/** Limit node - represents LIMIT/OFFSET */
export interface LimitNode extends SqlFlowNodeBase {
  type: "limit";
  limit?: number;
  offset?: number;
}

/** Output node - the final result of a SELECT query */
export interface OutputNode extends SqlFlowNodeBase {
  type: "output";
  /** Variable this result is assigned to */
  assignedTo?: string;
}

/** Insert target */
export interface InsertNode extends SqlFlowNodeBase {
  type: "insert";
  table: string;
  columns?: string[];
  /** Whether this is an upsert (ON CONFLICT) */
  onConflict?: {
    columns?: string[];
    action: "nothing" | "update";
    updateColumns?: string[];
  };
}

/** Update target */
export interface UpdateNode extends SqlFlowNodeBase {
  type: "update";
  table: string;
  /** Columns being set */
  setColumns: Array<{ column: string; expression: string }>;
}

/** Delete target */
export interface DeleteNode extends SqlFlowNodeBase {
  type: "delete";
  table: string;
}

/** CTE (Common Table Expression) definition */
export interface CteNode extends SqlFlowNodeBase {
  type: "cte";
  name: string;
  /** The subflow that defines this CTE */
  subflow: SqlFlow;
  recursive?: boolean;
}

/** Union/Intersect/Except operations */
export interface SetOperationNode extends SqlFlowNodeBase {
  type: "set_operation";
  operation: "union" | "union_all" | "intersect" | "except";
}

/** All possible node types */
export type SqlFlowNode =
  | SourceNode
  | FilterNode
  | JoinNode
  | AggregateNode
  | ProjectNode
  | SortNode
  | LimitNode
  | OutputNode
  | InsertNode
  | UpdateNode
  | DeleteNode
  | CteNode
  | SetOperationNode;

/** The complete SQL flow graph */
export interface SqlFlow {
  /** All nodes in the flow */
  nodes: SqlFlowNode[];
  /** The root node ID (typically output, insert, update, or delete) */
  rootId: NodeId;
  /** Original SQL for reference */
  rawSql?: string;
  /** Variable the result is assigned to */
  assignedTo?: string;
  /** Human-readable description */
  description?: string;
  /** The primary operation type */
  operation: "select" | "insert" | "update" | "delete" | "unknown";
}

/** Helper to get node by ID */
export function getNode(flow: SqlFlow, id: NodeId): SqlFlowNode | undefined {
  return flow.nodes.find((n) => n.id === id);
}

/** Helper to get all nodes of a specific type */
export function getNodesOfType<T extends SqlFlowNode["type"]>(
  flow: SqlFlow,
  type: T,
): Extract<SqlFlowNode, { type: T }>[] {
  return flow.nodes.filter((n) => n.type === type) as Extract<SqlFlowNode, { type: T }>[];
}

/** Get all source tables referenced in the flow */
export function getSourceTables(flow: SqlFlow): string[] {
  const sources = getNodesOfType(flow, "source");
  const joins = getNodesOfType(flow, "join");
  return [...sources.map((s) => s.table), ...joins.map((j) => j.table)];
}

/** Get the target table for write operations */
export function getTargetTable(flow: SqlFlow): string | undefined {
  const insert = getNodesOfType(flow, "insert")[0];
  if (insert) return insert.table;

  const update = getNodesOfType(flow, "update")[0];
  if (update) return update.table;

  const del = getNodesOfType(flow, "delete")[0];
  if (del) return del.table;

  return undefined;
}
