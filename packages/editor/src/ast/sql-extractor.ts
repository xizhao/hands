/**
 * SQL Data Dependency Extractor
 *
 * Analyzes block source to extract:
 * 1. SQL queries from ctx.db.sql tagged template literals
 * 2. Tables and columns referenced in those queries
 * 3. Variable bindings that link SQL results to JSX usage
 *
 * This enables showing data dependencies in the editor UI.
 */

import { parseSync } from 'oxc-parser'
import { parse as parseSql, astVisitor, toSql } from 'pgsql-ast-parser'
import type { Statement, SelectStatement, InsertStatement, UpdateStatement, DeleteStatement, CreateTableStatement } from 'pgsql-ast-parser'

// ============================================================================
// Types
// ============================================================================

/** Re-use SourceLocation from oxc-parser (same structure) */
interface SourceLocation {
  start: number
  end: number
}

/** A column reference with optional table context */
export interface ColumnRef {
  column: string
  table?: string
  alias?: string
}

/** A SQL query extracted from source */
export interface SqlQuery {
  /** Raw SQL string (with ${...} replaced with $1, $2, etc.) */
  sql: string
  /** Original template literal source */
  rawSource: string
  /** Tables referenced (FROM, JOIN, INSERT INTO, UPDATE, etc.) */
  tables: string[]
  /** Columns selected or used */
  columns: ColumnRef[]
  /** Query type */
  type: 'select' | 'insert' | 'update' | 'delete' | 'create' | 'other'
  /** Variable name if this query result is assigned */
  assignedTo?: string
  /** Location in source */
  loc: SourceLocation
}

/** A JSX element that uses SQL data */
export interface JsxDataUsage {
  /** Location of the JSX element (matches AST node location) */
  elementLoc: SourceLocation
  /** Tables this element depends on */
  tables: string[]
}

/** Data flow from SQL query to JSX */
export interface DataBinding {
  /** Variable holding query result */
  variable: string
  /** SQL query that produced it */
  query: SqlQuery
  /** JSX expression locations where this variable is used */
  usages: SourceLocation[]
  /** JSX element locations that contain usages (for UI decoration) */
  jsxElements: SourceLocation[]
}

/** Complete data dependency analysis result */
export interface DataDependencies {
  /** All SQL queries found in source */
  queries: SqlQuery[]
  /** Variable-to-query bindings */
  bindings: DataBinding[]
  /** All tables used across all queries */
  allTables: string[]
  /** All columns used across all queries */
  allColumns: ColumnRef[]
  /** JSX elements that use SQL data (for UI decoration) */
  jsxDataUsages: JsxDataUsage[]
  /** Variables derived from SQL query results (for tracking indirect data flow) */
  derivedVariables: Map<string, string[]> // derived var -> source SQL vars
}

// ============================================================================
// OXC AST Helpers
// ============================================================================

interface OxcNode {
  type: string
  start: number
  end: number
  [key: string]: any
}

/** Check if a node is a ctx.sql or ctx.db.sql member expression */
function isCtxSql(node: OxcNode): boolean {
  // Looking for: ctx.sql or ctx.db.sql (MemberExpression chain)
  if (node.type !== 'MemberExpression') return false

  // Check for .sql
  if (node.property?.type !== 'Identifier' || node.property?.name !== 'sql') return false

  const obj = node.object

  // Pattern 1: ctx.sql (direct)
  if (obj?.type === 'Identifier' && obj?.name === 'ctx') return true

  // Pattern 2: ctx.db.sql (with .db intermediary)
  if (obj?.type === 'MemberExpression') {
    if (obj.property?.type !== 'Identifier' || obj.property?.name !== 'db') return false
    const ctxObj = obj.object
    if (ctxObj?.type === 'Identifier' && ctxObj?.name === 'ctx') return true
  }

  // Could also be props.ctx or destructured
  return false
}

