/**
 * SQL Query Parser
 *
 * Extracts sql`` tagged template literals from TypeScript files
 * Uses ts-morph for AST parsing and @pgtyped/parser for SQL analysis
 */

import { type Param, parseTSQuery, type TSQueryAST } from "@pgtyped/parser";
import { Project, SyntaxKind, type TaggedTemplateExpression } from "ts-morph";

export interface ExtractedQuery {
  /** Query name (derived from variable name or generated) */
  name: string;
  /** Raw SQL text */
  sql: string;
  /** Parsed query AST from pgtyped */
  ast: TSQueryAST;
  /** Parameter information */
  params: Param[];
  /** Location in source file */
  location: {
    line: number;
    column: number;
  };
  /** Variable name if assigned to const/let */
  variableName?: string;
}

export interface ParsedFile {
  filePath: string;
  queries: ExtractedQuery[];
  errors: string[];
}

/**
 * Extract sql`` tagged templates from a TypeScript source file
 */
export function extractQueriesFromSource(source: string, filePath: string): ParsedFile {
  const project = new Project({ useInMemoryFileSystem: true });
  const sourceFile = project.createSourceFile("temp.tsx", source);

  const queries: ExtractedQuery[] = [];
  const errors: string[] = [];
  let queryIndex = 0;

  // Find all tagged template expressions
  const taggedTemplates = sourceFile.getDescendantsOfKind(SyntaxKind.TaggedTemplateExpression);

  for (const tagged of taggedTemplates) {
    const tagName = getTagName(tagged);

    // Only process sql`` or sql<Type>`` tags
    if (tagName !== "sql") continue;

    try {
      const sqlText = extractTemplateText(tagged);
      const variableName = getVariableName(tagged);
      const queryName = variableName || `query_${queryIndex++}`;

      // Parse with pgtyped parser
      const { query: ast, events } = parseTSQuery(sqlText, queryName);

      // Check for parse errors - use type assertion since ParseEventType may not include "error" string
      const parseErrors = events.filter((e) => (e as unknown as { type: string }).type === "error");
      if (parseErrors.length > 0) {
        for (const err of parseErrors) {
          errors.push(
            `Query "${queryName}": ${(err as unknown as { message?: string }).message || "Unknown parse error"}`,
          );
        }
      }

      const pos = tagged.getStartLineNumber();
      const col = tagged.getStartLinePos();

      queries.push({
        name: queryName,
        sql: sqlText,
        ast,
        params: ast.params,
        location: { line: pos, column: col },
        variableName,
      });
    } catch (err) {
      errors.push(`Failed to parse query at line ${tagged.getStartLineNumber()}: ${err}`);
    }
  }

  return { filePath, queries, errors };
}

/**
 * Get the tag name from a tagged template expression
 * Handles: sql`...`, sql<Type>`...`, etc.
 */
function getTagName(tagged: TaggedTemplateExpression): string {
  const tag = tagged.getTag();

  // Direct identifier: sql`...`
  if (tag.isKind(SyntaxKind.Identifier)) {
    return tag.getText();
  }

  // Type argument: sql<Type>`...`
  if (tag.isKind(SyntaxKind.CallExpression)) {
    const expr = tag.getExpression();
    if (expr.isKind(SyntaxKind.Identifier)) {
      return expr.getText();
    }
  }

  return "";
}

/**
 * Extract the SQL text from a template literal
 * Converts interpolations like ${foo} to pgtyped parameter syntax $foo
 */
function extractTemplateText(tagged: TaggedTemplateExpression): string {
  const template = tagged.getTemplate();

  if (template.isKind(SyntaxKind.NoSubstitutionTemplateLiteral)) {
    // Simple template with no interpolations
    return template.getLiteralText();
  }

  if (template.isKind(SyntaxKind.TemplateExpression)) {
    // Template with interpolations
    let result = template.getHead().getLiteralText();

    for (const span of template.getTemplateSpans()) {
      const expr = span.getExpression();
      // Convert ${paramName} to $paramName for pgtyped
      const paramName = expr.getText();
      result += `$${paramName}`;
      result += span.getLiteral().getLiteralText();
    }

    return result;
  }

  return "";
}

/**
 * Get the variable name if the tagged template is assigned to a variable
 * e.g., const getUsers = sql`SELECT...` -> "getUsers"
 */
function getVariableName(tagged: TaggedTemplateExpression): string | undefined {
  const parent = tagged.getParent();

  // const foo = sql`...`
  if (parent?.isKind(SyntaxKind.VariableDeclaration)) {
    return parent.getName();
  }

  // Typed: const foo = sql<Type>`...`
  // The parent would be a CallExpression, need to go up more
  if (parent?.isKind(SyntaxKind.CallExpression)) {
    const grandparent = parent.getParent();
    if (grandparent?.isKind(SyntaxKind.VariableDeclaration)) {
      return grandparent.getName();
    }
  }

  return undefined;
}

/**
 * Extract queries from multiple files
 */
export function extractQueriesFromFiles(files: { path: string; content: string }[]): ParsedFile[] {
  return files.map((f) => extractQueriesFromSource(f.content, f.path));
}
