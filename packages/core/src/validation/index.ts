/**
 * @hands/core/validation
 *
 * MDX validation utilities for Hands components.
 * Portable module - no Node.js fs/path dependencies.
 *
 * Used by:
 * - CLI (hands check)
 * - Runtime (dev server validation)
 * - AI agents (code generation validation)
 */

// Import from generated docs - single source of truth for component names and validation rules
// Using package subpath to work with both bundler and NodeNext resolution
import { ALL_COMPONENTS, COMPONENT_SCHEMA } from "@hands/core/docs";

// Derive component names from generated docs
const STDLIB_COMPONENT_NAMES = ALL_COMPONENTS;

// Fallback constants for components without Meta yet
const VALID_DISPLAY_MODES = ["auto", "inline", "list", "table"] as const;
const VALID_BUTTON_VARIANTS = ["default", "outline", "ghost", "destructive"] as const;
const VALID_INPUT_TYPES = ["text", "email", "number", "password", "tel", "url"] as const;

// Type helper for schema access
type SchemaEntry = (typeof COMPONENT_SCHEMA)[keyof typeof COMPONENT_SCHEMA];

// Get validation rules from schema
function getEnumValues(component: string, prop: string): readonly string[] | undefined {
  const schema = COMPONENT_SCHEMA[component as keyof typeof COMPONENT_SCHEMA] as SchemaEntry | undefined;
  if (!schema || !("propRules" in schema)) return undefined;
  const propRules = schema.propRules as Record<string, { enum?: readonly string[] }> | undefined;
  return propRules?.[prop]?.enum;
}

function getRequiredProps(component: string): readonly string[] {
  const schema = COMPONENT_SCHEMA[component as keyof typeof COMPONENT_SCHEMA] as SchemaEntry | undefined;
  if (!schema || !("requiredProps" in schema)) return [];
  return (schema.requiredProps as readonly string[]) ?? [];
}

// Hardcoded constraints for nested components not in generated schema
const NESTED_COMPONENT_CONSTRAINTS: Record<string, {
  requireParent?: readonly string[];
  requireChild?: readonly string[];
  forbidParent?: readonly string[];
  forbidChild?: readonly string[];
}> = {
  Tab: { requireParent: ["Tabs"] },
};

function getConstraints(component: string) {
  // Check hardcoded constraints first (for nested components)
  if (NESTED_COMPONENT_CONSTRAINTS[component]) {
    return NESTED_COMPONENT_CONSTRAINTS[component];
  }

  const schema = COMPONENT_SCHEMA[component as keyof typeof COMPONENT_SCHEMA] as SchemaEntry | undefined;
  if (!schema || !("constraints" in schema)) return undefined;
  return schema.constraints as {
    requireParent?: readonly string[];
    requireChild?: readonly string[];
    forbidParent?: readonly string[];
    forbidChild?: readonly string[];
  } | undefined;
}

// ============================================================================
// Types
// ============================================================================

export interface ValidationSchemaTable {
  name: string;
  columns: string[];
}

export interface ValidationError {
  file: string;
  line?: number;
  column?: number;
  component: string;
  prop: string;
  message: string;
  severity: "error" | "warning";
}

export interface MdxComponent {
  name: string;
  props: Record<string, string | undefined>;
  line?: number;
  column?: number;
}

export interface ValidationContext {
  /** Available page/block sources for <Page src="..." /> */
  pageRefs: string[];
  /** Database schema */
  schema: ValidationSchemaTable[];
  /** Base path for relative file paths in errors */
  basePath?: string;
}

export interface SqlParseResult {
  valid: boolean;
  errors: string[];
  tables: string[];
  columns: string[];
}

// ============================================================================
// MDX Parsing
// ============================================================================

/** Components to validate - stdlib plus workbook-specific plus nested components */
const VALIDATABLE_COMPONENTS = [...STDLIB_COMPONENT_NAMES, "Page", "Prompt", "Tab"] as const;

// Build regex from component names
const COMPONENTS_REGEX = new RegExp(
  `<(${VALIDATABLE_COMPONENTS.join("|")})\\s+([^>]*?)\\s*/?>`,
  "g",
);

/**
 * Extract JSX components from MDX content using regex.
 * More reliable than AST walking for our simple use case.
 */
export function extractMdxComponents(content: string): MdxComponent[] {
  const components: MdxComponent[] = [];

  // Reset regex state for each call
  COMPONENTS_REGEX.lastIndex = 0;

  let match: RegExpExecArray | null;
  while ((match = COMPONENTS_REGEX.exec(content)) !== null) {
    const name = match[1];
    const propsStr = match[2];

    // Calculate line number
    const beforeMatch = content.substring(0, match.index);
    const line = beforeMatch.split("\n").length;

    // Parse props
    const props: Record<string, string | undefined> = {};
    const propRegex = /(\w+)=(?:"([^"]*)"|{([^}]*)})/g;
    let propMatch: RegExpExecArray | null;
    while ((propMatch = propRegex.exec(propsStr)) !== null) {
      const propName = propMatch[1];
      const propValue = propMatch[2] ?? propMatch[3];
      props[propName] = propValue;
    }

    components.push({ name, props, line });
  }

  return components;
}