/** Extract SQL string from template literal, replacing expressions with placeholders */
function extractTemplateLiteralSql(quasi: OxcNode, source: string): { sql: string; rawSource: string } {
  const quasis = quasi.quasis || []
  const expressions = quasi.expressions || []

  let sql = ''
  let paramIndex = 1

  for (let i = 0; i < quasis.length; i++) {
    const q = quasis[i]
    // Get the cooked value (processed escape sequences) or raw
    const text = q.value?.cooked ?? q.value?.raw ?? ''
    sql += text

    // Add placeholder for expression if not last quasi
    if (i < expressions.length) {
      sql += `$${paramIndex++}`
    }
  }

  const rawSource = source.slice(quasi.start, quasi.end)
  return { sql: sql.trim(), rawSource }
}

/** Walk AST recursively, calling visitor for each node */
function walkAst(node: OxcNode | null, visitor: (node: OxcNode, parent: OxcNode | null) => void, parent: OxcNode | null = null): void {
  if (!node || typeof node !== 'object') return

  visitor(node, parent)

  for (const key of Object.keys(node)) {
    const value = node[key]
    if (Array.isArray(value)) {
      for (const item of value) {
        if (item && typeof item === 'object' && item.type) {
          walkAst(item, visitor, node)
        }
      }
    } else if (value && typeof value === 'object' && value.type) {
      walkAst(value, visitor, node)
    }
  }
}

/** Find the variable name a query is assigned to */
function findAssignmentTarget(node: OxcNode, parent: OxcNode | null): string | undefined {
  if (!parent) return undefined

  // const users = await ctx.db.sql`...`
  // VariableDeclarator -> id.name
  if (parent.type === 'AwaitExpression') {
    // Look up one more level
    return undefined // Will be handled by parent check
  }

  if (parent.type === 'VariableDeclarator' && parent.id?.type === 'Identifier') {
    return parent.id.name
  }

  return undefined
}

// ============================================================================
// SQL Parsing
// ============================================================================

/** Extract tables from a parsed SQL statement */
function extractTablesFromStatement(stmt: Statement): string[] {
  const tables: string[] = []

  const visitor = astVisitor((map) => ({
    tableRef: (t) => {
      if (t.name) {
        tables.push(t.name)
      }
      map.super().tableRef(t)
    },
  }))

  visitor.statement(stmt)
  return Array.from(new Set(tables))
}

