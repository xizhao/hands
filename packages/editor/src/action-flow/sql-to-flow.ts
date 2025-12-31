/**
 * SQL to Flow Parser
 *
 * Converts SQL AST (from node-sql-parser) into a SqlFlow DAG representation.
 * This provides a structured, testable transformation from SQL text to
 * a visual flow graph.
 */

import { Parser } from "node-sql-parser";
import type {
  AggregateFunction,
  AggregateNode,
  CteNode,
  DeleteNode,
  FilterNode,
  InsertNode,
  JoinNode,
  LimitNode,
  NodeId,
  OutputNode,
  ProjectColumn,
  ProjectNode,
  SortNode,
  SortSpec,
  SourceNode,
  SqlFlow,
  SqlFlowNode,
  UpdateNode,
} from "./sql-flow-types";

const parser = new Parser();

/** Counter for generating unique node IDs */
let nodeIdCounter = 0;

function generateNodeId(prefix: string): NodeId {
  return `${prefix}_${++nodeIdCounter}`;
}

/** Reset the counter (useful for testing) */
export function resetNodeIdCounter(): void {
  nodeIdCounter = 0;
}

/** Parse result with error handling */
export interface ParseResult {
  success: boolean;
  flow?: SqlFlow;
  error?: string;
}

/**
 * Parse a SQL string into a SqlFlow structure
 */
export function parseSqlToFlow(sql: string, assignedTo?: string): ParseResult {
  resetNodeIdCounter();

  try {
    const ast = parser.astify(sql, { database: "PostgreSQL" });
    const statements = Array.isArray(ast) ? ast : [ast];

    if (statements.length === 0 || !statements[0]) {
      return { success: false, error: "No SQL statements found" };
    }

    // For now, handle the first statement
    const stmt = statements[0] as unknown as Record<string, unknown>;
    const flow = convertStatement(stmt, sql, assignedTo);

    return { success: true, flow };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "Failed to parse SQL",
    };
  }
}

/**
 * Convert a parsed SQL statement to a SqlFlow
 */
function convertStatement(
  stmt: Record<string, unknown>,
  rawSql: string,
  assignedTo?: string,
): SqlFlow {
  const type = stmt.type as string;

  switch (type) {
    case "select":
      return convertSelect(stmt, rawSql, assignedTo);
    case "insert":
    case "replace":
      return convertInsert(stmt, rawSql, assignedTo);
    case "update":
      return convertUpdate(stmt, rawSql, assignedTo);
    case "delete":
      return convertDelete(stmt, rawSql, assignedTo);
    default:
      // Return a minimal flow for unknown statements
      return {
        nodes: [],
        rootId: "",
        rawSql,
        assignedTo,
        operation: "unknown",
      };
  }
}

/**
 * Convert a SELECT statement
 */
