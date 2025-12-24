/**
 * Extract data lineage from action source code using AST parsing
 *
 * Uses ts-morph for TypeScript AST parsing and node-sql-parser for SQL parsing.
 * Identifies:
 * - Tables read from (SELECT statements, ctx.sources.main.* access)
 * - Tables written to (INSERT, UPDATE, DELETE, UPSERT)
 * - External sources (fetch calls, API client references)
 */

import { Project, SyntaxKind, Node } from "ts-morph";
import { Parser } from "node-sql-parser";
import type { ActionLineage } from "./ActionEditor";

const sqlParser = new Parser();

/**
 * Extract lineage from action source code using AST parsing
 */
export function extractLineage(source: string): ActionLineage {
  const sources: ActionLineage["sources"] = [];
  const reads: ActionLineage["reads"] = [];
  const writes: ActionLineage["writes"] = [];

  const seenSources = new Set<string>();
  const seenReads = new Set<string>();
  const seenWrites = new Set<string>();

  // Create ts-morph project and parse source
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("action.ts", source);

  // Find tagged template expressions (ctx.sql`...`, ctx.db.query`...`, etc.)
  const taggedTemplates = sourceFile.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression);
  for (const tagged of taggedTemplates) {
    const tag = tagged.getTag().getText();
    // Check if this is a SQL tagged template (ctx.sql, ctx.db.query, ctx.db.run, sql, etc.)
    if (/ctx\.sql|ctx\.db\.(query|run)|^sql$/i.test(tag)) {
      const template = tagged.getTemplate();
      const sqlText = extractTemplateText(template);
      if (sqlText) {
        processSqlString(sqlText, reads, writes, seenReads, seenWrites);
      }
    }
  }

  // Find all string literals that might contain SQL
  const stringLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.StringLiteral);
  const templateLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.TemplateExpression);
  const noSubstitutionTemplates = sourceFile.getDescendantsOfKind(SyntaxKind.NoSubstitutionTemplateLiteral);

  // Process string literals for SQL
  for (const literal of stringLiterals) {
    const text = literal.getLiteralText();
    processSqlString(text, reads, writes, seenReads, seenWrites);
  }

  // Process template literals (no substitution)
  for (const template of noSubstitutionTemplates) {
    const text = template.getLiteralText();
    processSqlString(text, reads, writes, seenReads, seenWrites);
  }

  // Process template expressions (with substitutions) - extract head and spans
  for (const template of templateLiterals) {
    const head = template.getHead().getLiteralText();
    processSqlString(head, reads, writes, seenReads, seenWrites);

    for (const span of template.getTemplateSpans()) {
      const spanText = span.getLiteral().getLiteralText();
      processSqlString(spanText, reads, writes, seenReads, seenWrites);
    }
  }

  // Find fetch calls
  const callExpressions = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression);
  for (const call of callExpressions) {
    const expr = call.getExpression();
    const exprText = expr.getText();

    // fetch() calls
    if (exprText === "fetch") {
      const args = call.getArguments();
      if (args.length > 0) {
        const urlArg = args[0];
        const urlText = getStringValue(urlArg);
        if (urlText) {
          const apiSource = extractApiSource(urlText);
          if (apiSource && !seenSources.has(apiSource.id)) {
            seenSources.add(apiSource.id);
            sources.push(apiSource);
          }
        }
      }
    }
  }

  // Find property accesses for ctx.sources.main.* pattern
  const propertyAccesses = sourceFile.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression);
  for (const access of propertyAccesses) {
    const text = access.getText();

    // ctx.sources.main.<table> pattern
    const sourcesMatch = text.match(/ctx\.sources\.main\.(\w+)/);
    if (sourcesMatch) {
      const table = sourcesMatch[1].toLowerCase();
      if (!seenReads.has(table) && !isReservedWord(table)) {
        seenReads.add(table);
        reads.push({ table });
      }
    }

    // Detect common API clients
    const apiPatterns = [
      { pattern: /^shopify\./i, name: "Shopify" },
      { pattern: /^stripe\./i, name: "Stripe" },
      { pattern: /^slack\./i, name: "Slack" },
      { pattern: /^github\./i, name: "GitHub" },
      { pattern: /^notion\./i, name: "Notion" },
      { pattern: /^airtable\./i, name: "Airtable" },
      { pattern: /^supabase\./i, name: "Supabase" },
      { pattern: /^firebase\./i, name: "Firebase" },
    ];

    for (const { pattern, name } of apiPatterns) {
      if (pattern.test(text)) {
        const id = `api-${name.toLowerCase()}`;
        if (!seenSources.has(id)) {
          seenSources.add(id);
          sources.push({ id, name, type: "api" });
        }
      }
    }
  }

  // Find schedule in object literals
  const objectLiterals = sourceFile.getDescendantsOfKind(SyntaxKind.ObjectLiteralExpression);
  for (const obj of objectLiterals) {
    for (const prop of obj.getProperties()) {
      if (Node.isPropertyAssignment(prop)) {
        const name = prop.getName();
        if (name === "schedule") {
          const init = prop.getInitializer();
          if (init) {
            const scheduleValue = getStringValue(init);
            if (scheduleValue && !seenSources.has("schedule")) {
              seenSources.add("schedule");
              sources.push({ id: "schedule", name: scheduleValue, type: "schedule" });
            }
          }
        }
        // Detect webhook trigger
        if (name === "triggers") {
          const init = prop.getInitializer();
          if (init && init.getText().includes("webhook")) {
            if (!seenSources.has("webhook")) {
              seenSources.add("webhook");
              sources.push({ id: "webhook", name: "Webhook", type: "webhook" });
            }
          }
        }
      }
    }
  }

  return { sources, reads, writes };
}