// ============================================================================
// Hierarchical MDX Parsing (for structural validation)
// ============================================================================

interface MdxNode {
  name: string;
  props: Record<string, string | undefined>;
  line: number;
  children: MdxNode[];
  parent?: MdxNode;
}

/**
 * Parse MDX with hierarchy awareness for structural validation.
 * Tracks parent-child relationships between components.
 */
export function parseMdxHierarchy(content: string): MdxNode[] {
  const roots: MdxNode[] = [];
  const stack: MdxNode[] = [];

  // Match both opening and closing tags
  const tagRegex = new RegExp(
    `<(/?)(${VALIDATABLE_COMPONENTS.join("|")})(?:\\s+([^>]*?))?(\\s*/?)>`,
    "g"
  );

  let match: RegExpExecArray | null;
  while ((match = tagRegex.exec(content)) !== null) {
    const isClosing = match[1] === "/";
    const name = match[2];
    const propsStr = match[3] || "";
    const isSelfClosing = match[4]?.includes("/");

    const beforeMatch = content.substring(0, match.index);
    const line = beforeMatch.split("\n").length;

    if (isClosing) {
      // Pop from stack until we find matching open tag
      while (stack.length > 0 && stack[stack.length - 1].name !== name) {
        stack.pop();
      }
      if (stack.length > 0) {
        stack.pop();
      }
    } else {
      // Parse props
      const props: Record<string, string | undefined> = {};
      const propRegex = /(\w+)=(?:"([^"]*)"|{([^}]*)})/g;
      let propMatch: RegExpExecArray | null;
      while ((propMatch = propRegex.exec(propsStr)) !== null) {
        props[propMatch[1]] = propMatch[2] ?? propMatch[3];
      }

      const node: MdxNode = { name, props, line, children: [] };

      if (stack.length > 0) {
        const parent = stack[stack.length - 1];
        node.parent = parent;
        parent.children.push(node);
      } else {
        roots.push(node);
      }

      // Only push to stack if not self-closing
      if (!isSelfClosing) {
        stack.push(node);
      }
    }
  }

  return roots;
}

/**
 * Validate structural constraints from COMPONENT_SCHEMA.
 */
export function validateStructure(
  content: string,
  filePath = ""
): ValidationError[] {
  const errors: ValidationError[] = [];
  const roots = parseMdxHierarchy(content);

  function validateNode(node: MdxNode) {
    const constraints = getConstraints(node.name);

    if (constraints) {
      // Check requireParent
      if (constraints.requireParent && constraints.requireParent.length > 0) {
        const hasValidParent = node.parent &&
          constraints.requireParent.includes(node.parent.name);

        if (!hasValidParent) {
          errors.push({
            file: filePath,
            line: node.line,
            component: node.name,
            prop: "",
            message: `${node.name} must be inside ${constraints.requireParent.join(" or ")}`,
            severity: "error",
          });
        }
      }

      // Check requireChild
      if (constraints.requireChild && constraints.requireChild.length > 0) {
        const childNames = new Set(node.children.map(c => c.name));
        const hasRequiredChild = constraints.requireChild.some(c => childNames.has(c));

        if (!hasRequiredChild && node.children.length === 0) {
          // Only warn if no children parsed - might be false negative
          errors.push({
            file: filePath,
            line: node.line,
            component: node.name,
            prop: "",
            message: `${node.name} should contain ${constraints.requireChild.join(" or ")}`,
            severity: "warning",
          });
        }
      }

      // Check forbidChild
      if (constraints.forbidChild) {
        for (const child of node.children) {
          if (constraints.forbidChild.includes(child.name)) {
            errors.push({
              file: filePath,
              line: child.line,
              component: child.name,
              prop: "",
              message: `${child.name} cannot be inside ${node.name}`,
              severity: "error",
            });
          }
        }
      }
    }

    // Recurse into children
    for (const child of node.children) {
      validateNode(child);
    }
  }

  for (const root of roots) {
    validateNode(root);
  }

  return errors;
}

// ============================================================================
// SQL Validation (syntax only - no external parser dependency)
// ============================================================================

/**
 * Basic SQL syntax validation without external parser.
 * Checks for common issues and extracts table/column references.
 */