function convertSelect(
  stmt: Record<string, unknown>,
  rawSql: string,
  assignedTo?: string,
): SqlFlow {
  const nodes: SqlFlowNode[] = [];
  let currentInputs: NodeId[] = [];

  // 1. Handle CTEs (WITH clause)
  const cteMap = new Map<string, NodeId>();
  if (stmt.with) {
    const withClauses = stmt.with as Array<{
      name?: { value?: string };
      stmt?: Record<string, unknown>;
    }>;

    for (const cte of withClauses) {
      if (cte.name?.value && cte.stmt) {
        const cteName = cte.name.value;
        const subflow = convertStatement(cte.stmt, "", undefined);
        const cteNode: CteNode = {
          id: generateNodeId("cte"),
          type: "cte",
          name: cteName,
          subflow,
          inputs: [],
        };
        nodes.push(cteNode);
        cteMap.set(cteName.toLowerCase(), cteNode.id);
      }
    }
  }

  // 2. Handle FROM clause - create source nodes
  if (stmt.from) {
    const fromItems = stmt.from as Array<Record<string, unknown>>;
    const { sourceNodes, joinNodes } = processFromClause(fromItems, cteMap);

    for (const source of sourceNodes) {
      nodes.push(source);
      currentInputs.push(source.id);
    }

    // Process joins in order
    for (const join of joinNodes) {
      join.inputs = [...currentInputs];
      nodes.push(join);
      currentInputs = [join.id];
    }
  }

  // 3. Handle WHERE clause
  if (stmt.where) {
    const condition = expressionToString(stmt.where);
    const filterNode: FilterNode = {
      id: generateNodeId("filter"),
      type: "filter",
      condition,
      inputs: currentInputs,
    };
    nodes.push(filterNode);
    currentInputs = [filterNode.id];
  }

  // 4. Handle GROUP BY and aggregates
  const columns = stmt.columns as Array<Record<string, unknown>> | undefined;
  const groupByRaw = stmt.groupby as
    | { columns?: Array<Record<string, unknown>> }
    | Array<Record<string, unknown>>
    | undefined;
  // groupby can be an object with columns array or just an array
  const groupBy = Array.isArray(groupByRaw) ? groupByRaw : groupByRaw?.columns;
  const hasAggregates = columns?.some((col) => hasAggregateFunction(col));

  if (groupBy || hasAggregates) {
    const groupByColumns = groupBy?.map((g) => expressionToString(g)) ?? [];
    const aggregateFunctions = extractAggregateFunctions(columns ?? []);

    const aggNode: AggregateNode = {
      id: generateNodeId("agg"),
      type: "aggregate",
      groupBy: groupByColumns,
      functions: aggregateFunctions,
      inputs: currentInputs,
    };
    nodes.push(aggNode);
    currentInputs = [aggNode.id];

    // Handle HAVING (filter after aggregation)
    if (stmt.having) {
      const havingCondition = expressionToString(stmt.having);
      const havingNode: FilterNode = {
        id: generateNodeId("having"),
        type: "filter",
        condition: havingCondition,
        isHaving: true,
        inputs: currentInputs,
      };
      nodes.push(havingNode);
      currentInputs = [havingNode.id];
    }
  }

  // 5. Handle SELECT columns (projection)
  if (columns) {
    const projectColumns = extractProjectColumns(columns);
    const distinctRaw = stmt.distinct as string | { type?: string | null } | null | undefined;
    // distinct can be a string, an object with type, or null
    let isDistinct = false;
    if (typeof distinctRaw === "string") {
      isDistinct = distinctRaw === "DISTINCT";
    } else if (distinctRaw && typeof distinctRaw === "object") {
      isDistinct = distinctRaw.type !== null;
    }

    const projectNode: ProjectNode = {
      id: generateNodeId("project"),
      type: "project",
      columns: projectColumns,
      distinct: isDistinct,
      inputs: currentInputs,
    };
    nodes.push(projectNode);
    currentInputs = [projectNode.id];
  }

  // 6. Handle ORDER BY
  if (stmt.orderby) {
    const orderBy = stmt.orderby as Array<{
      expr?: Record<string, unknown>;
      type?: string;
      nulls?: string;
    }>;
    const specs: SortSpec[] = orderBy.map((o) => ({
      column: expressionToString(o.expr),
      direction: (o.type?.toLowerCase() ?? "asc") as "asc" | "desc",
      nulls: o.nulls?.toLowerCase() as "first" | "last" | undefined,
    }));

    const sortNode: SortNode = {
      id: generateNodeId("sort"),
      type: "sort",
      specs,
      inputs: currentInputs,
    };
    nodes.push(sortNode);
    currentInputs = [sortNode.id];
  }

  // 7. Handle LIMIT/OFFSET
  const limit = stmt.limit as { value?: Array<{ value?: number }> } | undefined;
  if (limit?.value) {
    const limitNode: LimitNode = {
      id: generateNodeId("limit"),
      type: "limit",
      limit: limit.value[0]?.value,
      offset: limit.value[1]?.value,
      inputs: currentInputs,
    };
    nodes.push(limitNode);
    currentInputs = [limitNode.id];
  }

  // 8. Create output node
  const outputNode: OutputNode = {
    id: generateNodeId("output"),
    type: "output",
    assignedTo,
    inputs: currentInputs,
  };
  nodes.push(outputNode);

  return {
    nodes,
    rootId: outputNode.id,
    rawSql,
    assignedTo,
    operation: "select",
    description: generateSelectDescription(nodes, assignedTo),
  };
}

/**
 * Convert an INSERT statement
 */
