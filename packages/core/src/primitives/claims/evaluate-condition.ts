/**
 * Condition Evaluator for Data-Driven Claims
 *
 * Evaluates conditions against query result data.
 * Used when Claim is nested inside LiveValue with an `expect` prop.
 *
 * Supports three evaluation modes:
 * 1. Simple conditions: "value < 2.5", "status == 'active'"
 * 2. Regex patterns: "/pattern/flags" - matches against content field
 * 3. Natural language: "Article confirms X" - uses LLM evaluation
 */

// ============================================================================
// Types
// ============================================================================

/**
 * Supported comparison operators.
 */
type ComparisonOp = "<" | "<=" | ">" | ">=" | "==" | "!=" | "===" | "!==";

/**
 * Condition type detected from expect string.
 */
export type ConditionType = "simple" | "regex" | "llm";

/**
 * Result of condition evaluation with explanation.
 */
export interface EvaluationResult {
  /** Whether condition passed */
  passed: boolean;
  /** Type of evaluation performed */
  type: ConditionType;
  /** Human-readable explanation */
  reason?: string;
}

/**
 * LLM evaluator function type.
 * Takes content and condition, returns evaluation result.
 */
export type LLMEvaluator = (
  content: string,
  condition: string
) => Promise<{ passed: boolean; reason?: string }>;

// ============================================================================
// Condition Type Detection
// ============================================================================

/**
 * Detect the type of condition from the expect string.
 *
 * @example
 * detectConditionType("value < 2.5") // "simple"
 * detectConditionType("/inflation.*target/i") // "regex"
 * detectConditionType("Article confirms Fed will cut rates") // "llm"
 */
export function detectConditionType(condition: string): ConditionType {
  const trimmed = condition.trim();

  // Regex pattern: starts with / and has ending /flags
  if (/^\/.*\/[gimsuy]*$/.test(trimmed)) {
    return "regex";
  }

  // Simple condition: has comparison operator
  if (/^(\w+)\s*(<=|>=|===|!==|==|!=|<|>)\s*(.+)$/.test(trimmed)) {
    return "simple";
  }

  // Default to LLM evaluation for natural language
  return "llm";
}

/**
 * Parse a simple condition expression.
 * Supports: "field op value" format
 *
 * Examples:
 * - "value < 2.5"
 * - "count > 0"
 * - "status == 'active'"
 * - "rate >= 4.0"
 */
interface ParsedCondition {
  field: string;
  op: ComparisonOp;
  value: string | number | boolean | null;
}

/**
 * Parse a condition string into its components.
 */
export function parseCondition(condition: string): ParsedCondition | null {
  // Trim and normalize whitespace
  const normalized = condition.trim();

  // Match pattern: field operator value
  // Operators: <, <=, >, >=, ==, !=, ===, !==
  const match = normalized.match(
    /^(\w+)\s*(<=|>=|===|!==|==|!=|<|>)\s*(.+)$/
  );

  if (!match) {
    return null;
  }

  const [, field, op, rawValue] = match;

  // Parse the value
  const value = parseValue(rawValue.trim());

  return {
    field,
    op: op as ComparisonOp,
    value,
  };
}

/**
 * Parse a value string into its typed representation.
 */
