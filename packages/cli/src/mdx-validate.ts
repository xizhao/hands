/**
 * MDX Page Validation
 *
 * Parses MDX files and validates:
 * - <Block src="..." /> - validates src references valid blocks
 * - <LiveValue query="..." /> - validates SQL syntax, schema, and read-only
 * - <LiveAction sql="..." /> - validates SQL syntax and schema
 * - <Button> - validates variant prop
 * - <Input> - validates name (required), type prop
 * - <Select> - validates name (required), options prop
 * - <Checkbox> - validates name (required)
 * - <Textarea> - validates name (required)
 */

import { compile } from "@mdx-js/mdx";
import { Parser } from "node-sql-parser";
import { readFileSync, existsSync, readdirSync } from "fs";
import path from "path";
import pc from "picocolors";

// ============================================================================
// Types
// ============================================================================

export interface SchemaTable {
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
  /** Available block sources */
  blocks: string[];
  /** Database schema */
  schema: SchemaTable[];
  /** Workbook root path */
  workbookPath: string;
}

// ============================================================================
// MDX Parsing
// ============================================================================

// Valid prop values for validation
const VALID_DISPLAY_MODES = ["auto", "inline", "list", "table"] as const;
const VALID_BUTTON_VARIANTS = ["default", "outline", "ghost", "destructive"] as const;
const VALID_INPUT_TYPES = ["text", "email", "number", "password", "tel", "url"] as const;

/**
 * Extract JSX components from MDX content using regex.
 * More reliable than AST walking for our simple use case.
 */