function convertInsert(
  stmt: Record<string, unknown>,
  rawSql: string,
  assignedTo?: string,
): SqlFlow {
  const nodes: SqlFlowNode[] = [];
  let currentInputs: NodeId[] = [];

  // Handle VALUES or SELECT source
  const values = stmt.values as unknown;
  if (
    values &&
    typeof values === "object" &&
    (values as Record<string, unknown>).type === "select"
  ) {
    // INSERT ... SELECT
    const selectFlow = convertSelect(values as Record<string, unknown>, "", undefined);
    nodes.push(...selectFlow.nodes);
    currentInputs = [selectFlow.rootId];
  }

  // Get target table
  const tableList = stmt.table as Array<{ table?: string }> | undefined;
  const tableName = tableList?.[0]?.table ?? "unknown";

  // Get columns
  const columns = stmt.columns as
    | Array<string | { column?: string; type?: string; value?: string }>
    | undefined;
  const columnNames =
    columns
      ?.map((c) => {
        if (typeof c === "string") return c;
        if (c.column) return c.column;
        if (c.value) return c.value;
        if (c.type === "default" && typeof (c as Record<string, unknown>).value === "string") {
          return (c as Record<string, unknown>).value as string;
        }
        return expressionToString(c);
      })
      .filter(Boolean) ?? undefined;

  // Check for ON CONFLICT (upsert)
  const onConflict = stmt.on_duplicate_update || stmt.on_conflict;
  let onConflictSpec: InsertNode["onConflict"] | undefined;

  if (onConflict) {
    onConflictSpec = {
      action: "update",
      // Could extract more details here
    };
  }

  // Check raw SQL for ON CONFLICT if AST didn't capture it
  if (!onConflictSpec && /ON\s+CONFLICT/i.test(rawSql)) {
    onConflictSpec = {
      action: /DO\s+NOTHING/i.test(rawSql) ? "nothing" : "update",
    };
  }

  const insertNode: InsertNode = {
    id: generateNodeId("insert"),
    type: "insert",
    table: tableName,
    columns: columnNames,
    onConflict: onConflictSpec,
    inputs: currentInputs,
  };
  nodes.push(insertNode);

  return {
    nodes,
    rootId: insertNode.id,
    rawSql,
    assignedTo,
    operation: onConflictSpec ? "insert" : "insert", // Could distinguish upsert
    description: generateInsertDescription(tableName, onConflictSpec, assignedTo),
  };
}

/**
 * Convert an UPDATE statement
 */
function convertUpdate(
  stmt: Record<string, unknown>,
  rawSql: string,
  assignedTo?: string,
): SqlFlow {
  const nodes: SqlFlowNode[] = [];
  let currentInputs: NodeId[] = [];

  // Handle FROM clause if present (for JOINs in UPDATE)
  if (stmt.from) {
    const fromItems = stmt.from as Array<Record<string, unknown>>;
    const { sourceNodes } = processFromClause(fromItems, new Map());
    for (const source of sourceNodes) {
      nodes.push(source);
      currentInputs.push(source.id);
    }
  }

  // Handle WHERE clause
  if (stmt.where) {
    const condition = expressionToString(stmt.where);
    const filterNode: FilterNode = {
      id: generateNodeId("filter"),
      type: "filter",
      condition,
      inputs: currentInputs,
    };
    nodes.push(filterNode);
    currentInputs = [filterNode.id];
  }

  // Get target table
  const tableList = stmt.table as Array<{ table?: string }> | undefined;
  const tableName = tableList?.[0]?.table ?? "unknown";

  // Get SET clauses
  const setClauses = stmt.set as
    | Array<{ column?: string | { type?: string; value?: string }; value?: unknown }>
    | undefined;
  const setColumns =
    setClauses?.map((s) => {
      let colName = "";
      if (typeof s.column === "string") {
        colName = s.column;
      } else if (s.column && typeof s.column === "object") {
        colName = s.column.value ?? expressionToString(s.column);
      }
      return {
        column: colName,
        expression: expressionToString(s.value),
      };
    }) ?? [];

  const updateNode: UpdateNode = {
    id: generateNodeId("update"),
    type: "update",
    table: tableName,
    setColumns,
    inputs: currentInputs,
  };
  nodes.push(updateNode);

  return {
    nodes,
    rootId: updateNode.id,
    rawSql,
    assignedTo,
    operation: "update",
    description: generateUpdateDescription(tableName, setColumns.length, assignedTo),
  };
}