/** Extract columns from a parsed SQL statement */
function extractColumnsFromStatement(stmt: Statement): ColumnRef[] {
  const columns: ColumnRef[] = []

  const visitor = astVisitor((map) => ({
    ref: (r) => {
      if (r.name && r.name !== '*') {
        columns.push({
          column: r.name,
          table: r.table?.name,
        })
      }
      map.super().ref(r)
    },
    // Handle SELECT * case
    selection: (s) => {
      // s is a column reference in SELECT clause
      map.super().selection(s)
    },
  }))

  visitor.statement(stmt)

  // Deduplicate
  const seen = new Set<string>()
  return columns.filter((c) => {
    const key = `${c.table || ''}.${c.column}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

/** Determine query type from statement */
function getQueryType(stmt: Statement): SqlQuery['type'] {
  switch (stmt.type) {
    case 'select':
      return 'select'
    case 'insert':
      return 'insert'
    case 'update':
      return 'update'
    case 'delete':
      return 'delete'
    case 'create table':
      return 'create'
    default:
      return 'other'
  }
}

/** Parse SQL and extract tables/columns */
function analyzeSql(sql: string): { tables: string[]; columns: ColumnRef[]; type: SqlQuery['type'] } {
  try {
    const statements = parseSql(sql)
    if (statements.length === 0) {
      return { tables: [], columns: [], type: 'other' }
    }

    const stmt = statements[0]
    return {
      tables: extractTablesFromStatement(stmt),
      columns: extractColumnsFromStatement(stmt),
      type: getQueryType(stmt),
    }
  } catch (err) {
    // SQL parse error - return empty results
    // This can happen with complex queries or PostgreSQL-specific syntax
    console.warn('[sql-extractor] Failed to parse SQL:', sql.slice(0, 100), err)
    return { tables: [], columns: [], type: 'other' }
  }
}

// ============================================================================
// Main Extractor
// ============================================================================

/**
 * Extract all SQL data dependencies from block source
 */
export function extractDataDependencies(source: string): DataDependencies {
  const queries: SqlQuery[] = []
  const bindings: DataBinding[] = []
  let derivedVariables = new Map<string, string[]>()

  try {
    const result = parseSync('source.tsx', source, { sourceType: 'module' })

    // Find all ctx.db.sql tagged template expressions
    walkAst(result.program as OxcNode, (node, parent) => {
      if (node.type === 'TaggedTemplateExpression') {
        if (isCtxSql(node.tag)) {
          const { sql, rawSource } = extractTemplateLiteralSql(node.quasi, source)
          const { tables, columns, type } = analyzeSql(sql)

          // Find if this is assigned to a variable
          let assignedTo: string | undefined

          // Walk up to find VariableDeclarator
          // node -> AwaitExpression -> VariableDeclarator
          if (parent?.type === 'AwaitExpression') {
            // Need to find grandparent - we'll do another walk
          }

          const query: SqlQuery = {
            sql,
            rawSource,
            tables,
            columns,
            type,
            assignedTo,
            loc: { start: node.start, end: node.end },
          }

          queries.push(query)
        }
      }
    })

    // Second pass: find variable assignments for queries
    const sqlVarNames = new Set<string>()
    walkAst(result.program as OxcNode, (node) => {
      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
        const varName = node.id.name
        const init = node.init

        // Check if init contains a TaggedTemplateExpression with ctx.db.sql
        let queryLoc: SourceLocation | undefined

        walkAst(init, (innerNode) => {
          if (innerNode.type === 'TaggedTemplateExpression' && isCtxSql(innerNode.tag)) {
            queryLoc = { start: innerNode.start, end: innerNode.end }
          }
        })

        if (queryLoc) {
          // Find the matching query and update assignedTo
          const query = queries.find((q) => q.loc.start === queryLoc!.start && q.loc.end === queryLoc!.end)
          if (query) {
            query.assignedTo = varName
            sqlVarNames.add(varName)
            bindings.push({
              variable: varName,
              query,
              usages: [],
              jsxElements: [],
            })
          }
        }
      }
    })

    // 2.5 pass: find derived variables (vars that reference SQL vars in their initializer)
    // e.g. const totalEmails = rows.length -> derived from 'rows'
    derivedVariables = new Map<string, string[]>()
    walkAst(result.program as OxcNode, (node) => {
      if (node.type === 'VariableDeclarator' && node.id?.type === 'Identifier') {
        const varName = node.id.name
        // Skip if this is already a SQL var
        if (sqlVarNames.has(varName)) return

        const init = node.init
        if (!init) return

        // Get source text of initializer and check if any SQL var is referenced
        const initSource = source.slice(init.start, init.end)
        const referencedSqlVars: string[] = []
        for (const sqlVar of sqlVarNames) {
          // Use word boundary regex to avoid matching substrings
          const regex = new RegExp(`\\b${sqlVar}\\b`)
          if (regex.test(initSource)) {
            referencedSqlVars.push(sqlVar)
          }
        }

        if (referencedSqlVars.length > 0) {
          derivedVariables.set(varName, referencedSqlVars)
        }
      }
    })

    // Build set of all variables to track (SQL vars + derived vars pointing to each SQL var)
    const sqlVarToDerivedVars = new Map<string, Set<string>>()
    for (const sqlVar of sqlVarNames) {
      sqlVarToDerivedVars.set(sqlVar, new Set([sqlVar])) // Include the SQL var itself
    }
    for (const [derivedVar, sourceSqlVars] of derivedVariables.entries()) {
      for (const sqlVar of sourceSqlVars) {
        sqlVarToDerivedVars.get(sqlVar)?.add(derivedVar)
      }
    }

    // Third pass: find JSX elements that use bound variables (direct or derived)
    // We look for JSXElement nodes that contain JSXExpressionContainer referencing our vars
    for (const binding of bindings) {
      // Get all variables to search for (SQL var + its derived vars)
      const varsToSearch = sqlVarToDerivedVars.get(binding.variable) || new Set([binding.variable])

      walkAst(result.program as OxcNode, (node) => {
        // Look for JSX expression containers that reference our variable (or derived)
        if (node.type === 'JSXExpressionContainer') {
          const exprSource = source.slice(node.start, node.end)
          // Check if this expression references our variable or any derived variable
          for (const varName of varsToSearch) {
            const regex = new RegExp(`\\b${varName}\\b`)
            if (regex.test(exprSource)) {
              binding.usages.push({ start: node.start, end: node.end })
              break // Only add once even if multiple vars match
            }
          }
        }
      })

      // Now find JSXElement parents for each usage
      for (const usage of binding.usages) {
        // Walk to find the closest JSXElement that contains this usage
        walkAst(result.program as OxcNode, (node) => {
          if (node.type === 'JSXElement') {
            // Check if this element contains the usage (but is the tightest container)
            if (node.start <= usage.start && node.end >= usage.end) {
              // Check if there's a child JSXElement that also contains it
              let hasChildContainer = false
              walkAst(node, (child) => {
                if (child !== node && child.type === 'JSXElement') {
                  if (child.start <= usage.start && child.end >= usage.end) {
                    hasChildContainer = true
                  }
                }
              })

              // Only add if this is the innermost JSXElement containing the usage
              if (!hasChildContainer) {
                const loc = { start: node.start, end: node.end }
                // Avoid duplicates
                if (!binding.jsxElements.some((e) => e.start === loc.start && e.end === loc.end)) {
                  binding.jsxElements.push(loc)
                }
              }
            }
          }
        })
      }
    }
  } catch (err) {
    console.error('[sql-extractor] Failed to parse source:', err)
  }

  // Aggregate all tables and columns
  const allTables = Array.from(new Set(queries.flatMap((q) => q.tables)))
  const allColumns = queries.flatMap((q) => q.columns)

  // Deduplicate columns
  const seenColumns = new Set<string>()
  const uniqueColumns = allColumns.filter((c) => {
    const key = `${c.table || ''}.${c.column}`
    if (seenColumns.has(key)) return false
    seenColumns.add(key)
    return true
  })

  // Build jsxDataUsages from bindings
  const jsxUsageMap = new Map<string, Set<string>>()
  for (const binding of bindings) {
    const tables = binding.query.tables
    for (const jsxEl of binding.jsxElements) {
      const key = `${jsxEl.start}:${jsxEl.end}`
      if (!jsxUsageMap.has(key)) {
        jsxUsageMap.set(key, new Set())
      }
      for (const table of tables) {
        jsxUsageMap.get(key)!.add(table)
      }
    }
  }

  const jsxDataUsages: JsxDataUsage[] = []
  for (const binding of bindings) {
    for (const jsxEl of binding.jsxElements) {
      const key = `${jsxEl.start}:${jsxEl.end}`
      const tables = Array.from(jsxUsageMap.get(key) || [])
      // Avoid duplicates
      if (!jsxDataUsages.some((u) => u.elementLoc.start === jsxEl.start && u.elementLoc.end === jsxEl.end)) {
        jsxDataUsages.push({
          elementLoc: jsxEl,
          tables,
        })
      }
    }
  }

  return {
    queries,
    bindings,
    allTables,
    allColumns: uniqueColumns,
    jsxDataUsages,
    derivedVariables,
  }
}

/**
 * Get a summary of data dependencies for display
 */
export function getDataDependencySummary(deps: DataDependencies): string {
  if (deps.queries.length === 0) {
    return 'No database queries'
  }

  const parts: string[] = []

  if (deps.allTables.length > 0) {
    parts.push(`Tables: ${deps.allTables.join(', ')}`)
  }

  const selectCount = deps.queries.filter((q) => q.type === 'select').length
  const writeCount = deps.queries.filter((q) => ['insert', 'update', 'delete'].includes(q.type)).length

  if (selectCount > 0) {
    parts.push(`${selectCount} SELECT`)
  }
  if (writeCount > 0) {
    parts.push(`${writeCount} write`)
  }

  return parts.join(' | ')
}