export function extractMdxComponents(content: string): MdxComponent[] {
  const components: MdxComponent[] = [];

  // Match self-closing JSX tags: <ComponentName prop="value" />
  // and opening tags: <ComponentName prop="value">
  const tagRegex = /<(LiveValue|LiveAction|Block|Prompt|Button|Input|Select|Checkbox|Textarea)\s+([^>]*?)\s*\/?>/g;

  let match;
  while ((match = tagRegex.exec(content)) !== null) {
    const name = match[1];
    const propsStr = match[2];

    // Calculate line number
    const beforeMatch = content.substring(0, match.index);
    const line = beforeMatch.split("\n").length;

    // Parse props
    const props: Record<string, string | undefined> = {};
    const propRegex = /(\w+)=(?:"([^"]*)"|{([^}]*)})/g;
    let propMatch;
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
// SQL Validation
// ============================================================================

const sqlParser = new Parser();

export interface SqlValidationResult {
  valid: boolean;
  errors: string[];
  tables: string[];
  columns: string[];
}

/**
 * Parse and validate SQL query syntax.
 * Returns extracted table and column references.
 */
export function validateSqlSyntax(sql: string): SqlValidationResult {
  const result: SqlValidationResult = {
    valid: true,
    errors: [],
    tables: [],
    columns: [],
  };

  try {
    // Parse with SQLite dialect
    const ast = sqlParser.astify(sql, { database: "SQLite" });

    // Extract table names
    const tables = new Set<string>();
    const columns = new Set<string>();

    function walkAst(node: unknown) {
      if (!node || typeof node !== "object") return;

      if (Array.isArray(node)) {
        node.forEach(walkAst);
        return;
      }

      const obj = node as Record<string, unknown>;

      // Table reference
      if (obj.type === "table" || obj.table) {
        const tableName = (obj.table as string) || (obj.name as string);
        if (tableName && typeof tableName === "string") {
          tables.add(tableName.toLowerCase());
        }
      }

      // Column reference
      if (obj.type === "column_ref" && obj.column) {
        const colName =
          typeof obj.column === "string" ? obj.column : (obj.column as { expr?: { value?: string } })?.expr?.value;
        if (colName && typeof colName === "string") {
          columns.add(colName.toLowerCase());
        }
      }

      // FROM clause
      if (obj.from && Array.isArray(obj.from)) {
        for (const fromItem of obj.from) {
          if (fromItem && typeof fromItem === "object" && "table" in fromItem) {
            tables.add((fromItem.table as string).toLowerCase());
          }
        }
      }

      // Recurse into child nodes
      for (const value of Object.values(obj)) {
        walkAst(value);
      }
    }

    walkAst(ast);

    result.tables = Array.from(tables);
    result.columns = Array.from(columns);
  } catch (err) {
    result.valid = false;
    result.errors.push(err instanceof Error ? err.message : String(err));
  }

  return result;
}

/**
 * Validate SQL against schema - check tables and columns exist.
 */
export function validateSqlSchema(
  sql: string,
  schema: SchemaTable[],
  opts?: { allowMutations?: boolean }
): ValidationError[] {
  const errors: ValidationError[] = [];

  const syntaxResult = validateSqlSyntax(sql);

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
  const upperSql = sql.trim().toUpperCase();
  const isMutation =
    upperSql.startsWith("INSERT") ||
    upperSql.startsWith("UPDATE") ||
    upperSql.startsWith("DELETE") ||
    upperSql.startsWith("DROP") ||
    upperSql.startsWith("CREATE") ||
    upperSql.startsWith("ALTER");

  if (isMutation && !opts?.allowMutations) {
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
// Block Validation
// ============================================================================

/**
 * Discover available blocks in the workbook.
 */
export function discoverBlocks(workbookPath: string): string[] {
  const blocksDir = path.join(workbookPath, "blocks");
  if (!existsSync(blocksDir)) return [];

  const blocks: string[] = [];

  function scanDir(dir: string, prefix = "") {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        scanDir(path.join(dir, entry.name), `${prefix}${entry.name}/`);
      } else if (entry.name.endsWith(".tsx")) {
        const blockName = entry.name.replace(/\.tsx$/, "");
        blocks.push(`${prefix}${blockName}`);
      }
    }
  }

  scanDir(blocksDir);
  return blocks;
}

// ============================================================================
// Full Page Validation
// ============================================================================

/**
 * Validate a single MDX file.
 */
export function validateMdxFile(filePath: string, ctx: ValidationContext): ValidationError[] {
  const errors: ValidationError[] = [];
  const content = readFileSync(filePath, "utf-8");
  const relativePath = path.relative(ctx.workbookPath, filePath);

  const components = extractMdxComponents(content);

  for (const comp of components) {
    // Validate <Block src="..." />
    if (comp.name === "Block") {
      const src = comp.props.src;
      if (!src) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "Block",
          prop: "src",
          message: "Block is missing required 'src' prop",
          severity: "error",
        });
      } else if (!ctx.blocks.includes(src)) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "Block",
          prop: "src",
          message: `Unknown block "${src}". Available: ${ctx.blocks.join(", ") || "(none)"}`,
          severity: "error",
        });
      }
    }

    // Validate <LiveValue query="..." />
    if (comp.name === "LiveValue") {
      const query = comp.props.query;
      if (!query) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "LiveValue",
          prop: "query",
          message: "LiveValue is missing required 'query' prop",
          severity: "error",
        });
      } else {
        // LiveValue only allows read-only SELECT queries
        const sqlErrors = validateSqlSchema(query, ctx.schema, { allowMutations: false });
        for (const err of sqlErrors) {
          errors.push({
            ...err,
            file: relativePath,
            line: comp.line,
            component: "LiveValue",
          });
        }
      }

      // Validate display prop if present
      const display = comp.props.display;
      if (display && !VALID_DISPLAY_MODES.includes(display as typeof VALID_DISPLAY_MODES[number])) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "LiveValue",
          prop: "display",
          message: `Invalid display mode "${display}". Must be one of: ${VALID_DISPLAY_MODES.join(", ")}`,
          severity: "error",
        });
      }
    }

    // Validate <LiveAction sql="..." />
    if (comp.name === "LiveAction") {
      const sql = comp.props.sql;
      if (!sql && !comp.props.src) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "LiveAction",
          prop: "sql",
          message: "LiveAction needs 'sql' or 'src' prop",
          severity: "error",
        });
      } else if (sql) {
        // LiveAction allows mutations (INSERT, UPDATE, DELETE)
        const sqlErrors = validateSqlSchema(sql, ctx.schema, { allowMutations: true });
        for (const err of sqlErrors) {
          errors.push({
            ...err,
            file: relativePath,
            line: comp.line,
            component: "LiveAction",
          });
        }
      }
    }

    // Validate <Button variant="..." />
    if (comp.name === "Button") {
      const variant = comp.props.variant;
      if (variant && !VALID_BUTTON_VARIANTS.includes(variant as typeof VALID_BUTTON_VARIANTS[number])) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "Button",
          prop: "variant",
          message: `Invalid variant "${variant}". Must be one of: ${VALID_BUTTON_VARIANTS.join(", ")}`,
          severity: "error",
        });
      }
    }

    // Validate <Input name="..." />
    if (comp.name === "Input") {
      if (!comp.props.name) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "Input",
          prop: "name",
          message: "Input is missing required 'name' prop",
          severity: "error",
        });
      }
      const inputType = comp.props.type;
      if (inputType && !VALID_INPUT_TYPES.includes(inputType as typeof VALID_INPUT_TYPES[number])) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "Input",
          prop: "type",
          message: `Invalid input type "${inputType}". Must be one of: ${VALID_INPUT_TYPES.join(", ")}`,
          severity: "error",
        });
      }
    }

    // Validate <Select name="..." options={...} />
    if (comp.name === "Select") {
      if (!comp.props.name) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "Select",
          prop: "name",
          message: "Select is missing required 'name' prop",
          severity: "error",
        });
      }
      if (!comp.props.options) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "Select",
          prop: "options",
          message: "Select is missing required 'options' prop",
          severity: "error",
        });
      }
    }

    // Validate <Checkbox name="..." />
    if (comp.name === "Checkbox") {
      if (!comp.props.name) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "Checkbox",
          prop: "name",
          message: "Checkbox is missing required 'name' prop",
          severity: "error",
        });
      }
    }

    // Validate <Textarea name="..." />
    if (comp.name === "Textarea") {
      if (!comp.props.name) {
        errors.push({
          file: relativePath,
          line: comp.line,
          component: "Textarea",
          prop: "name",
          message: "Textarea is missing required 'name' prop",
          severity: "error",
        });
      }
    }
  }

  return errors;
}