/**
 * Convert a DELETE statement
 */
function convertDelete(
  stmt: Record<string, unknown>,
  rawSql: string,
  assignedTo?: string,
): SqlFlow {
  const nodes: SqlFlowNode[] = [];
  let currentInputs: NodeId[] = [];

  // Handle USING clause (for JOINs in DELETE)
  if (stmt.using) {
    const usingItems = stmt.using as Array<Record<string, unknown>>;
    const { sourceNodes } = processFromClause(usingItems, new Map());
    for (const source of sourceNodes) {
      nodes.push(source);
      currentInputs.push(source.id);
    }
  }

  // Handle WHERE clause
  if (stmt.where) {
    const condition = expressionToString(stmt.where);
    const filterNode: FilterNode = {
      id: generateNodeId("filter"),
      type: "filter",
      condition,
      inputs: currentInputs,
    };
    nodes.push(filterNode);
    currentInputs = [filterNode.id];
  }

  // Get target table from FROM clause
  const from = stmt.from as Array<{ table?: string }> | undefined;
  const tableName = from?.[0]?.table ?? "unknown";

  const deleteNode: DeleteNode = {
    id: generateNodeId("delete"),
    type: "delete",
    table: tableName,
    inputs: currentInputs,
  };
  nodes.push(deleteNode);

  return {
    nodes,
    rootId: deleteNode.id,
    rawSql,
    assignedTo,
    operation: "delete",
    description: generateDeleteDescription(tableName, assignedTo),
  };
}

/**
 * Process FROM clause to extract source and join nodes
 */
function processFromClause(
  fromItems: Array<Record<string, unknown>>,
  cteMap: Map<string, NodeId>,
): { sourceNodes: SourceNode[]; joinNodes: JoinNode[] } {
  const sourceNodes: SourceNode[] = [];
  const joinNodes: JoinNode[] = [];

  for (const item of fromItems) {
    const tableName = item.table as string | undefined;
    const alias = item.as as string | undefined;
    const schema = item.db as string | undefined;
    const joinType = item.join as string | undefined;

    if (joinType) {
      // This is a JOIN
      const joinNode: JoinNode = {
        id: generateNodeId("join"),
        type: "join",
        joinType: normalizeJoinType(joinType),
        table: tableName ?? "",
        alias,
        condition: item.on ? expressionToString(item.on) : undefined,
        inputs: [], // Will be set later
      };
      joinNodes.push(joinNode);
    } else if (tableName) {
      // Regular table source
      const sourceNode: SourceNode = {
        id: generateNodeId("source"),
        type: "source",
        table: tableName,
        alias,
        schema,
        inputs: [],
      };

      // Check if this references a CTE
      const cteId = cteMap.get(tableName.toLowerCase());
      if (cteId) {
        sourceNode.inputs = [cteId];
      }

      sourceNodes.push(sourceNode);
    }

    // Handle subqueries in FROM
    if (item.expr && typeof item.expr === "object") {
      const subquery = item.expr as Record<string, unknown>;
      if (subquery.type === "select") {
        // TODO: Handle subqueries as nested flows
      }
    }
  }

  return { sourceNodes, joinNodes };
}

/**
 * Normalize JOIN type string
 */
function normalizeJoinType(joinType: string): JoinNode["joinType"] {
  const normalized = joinType.toUpperCase();
  if (normalized.includes("LEFT")) return "left";
  if (normalized.includes("RIGHT")) return "right";
  if (normalized.includes("FULL")) return "full";
  if (normalized.includes("CROSS")) return "cross";
  return "inner";
}

/**
 * Check if an expression contains aggregate functions
 */
function hasAggregateFunction(expr: Record<string, unknown>): boolean {
  const exprObj = expr.expr as Record<string, unknown> | undefined;
  if (!exprObj) return false;

  if (exprObj.type === "aggr_func") return true;

  // Recursively check
  const str = JSON.stringify(exprObj);
  return /"type"\s*:\s*"aggr_func"/.test(str);
}

