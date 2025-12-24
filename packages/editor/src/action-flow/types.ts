/**
 * Action Flow Analysis Types
 *
 * Data model for understanding what an action does step-by-step.
 * Extracted by walking the AST of the run function.
 */

/**
 * Complete flow analysis of an action's run function
 */
export interface ActionFlow {
  /** Name of the action */
  name: string;
  /** Sequential steps in execution order */
  steps: FlowStep[];
  /** All tables referenced (deduplicated) */
  tables: TableSummary[];
  /** External data sources */
  sources: ExternalSource[];
  /** Cloud services used (ctx.cloud.*) */
  cloudServices: CloudServiceUsage[];
  /** Inline action calls (ctx.actions.run) */
  actionCalls: ActionCallSummary[];
  /** Chained actions (from return statement) */
  chains: ChainedAction[];
}

/**
 * Summary of cloud service usage
 */
export interface CloudServiceUsage {
  service: "email" | "slack" | "github" | "salesforce" | "fetch";
  methods: string[];
}

/**
 * Summary of inline action calls
 */
export interface ActionCallSummary {
  actionId: string;
  stepId: string;
}

/**
 * A single step in the action's execution flow
 */
export interface FlowStep {
  id: string;
  type: FlowStepType;
  /** Source location for navigation */
  location: SourceLocation;
  /** Step-specific data */
  sql?: SqlStep;
  fetch?: FetchStep;
  condition?: ConditionStep;
  loop?: LoopStep;
  assignment?: AssignmentStep;
  returnValue?: ReturnStep;
  /** Cloud service call (ctx.cloud.*) */
  cloudCall?: CloudCallStep;
  /** Inline action call (ctx.actions.run) */
  actionCall?: ActionCallStep;
}

export type FlowStepType =
  | "sql"
  | "fetch"
  | "condition"
  | "loop"
  | "assignment"
  | "return"
  | "log"
  | "cloud_call"
  | "action_call"
  | "unknown";

/**
 * SQL query step with parsed structure
 */
export interface SqlStep {
  /** Raw SQL string (with placeholders for interpolations) */
  raw: string;
  /** Type of SQL operation */
  operation: SqlOperation;
  /** Tables referenced in this query */
  tables: TableReference[];
  /** CTEs (WITH clause) - these define temporary tables */
  ctes: CteDefinition[];
  /** Columns selected/modified */
  columns: ColumnReference[];
  /** Variable the result is assigned to */
  assignedTo?: string;
}

export type SqlOperation = "select" | "insert" | "update" | "delete" | "upsert" | "unknown";

/**
 * Reference to a table in a SQL query
 */
export interface TableReference {
  /** Table name */
  table: string;
  /** Alias if any (e.g., FROM orders o) */
  alias?: string;
  /** How this table is used */
  usage: "read" | "write" | "both";
  /** Schema if specified (e.g., public.orders) */
  schema?: string;
}

/**
 * Common Table Expression (WITH clause)
 */
export interface CteDefinition {
  /** CTE name */
  name: string;
  /** Tables read by this CTE */
  readsFrom: string[];
}

/**
 * Column reference in a query
 */
export interface ColumnReference {
  /** Column name */
  name: string;
  /** Table it belongs to (if determinable) */
  table?: string;
  /** Is this being read or written */
  usage: "read" | "write";
}

/**
 * HTTP fetch step
 */
export interface FetchStep {
  /** URL (may contain placeholders) */
  url: string;
  /** HTTP method */
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "unknown";
  /** Variable the result is assigned to */
  assignedTo?: string;
}

/**
 * Conditional branch (if/else, ternary, switch)
 */
export interface ConditionStep {
  /** The condition expression */
  condition: string;
  /** Steps in the "then" branch */
  thenBranch: FlowStep[];
  /** Steps in the "else" branch (if any) */
  elseBranch?: FlowStep[];
}

/**
 * Loop step (for, while, for...of, etc.)
 */
export interface LoopStep {
  /** Type of loop */
  loopType: "for" | "while" | "for-of" | "for-in" | "do-while";
  /** What's being iterated (variable name) */
  iterates?: string;
  /** Steps inside the loop body */
  body: FlowStep[];
}

/**
 * Variable assignment
 */
export interface AssignmentStep {
  /** Variable name */
  variable: string;
  /** Expression being assigned (simplified) */
  expression: string;
}

/**
 * Return statement
 */
export interface ReturnStep {
  /** Simplified expression of what's returned */
  expression: string;
  /** Variables referenced in return */
  references: string[];
}

/**
 * Source code location
 */
export interface SourceLocation {
  line: number;
  column: number;
  endLine?: number;
  endColumn?: number;
}

/**
 * Summary of a table's usage across the action
 */
export interface TableSummary {
  /** Table name */
  table: string;
  /** All operations performed on this table */
  operations: SqlOperation[];
  /** Is it read from */
  isRead: boolean;
  /** Is it written to */
  isWritten: boolean;
  /** Step IDs that reference this table */
  referencedBy: string[];
}

/**
 * External data source (API, webhook, etc.)
 */
export interface ExternalSource {
  id: string;
  type: "api" | "webhook" | "schedule" | "file";
  name: string;
  /** URL or identifier */
  endpoint?: string;
}

// =============================================================================
// Cloud Service Calls (ctx.cloud.*)
// =============================================================================

/**
 * Cloud service call step (ctx.cloud.email.send, ctx.cloud.slack.send, etc.)
 */
export interface CloudCallStep {
  /** Service name (email, slack, github, salesforce) */
  service: "email" | "slack" | "github" | "salesforce" | "fetch";
  /** Method called (send, channels, issues, etc.) */
  method: string;
  /** Arguments passed (simplified) */
  args?: string;
  /** Variable the result is assigned to */
  assignedTo?: string;
}

// =============================================================================
// Action Calls (ctx.actions.run)
// =============================================================================

/**
 * Inline action call step (ctx.actions.run("action-id", {...}))
 */
export interface ActionCallStep {
  /** Action ID being called */
  actionId: string;
  /** Input expression (simplified) */
  input?: string;
  /** Variable the result is assigned to */
  assignedTo?: string;
}

// =============================================================================
// Action Chains (return { data, chain })
// =============================================================================

/**
 * A chained action defined in the return statement
 */
export interface ChainedAction {
  /** Action ID to run after this action */
  actionId: string;
  /** Input expression */
  input?: string;
  /** Delay in ms */
  delay?: number;
  /** Condition (success, always) */
  condition?: "success" | "always";
}

/**
 * Extended return step that may include chains
 */
export interface ExtendedReturnStep extends ReturnStep {
  /** Chained actions to run after */
  chains?: ChainedAction[];
  /** Whether this is an ActionResult format (has data property) */
  isActionResult?: boolean;
}