export function validateSqlBasic(sql: string): SqlParseResult {
  const result: SqlParseResult = {
    valid: true,
    errors: [],
    tables: [],
    columns: [],
  };

  const trimmed = sql.trim();
  if (!trimmed) {
    result.valid = false;
    result.errors.push("SQL query is empty");
    return result;
  }

  // Extract table names from FROM/JOIN clauses (basic regex)
  const fromMatch = trimmed.match(/\bFROM\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi);
  if (fromMatch) {
    for (const m of fromMatch) {
      const tableName = m.replace(/^FROM\s+/i, "").toLowerCase();
      result.tables.push(tableName);
    }
  }

  const joinMatch = trimmed.match(/\bJOIN\s+([a-zA-Z_][a-zA-Z0-9_]*)/gi);
  if (joinMatch) {
    for (const m of joinMatch) {
      const tableName = m.replace(/^JOIN\s+/i, "").toLowerCase();
      result.tables.push(tableName);
    }
  }

  // Check for unclosed quotes
  const singleQuotes = (trimmed.match(/'/g) || []).length;
  const doubleQuotes = (trimmed.match(/"/g) || []).length;
  if (singleQuotes % 2 !== 0) {
    result.valid = false;
    result.errors.push("Unclosed single quote in SQL");
  }
  if (doubleQuotes % 2 !== 0) {
    result.valid = false;
    result.errors.push("Unclosed double quote in SQL");
  }

  // Check for unclosed parentheses
  const openParens = (trimmed.match(/\(/g) || []).length;
  const closeParens = (trimmed.match(/\)/g) || []).length;
  if (openParens !== closeParens) {
    result.valid = false;
    result.errors.push("Mismatched parentheses in SQL");
  }

  return result;
}

/**
 * Check if SQL is a mutation (INSERT/UPDATE/DELETE/etc.)
 */
export function isSqlMutation(sql: string): boolean {
  const upperSql = sql.trim().toUpperCase();
  return (
    upperSql.startsWith("INSERT") ||
    upperSql.startsWith("UPDATE") ||
    upperSql.startsWith("DELETE") ||
    upperSql.startsWith("DROP") ||
    upperSql.startsWith("CREATE") ||
    upperSql.startsWith("ALTER")
  );
}

/**
 * Validate SQL against schema - check tables exist.
 */
export function validateSqlSchema(
  sql: string,
  schema: ValidationSchemaTable[],
  opts?: { allowMutations?: boolean },
): ValidationError[] {
  const errors: ValidationError[] = [];

  const syntaxResult = validateSqlBasic(sql);

  if (!syntaxResult.valid) {
    return syntaxResult.errors.map((msg) => ({
      file: "",
      component: "",
      prop: "query",
      message: `Invalid SQL: ${msg}`,
      severity: "error" as const,
    }));
  }

  // Check tables exist
  const schemaTableNames = new Set(schema.map((t) => t.name.toLowerCase()));
  for (const table of syntaxResult.tables) {
    if (!schemaTableNames.has(table)) {
      errors.push({
        file: "",
        component: "",
        prop: "query",
        message: `Unknown table "${table}"`,
        severity: "error",
      });
    }
  }

  // Check if it's a mutation
  if (isSqlMutation(sql) && !opts?.allowMutations) {
    errors.push({
      file: "",
      component: "",
      prop: "query",
      message: "LiveValue cannot contain mutations, use LiveAction",
      severity: "error",
    });
  }

  return errors;
}

// ============================================================================
// Component Validation
// ============================================================================

// Components with additional required props not in schema (workbook-specific)
const EXTRA_REQUIRED_PROPS: Record<string, readonly string[]> = {
  Page: ["src"],
  Tab: ["value", "label"],
};

/**
 * Schema-driven validation for required props.
 * Checks requiredProps from COMPONENT_SCHEMA for any component.
 */
function validateRequiredPropsFromSchema(
  comp: MdxComponent,
  filePath: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  // Get required props from schema
  const schemaRequired = getRequiredProps(comp.name);

  // Get extra required props for workbook-specific components
  const extraRequired = EXTRA_REQUIRED_PROPS[comp.name] ?? [];

  // Combine both
  const allRequired = [...schemaRequired, ...extraRequired];

  for (const prop of allRequired) {
    if (!comp.props[prop]) {
      errors.push({
        file: filePath,
        line: comp.line,
        component: comp.name,
        prop,
        message: `${comp.name} is missing required '${prop}' prop`,
        severity: "error",
      });
    }
  }

  return errors;
}

/**
 * Schema-driven validation for enum props.
 * Checks propRules.enum from COMPONENT_SCHEMA.
 */
function validateEnumPropsFromSchema(
  comp: MdxComponent,
  filePath: string,
): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const [propName, propValue] of Object.entries(comp.props)) {
    if (!propValue) continue;

    const enumValues = getEnumValues(comp.name, propName);
    if (enumValues && !enumValues.includes(propValue)) {
      errors.push({
        file: filePath,
        line: comp.line,
        component: comp.name,
        prop: propName,
        message: `Invalid ${propName} "${propValue}". Must be one of: ${enumValues.join(", ")}`,
        severity: "error",
      });
    }
  }

  return errors;
}

/**
 * Validate a single MDX component.
 */
export function validateComponent(
  comp: MdxComponent,
  ctx: ValidationContext,
  filePath = "",
): ValidationError[] {
  const errors: ValidationError[] = [];

  // ========================================================================
  // Schema-driven validation (works for all components with ComponentMeta)
  // ========================================================================

  // Check required props from schema
  errors.push(...validateRequiredPropsFromSchema(comp, filePath));

  // Check enum props from schema
  errors.push(...validateEnumPropsFromSchema(comp, filePath));

  // ========================================================================
  // Component-specific validation (SQL, page refs, etc.)
  // ========================================================================

  // Validate <Page src="..." /> - check page exists
  if (comp.name === "Page") {
    const src = comp.props.src;
    if (src && !ctx.pageRefs.includes(src) && !ctx.pageRefs.includes(`${src}/`)) {
      const available =
        ctx.pageRefs.slice(0, 5).join(", ") + (ctx.pageRefs.length > 5 ? "..." : "");
      errors.push({
        file: filePath,
        line: comp.line,
        component: "Page",
        prop: "src",
        message: `Unknown page "${src}". Available: ${available || "(none)"}`,
        severity: "warning",
      });
    }
  }

  // Validate <LiveValue query="..." /> - validate SQL
  if (comp.name === "LiveValue") {
    const query = comp.props.query;
    if (query) {
      const sqlErrors = validateSqlSchema(query, ctx.schema, { allowMutations: false });
      for (const err of sqlErrors) {
        errors.push({
          ...err,
          file: filePath,
          line: comp.line,
          component: "LiveValue",
        });
      }
    }

    // Validate display mode (fallback for components without propRules in schema)
    const display = comp.props.display;
    if (display && !VALID_DISPLAY_MODES.includes(display as (typeof VALID_DISPLAY_MODES)[number])) {
      errors.push({
        file: filePath,
        line: comp.line,
        component: "LiveValue",
        prop: "display",
        message: `Invalid display mode "${display}". Must be one of: ${VALID_DISPLAY_MODES.join(", ")}`,
        severity: "error",
      });
    }
  }

  // Validate <LiveAction sql="..." /> - needs sql OR src
  if (comp.name === "LiveAction") {
    const sql = comp.props.sql;
    if (!sql && !comp.props.src) {
      errors.push({
        file: filePath,
        line: comp.line,
        component: "LiveAction",
        prop: "sql",
        message: "LiveAction needs 'sql' or 'src' prop",
        severity: "error",
      });
    } else if (sql) {
      const sqlErrors = validateSqlSchema(sql, ctx.schema, { allowMutations: true });
      for (const err of sqlErrors) {
        errors.push({
          ...err,
          file: filePath,
          line: comp.line,
          component: "LiveAction",
        });
      }
    }
  }

  // Validate <Button variant="..." /> - fallback enum check
  if (comp.name === "Button") {
    const variant = comp.props.variant;
    if (
      variant &&
      !VALID_BUTTON_VARIANTS.includes(variant as (typeof VALID_BUTTON_VARIANTS)[number])
    ) {
      errors.push({
        file: filePath,
        line: comp.line,
        component: "Button",
        prop: "variant",
        message: `Invalid variant "${variant}". Must be one of: ${VALID_BUTTON_VARIANTS.join(", ")}`,
        severity: "error",
      });
    }
  }

  // Validate <Input type="..." /> - fallback enum check
  if (comp.name === "Input") {
    const inputType = comp.props.type;
    if (inputType && !VALID_INPUT_TYPES.includes(inputType as (typeof VALID_INPUT_TYPES)[number])) {
      errors.push({
        file: filePath,
        line: comp.line,
        component: "Input",
        prop: "type",
        message: `Invalid input type "${inputType}". Must be one of: ${VALID_INPUT_TYPES.join(", ")}`,
        severity: "error",
      });
    }
  }

  return errors;
}

/**
 * Validate MDX content string.
 */
export function validateMdxContent(
  content: string,
  ctx: ValidationContext,
  filePath = "",
): ValidationError[] {
  const components = extractMdxComponents(content);
  const errors: ValidationError[] = [];

  // Validate individual component props
  for (const comp of components) {
    errors.push(...validateComponent(comp, ctx, filePath));
  }

  // Validate structural constraints (parent-child relationships)
  errors.push(...validateStructure(content, filePath));

  return errors;
}