/**
 * Extract aggregate functions from SELECT columns (recursively searches nested expressions)
 */
function extractAggregateFunctions(columns: Array<Record<string, unknown>>): AggregateFunction[] {
  const functions: AggregateFunction[] = [];

  function findAggregatesInExpr(expr: unknown, alias?: string): void {
    if (!expr || typeof expr !== "object") return;

    const e = expr as Record<string, unknown>;

    if (e.type === "aggr_func") {
      const name = (e.name as string)?.toLowerCase() ?? "other";
      const args = e.args as { expr?: Record<string, unknown> } | undefined;
      const column = args?.expr ? expressionToString(args.expr) : "*";

      functions.push({
        fn: normalizeAggregateName(name),
        column,
        alias,
      });
      return;
    }

    // Handle expr_list (array of expressions)
    if (e.type === "expr_list" && Array.isArray(e.value)) {
      (e.value as unknown[]).forEach((v) => findAggregatesInExpr(v, alias));
      return;
    }

    // Recursively search in function arguments
    if (e.type === "function") {
      findAggregatesInExpr(e.args, alias);
    }

    // Check other common nested expression locations
    if (e.expr) findAggregatesInExpr(e.expr, alias);
    if (e.left) findAggregatesInExpr(e.left, alias);
    if (e.right) findAggregatesInExpr(e.right, alias);
    if (e.args && typeof e.args === "object") {
      const args = e.args as Record<string, unknown>;
      if (args.type === "expr_list" && Array.isArray(args.value)) {
        (args.value as unknown[]).forEach((v) => findAggregatesInExpr(v, alias));
      } else if (args.expr) {
        findAggregatesInExpr(args.expr, alias);
      }
    }
  }

  for (const col of columns) {
    const expr = col.expr as Record<string, unknown> | undefined;
    if (!expr) continue;
    findAggregatesInExpr(expr, col.as as string | undefined);
  }

  return functions;
}

/**
 * Normalize aggregate function name
 */
function normalizeAggregateName(name: string): AggregateFunction["fn"] {
  switch (name.toLowerCase()) {
    case "count":
      return "count";
    case "sum":
      return "sum";
    case "avg":
      return "avg";
    case "min":
      return "min";
    case "max":
      return "max";
    case "array_agg":
      return "array_agg";
    case "string_agg":
      return "string_agg";
    default:
      return "other";
  }
}

/**
 * Extract project columns from SELECT columns
 */
function extractProjectColumns(columns: Array<Record<string, unknown>>): ProjectColumn[] {
  const result: ProjectColumn[] = [];

  for (const col of columns) {
    const expr = col.expr as Record<string, unknown> | undefined;
    const alias = col.as as string | undefined;

    if (!expr) continue;

    // Handle star (*)
    if (expr.type === "star") {
      result.push({
        expression: "*",
        isStar: true,
        alias,
      });
      continue;
    }

    // Handle column_ref with star (table.*)
    if (expr.type === "column_ref" && expr.column === "*") {
      result.push({
        expression: `${expr.table}.*`,
        isStar: true,
        table: expr.table as string,
        alias,
      });
      continue;
    }

    result.push({
      expression: expressionToString(expr),
      alias,
    });
  }

  return result;
}

/**
 * Convert an AST expression to a string representation
 */