/**
 * Process a SQL string to extract table reads and writes
 */
function processSqlString(
  sql: string,
  reads: ActionLineage["reads"],
  writes: ActionLineage["writes"],
  seenReads: Set<string>,
  seenWrites: Set<string>
): void {
  // Skip if it doesn't look like SQL
  if (!looksLikeSql(sql)) return;

  try {
    // Try to parse as SQL
    const ast = sqlParser.astify(sql, { database: "PostgreSQL" });

    // Handle array of statements
    const statements = Array.isArray(ast) ? ast : [ast];

    for (const stmt of statements) {
      if (!stmt) continue;

      extractTablesFromAst(stmt, reads, writes, seenReads, seenWrites);
    }
  } catch {
    // SQL parser failed - try regex fallback for partial SQL
    extractTablesRegex(sql, reads, writes, seenReads, seenWrites);
  }
}

/**
 * Extract tables from a parsed SQL AST
 */
function extractTablesFromAst(
  ast: unknown,
  reads: ActionLineage["reads"],
  writes: ActionLineage["writes"],
  seenReads: Set<string>,
  seenWrites: Set<string>
): void {
  if (!ast || typeof ast !== "object") return;

  const stmt = ast as Record<string, unknown>;
  const stmtType = stmt.type as string | undefined;

  // SELECT - reads from tables
  if (stmtType === "select") {
    const from = stmt.from as Array<{ table?: string }> | undefined;
    if (from) {
      for (const source of from) {
        if (source.table) {
          const table = source.table.toLowerCase();
          if (!seenReads.has(table) && !isReservedWord(table)) {
            seenReads.add(table);
            reads.push({ table });
          }
        }
      }
    }
  }

  // INSERT - writes to table
  if (stmtType === "insert" || stmtType === "replace") {
    const tableList = stmt.table as Array<{ table?: string }> | undefined;
    if (tableList) {
      for (const t of tableList) {
        if (t.table) {
          const table = t.table.toLowerCase();
          // Check for ON CONFLICT (upsert)
          const hasOnConflict = stmt.on_duplicate_update || stmt.on_conflict;
          const operation = hasOnConflict ? "upsert" : "insert";

          if (!seenWrites.has(table) && !isReservedWord(table)) {
            seenWrites.add(table);
            writes.push({ table, operation });
          }
        }
      }
    }
  }

  // UPDATE - writes to table
  if (stmtType === "update") {
    const tableList = stmt.table as Array<{ table?: string }> | undefined;
    if (tableList) {
      for (const t of tableList) {
        if (t.table) {
          const table = t.table.toLowerCase();
          if (!seenWrites.has(table) && !isReservedWord(table)) {
            seenWrites.add(table);
            writes.push({ table, operation: "update" });
          }
        }
      }
    }
  }

  // DELETE - writes to table
  if (stmtType === "delete") {
    const from = stmt.from as Array<{ table?: string }> | undefined;
    if (from) {
      for (const source of from) {
        if (source.table) {
          const table = source.table.toLowerCase();
          if (!seenWrites.has(table) && !isReservedWord(table)) {
            seenWrites.add(table);
            writes.push({ table, operation: "delete" });
          }
        }
      }
    }
  }
}

/**
 * Fallback regex extraction for SQL that couldn't be parsed
 */