function parseValue(raw: string): string | number | boolean | null {
  // Null
  if (raw === "null") return null;

  // Boolean
  if (raw === "true") return true;
  if (raw === "false") return false;

  // Quoted string (single or double quotes)
  const stringMatch = raw.match(/^['"](.*)['"]$/);
  if (stringMatch) {
    return stringMatch[1];
  }

  // Number
  const num = Number(raw);
  if (!isNaN(num)) {
    return num;
  }

  // Fallback to string
  return raw;
}

/**
 * Compare two values with the given operator.
 */
function compare(
  left: unknown,
  op: ComparisonOp,
  right: string | number | boolean | null
): boolean {
  // Handle null comparisons
  if (left === null || left === undefined) {
    if (op === "==" || op === "===") return right === null;
    if (op === "!=" || op === "!==") return right !== null;
    return false;
  }

  // Convert to number for numeric comparisons
  const leftNum = typeof left === "number" ? left : Number(left);
  const rightNum = typeof right === "number" ? right : Number(right);

  switch (op) {
    case "<":
      return leftNum < rightNum;
    case "<=":
      return leftNum <= rightNum;
    case ">":
      return leftNum > rightNum;
    case ">=":
      return leftNum >= rightNum;
    case "==":
      // eslint-disable-next-line eqeqeq
      return left == right;
    case "!=":
      // eslint-disable-next-line eqeqeq
      return left != right;
    case "===":
      return left === right;
    case "!==":
      return left !== right;
    default:
      return false;
  }
}

/**
 * Evaluate a condition against a data row.
 *
 * @param condition - Condition string like "value < 2.5"
 * @param data - Data row object from query result
 * @returns true if condition passes, false otherwise
 *
 * @example
 * evaluateCondition("value < 2.5", { value: 2.3 }) // true
 * evaluateCondition("count > 0", { count: 5 }) // true
 * evaluateCondition("status == 'active'", { status: "active" }) // true
 */
export function evaluateCondition(
  condition: string,
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!condition || !data) {
    return false;
  }

  const parsed = parseCondition(condition);
  if (!parsed) {
    console.warn(`[evaluateCondition] Failed to parse condition: "${condition}"`);
    return false;
  }

  const { field, op, value } = parsed;

  // Get field value from data
  const fieldValue = data[field];

  // If field doesn't exist in data, condition fails
  if (!(field in data)) {
    console.warn(`[evaluateCondition] Field "${field}" not found in data`);
    return false;
  }

  return compare(fieldValue, op, value);
}

/**
 * Evaluate multiple conditions (AND logic).
 * All conditions must pass for result to be true.
 */
export function evaluateConditions(
  conditions: string[],
  data: Record<string, unknown> | null | undefined
): boolean {
  return conditions.every((cond) => evaluateCondition(cond, data));
}

// ============================================================================
// Regex Evaluation
// ============================================================================

/**
 * Parse a regex pattern string into a RegExp.
 *
 * @param pattern - Pattern string like "/foo/i" or "/bar.*baz/gm"
 * @returns RegExp or null if invalid
 */
export function parseRegex(pattern: string): RegExp | null {
  const match = pattern.match(/^\/(.*)\/([gimsuy]*)$/);
  if (!match) return null;

  try {
    return new RegExp(match[1], match[2]);
  } catch {
    return null;
  }
}

/**
 * Evaluate a regex pattern against content.
 *
 * @param pattern - Regex pattern like "/inflation.*target/i"
 * @param content - String content to match against
 * @returns Evaluation result with match info
 */
export function evaluateRegex(
  pattern: string,
  content: string
): EvaluationResult {
  const regex = parseRegex(pattern);

  if (!regex) {
    return {
      passed: false,
      type: "regex",
      reason: `Invalid regex pattern: ${pattern}`,
    };
  }

  const match = regex.test(content);

  return {
    passed: match,
    type: "regex",
    reason: match
      ? `Pattern ${pattern} found in content`
      : `Pattern ${pattern} not found in content`,
  };
}

// ============================================================================
// Unified Async Evaluation
// ============================================================================

/**
 * Options for evaluating an expect condition.
 */
export interface EvaluateExpectOptions {
  /** The expect condition string */
  expect: string;
  /** Data from LiveValue (query result or source content) */
  data: Record<string, unknown>[] | null | undefined;
  /** Optional LLM evaluator for natural language conditions */
  llmEvaluator?: LLMEvaluator;
}

/**
 * Evaluate an expect condition against data.
 *
 * Automatically detects condition type and uses appropriate evaluation:
 * - Simple: Field comparisons like "value < 2.5"
 * - Regex: Pattern matching like "/target/i" against content
 * - LLM: Natural language evaluation (requires llmEvaluator)
 *
 * @example
 * // Simple condition
 * await evaluateExpect({
 *   expect: "value < 2.5",
 *   data: [{ value: 2.3 }]
 * })
 *
 * // Regex pattern
 * await evaluateExpect({
 *   expect: "/inflation.*below.*target/i",
 *   data: [{ content: "Core inflation remains below the 2% target" }]
 * })
 *
 * // Natural language (requires LLM)
 * await evaluateExpect({
 *   expect: "Article confirms Fed will cut rates",
 *   data: [{ content: "..." }],
 *   llmEvaluator: myLlmEvaluator
 * })
 */
export async function evaluateExpect(
  options: EvaluateExpectOptions
): Promise<EvaluationResult> {
  const { expect, data, llmEvaluator } = options;

  if (!expect) {
    return { passed: false, type: "simple", reason: "No expect condition provided" };
  }

  if (!data || data.length === 0) {
    return { passed: false, type: "simple", reason: "No data to evaluate against" };
  }

  const conditionType = detectConditionType(expect);
  const firstRow = data[0];

  switch (conditionType) {
    case "simple": {
      const passed = evaluateCondition(expect, firstRow);
      return {
        passed,
        type: "simple",
        reason: passed ? "Condition passed" : "Condition failed",
      };
    }

    case "regex": {
      // For regex, match against 'content' field (from source fetch) or stringify the data
      const content =
        typeof firstRow.content === "string"
          ? firstRow.content
          : JSON.stringify(firstRow);
      return evaluateRegex(expect, content);
    }

    case "llm": {
      if (!llmEvaluator) {
        return {
          passed: false,
          type: "llm",
          reason: "LLM evaluator not available for natural language condition",
        };
      }

      // For LLM, send content and condition for evaluation
      const content =
        typeof firstRow.content === "string"
          ? firstRow.content
          : JSON.stringify(firstRow);

      try {
        const result = await llmEvaluator(content, expect);
        return {
          passed: result.passed,
          type: "llm",
          reason: result.reason ?? (result.passed ? "LLM confirmed" : "LLM denied"),
        };
      } catch (error) {
        return {
          passed: false,
          type: "llm",
          reason: `LLM evaluation error: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    }

    default:
      return { passed: false, type: "simple", reason: "Unknown condition type" };
  }
}