function expressionToString(expr: unknown): string {
  if (!expr) return "";
  if (typeof expr === "string") return expr;
  if (typeof expr === "number") return String(expr);
  if (typeof expr !== "object") return String(expr);

  const e = expr as Record<string, unknown>;
  const type = e.type as string | undefined;

  switch (type) {
    case "column_ref": {
      const column = e.column as string | { expr?: { value?: string } };
      const colName = typeof column === "string" ? column : (column?.expr?.value ?? String(column));
      const table = e.table as string | undefined;
      return table ? `${table}.${colName}` : colName;
    }

    case "default":
      // Simple value wrapper
      return String(e.value ?? "");

    case "binary_expr":
      return `${expressionToString(e.left)} ${e.operator} ${expressionToString(e.right)}`;

    case "unary_expr":
      return `${e.operator} ${expressionToString(e.expr)}`;

    case "number":
      return String(e.value);

    case "string":
    case "single_quote_string":
      return `'${e.value}'`;

    case "bool":
      return String(e.value);

    case "null":
      return "NULL";

    case "function": {
      const funcName = e.name as string;
      const funcArgs = e.args as { value?: Array<{ expr?: unknown }> } | undefined;
      const argsStr = funcArgs?.value?.map((a) => expressionToString(a.expr)).join(", ") ?? "";
      return `${funcName}(${argsStr})`;
    }

    case "aggr_func": {
      const aggrName = e.name as string;
      const aggrArgs = e.args as { expr?: unknown } | undefined;
      return `${aggrName}(${expressionToString(aggrArgs?.expr)})`;
    }

    case "case":
      return "CASE...END";

    case "cast":
      return `CAST(${expressionToString(e.expr)} AS ${expressionToString(e.target)})`;

    case "expr_list": {
      const list = e.value as Array<{ expr?: unknown }> | undefined;
      return `(${list?.map((v) => expressionToString(v.expr)).join(", ") ?? ""})`;
    }

    case "star":
      return "*";

    default:
      // Fallback: try to get a reasonable string
      if (e.value !== undefined) return String(e.value);
      if (e.column) {
        const col = e.column as string | { expr?: { value?: string } };
        const colStr = typeof col === "string" ? col : (col?.expr?.value ?? String(col));
        return e.table ? `${e.table}.${colStr}` : colStr;
      }
      if (e.expr) return expressionToString(e.expr);
      return JSON.stringify(expr).slice(0, 50);
  }
}

/**
 * Generate a human-readable description for a SELECT query
 */
function generateSelectDescription(nodes: SqlFlowNode[], assignedTo?: string): string {
  // Find key nodes
  const sources = nodes.filter((n) => n.type === "source") as SourceNode[];
  const joins = nodes.filter((n) => n.type === "join") as JoinNode[];
  const agg = nodes.find((n) => n.type === "aggregate") as AggregateNode | undefined;
  const filter = nodes.find((n) => n.type === "filter" && !n.isHaving) as FilterNode | undefined;

  const parts: string[] = [];

  // Use variable name if available
  if (assignedTo) {
    const readable = assignedTo
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
      .trim();
    return readable.charAt(0).toUpperCase() + readable.slice(1);
  }

  // Describe based on structure
  if (agg && agg.functions.length > 0) {
    const funcs = agg.functions.map((f) => f.fn.toUpperCase()).join(", ");
    parts.push(`Aggregate (${funcs})`);
  }

  if (sources.length === 1) {
    parts.push(`from ${sources[0].table}`);
  } else if (sources.length > 1) {
    parts.push(`from ${sources.map((s) => s.table).join(", ")}`);
  }

  if (joins.length > 0) {
    parts.push(`with ${joins.length} join${joins.length > 1 ? "s" : ""}`);
  }

  if (filter) {
    parts.push("(filtered)");
  }

  return parts.length > 0 ? parts.join(" ") : "Query";
}

/**
 * Generate a description for INSERT
 */
function generateInsertDescription(
  table: string,
  onConflict: InsertNode["onConflict"] | undefined,
  assignedTo?: string,
): string {
  if (assignedTo) {
    const readable = assignedTo
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
      .trim();
    return readable.charAt(0).toUpperCase() + readable.slice(1);
  }

  if (onConflict) {
    return `Upsert into ${table}`;
  }
  return `Insert into ${table}`;
}

/**
 * Generate a description for UPDATE
 */
function generateUpdateDescription(
  table: string,
  columnCount: number,
  assignedTo?: string,
): string {
  if (assignedTo) {
    const readable = assignedTo
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
      .trim();
    return readable.charAt(0).toUpperCase() + readable.slice(1);
  }

  return `Update ${table} (${columnCount} column${columnCount !== 1 ? "s" : ""})`;
}

/**
 * Generate a description for DELETE
 */
function generateDeleteDescription(table: string, assignedTo?: string): string {
  if (assignedTo) {
    const readable = assignedTo
      .replace(/([A-Z])/g, " $1")
      .replace(/_/g, " ")
      .toLowerCase()
      .trim();
    return readable.charAt(0).toUpperCase() + readable.slice(1);
  }

  return `Delete from ${table}`;
}