function extractTablesRegex(
  sql: string,
  reads: ActionLineage["reads"],
  writes: ActionLineage["writes"],
  seenReads: Set<string>,
  seenWrites: Set<string>
): void {
  // SELECT ... FROM table
  const selectMatches = sql.matchAll(/SELECT\s+.*?\s+FROM\s+["'`]?(\w+)["'`]?/gi);
  for (const match of selectMatches) {
    const table = match[1].toLowerCase();
    if (!seenReads.has(table) && !isReservedWord(table)) {
      seenReads.add(table);
      reads.push({ table });
    }
  }

  // INSERT INTO table
  const insertMatches = sql.matchAll(/INSERT\s+INTO\s+["'`]?(\w+)["'`]?/gi);
  for (const match of insertMatches) {
    const table = match[1].toLowerCase();
    const hasOnConflict = /ON\s+CONFLICT/i.test(sql);
    const operation = hasOnConflict ? "upsert" : "insert";
    if (!seenWrites.has(table) && !isReservedWord(table)) {
      seenWrites.add(table);
      writes.push({ table, operation });
    }
  }

  // UPDATE table SET
  const updateMatches = sql.matchAll(/UPDATE\s+["'`]?(\w+)["'`]?\s+SET/gi);
  for (const match of updateMatches) {
    const table = match[1].toLowerCase();
    if (!seenWrites.has(table) && !isReservedWord(table)) {
      seenWrites.add(table);
      writes.push({ table, operation: "update" });
    }
  }

  // DELETE FROM table
  const deleteMatches = sql.matchAll(/DELETE\s+FROM\s+["'`]?(\w+)["'`]?/gi);
  for (const match of deleteMatches) {
    const table = match[1].toLowerCase();
    if (!seenWrites.has(table) && !isReservedWord(table)) {
      seenWrites.add(table);
      writes.push({ table, operation: "delete" });
    }
  }
}

/**
 * Check if a string looks like it might contain SQL
 */
function looksLikeSql(text: string): boolean {
  const sqlKeywords = /\b(SELECT|INSERT|UPDATE|DELETE|FROM|INTO|SET|WHERE|VALUES)\b/i;
  return sqlKeywords.test(text);
}

/**
 * Extract API source info from a URL
 */
function extractApiSource(url: string): ActionLineage["sources"][0] | null {
  try {
    const urlObj = new URL(url.startsWith("http") ? url : `https://${url}`);
    let name = urlObj.hostname.replace("www.", "").split(".")[0];
    name = name.charAt(0).toUpperCase() + name.slice(1);
    return { id: `api-${name.toLowerCase()}`, name, type: "api" };
  } catch {
    // Extract from path if URL parsing fails
    const segments = url.split("/").filter(Boolean);
    if (segments.length > 0) {
      const name = segments[0];
      return { id: `api-${name.toLowerCase()}`, name, type: "api" };
    }
    return null;
  }
}

/**
 * Get string value from an AST node (handles string literals and template literals)
 */
function getStringValue(node: Node): string | null {
  if (Node.isStringLiteral(node)) {
    return node.getLiteralText();
  }
  if (Node.isNoSubstitutionTemplateLiteral(node)) {
    return node.getLiteralText();
  }
  return null;
}

/**
 * Extract text from a template literal, replacing interpolations with placeholders
 * This allows SQL parsing even when template has ${...} substitutions
 */
function extractTemplateText(template: Node): string | null {
  // NoSubstitutionTemplateLiteral - simple case, no interpolations
  if (Node.isNoSubstitutionTemplateLiteral(template)) {
    return template.getLiteralText();
  }

  // TemplateExpression - has interpolations like ${value}
  if (Node.isTemplateExpression(template)) {
    let result = template.getHead().getLiteralText();

    for (const span of template.getTemplateSpans()) {
      // Replace interpolation with a placeholder that won't break SQL parsing
      // Use a simple value that's valid in SQL context
      result += "'__PLACEHOLDER__'";
      result += span.getLiteral().getLiteralText();
    }

    return result;
  }

  return null;
}

/**
 * Check if a word is a SQL reserved word that shouldn't be treated as a table
 */
function isReservedWord(word: string): boolean {
  const reserved = new Set([
    "select", "from", "where", "and", "or", "not", "in", "like", "between",
    "is", "null", "true", "false", "as", "on", "join", "left", "right",
    "inner", "outer", "cross", "group", "by", "having", "order", "asc",
    "desc", "limit", "offset", "union", "all", "distinct", "case", "when",
    "then", "else", "end", "values", "set", "default", "insert", "update",
    "delete", "into", "create", "table", "drop", "alter", "index", "primary",
    "key", "foreign", "references", "constraint", "unique", "check", "exists",
  ]);
  return reserved.has(word.toLowerCase());
}