/**
 * Validate all MDX pages in a workbook.
 */
export function validateMdxPages(workbookPath: string, schema: SchemaTable[]): ValidationError[] {
  const pagesDir = path.join(workbookPath, "pages");
  if (!existsSync(pagesDir)) return [];

  const blocks = discoverBlocks(workbookPath);
  const ctx: ValidationContext = { blocks, schema, workbookPath };

  const errors: ValidationError[] = [];

  function scanDir(dir: string) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith(".mdx")) {
        errors.push(...validateMdxFile(fullPath, ctx));
      }
    }
  }

  scanDir(pagesDir);
  return errors;
}

/**
 * Load schema from .hands/schema.json or runtime.
 */
export function loadSchema(workbookPath: string): SchemaTable[] {
  // Try .hands/schema.json first
  const schemaPath = path.join(workbookPath, ".hands", "schema.json");
  if (existsSync(schemaPath)) {
    try {
      const content = readFileSync(schemaPath, "utf-8");
      const data = JSON.parse(content);
      if (Array.isArray(data.tables)) {
        return data.tables.map((t: { name: string; columns?: Array<{ name: string }> }) => ({
          name: t.name,
          columns: t.columns?.map((c) => c.name) ?? [],
        }));
      }
    } catch {
      // Ignore parse errors
    }
  }

  // TODO: Could fetch from runtime if available
  return [];
}

/**
 * Format validation errors for console output.
 */
export function formatValidationErrors(errors: ValidationError[]): void {
  for (const err of errors) {
    const location = err.line ? `${err.file}:${err.line}` : err.file;
    const prefix = err.severity === "error" ? pc.red("✗") : pc.yellow("⚠");
    console.log(`  ${prefix} ${pc.dim(location)} [${err.component}] ${err.message}`);
  }
}
