/**
 * SQL Query Editor - Editor for ctx.sql tagged template literals
 */

import { useState, useCallback } from "react"
import type { SqlQuery } from "../model/block-model"

export interface SqlQueryEditorProps {
  /** SQL queries from the block */
  queries: SqlQuery[]

  /** Callback when queries change */
  onQueriesChange: (queries: SqlQuery[]) => void

  /** Database schema for autocomplete (table -> columns) */
  databaseSchema?: Record<string, string[]>

  /** Class name for the container */
  className?: string
}

/**
 * Editor panel for SQL queries in a block
 */
export function SqlQueryEditor({
  queries,
  onQueriesChange,
  databaseSchema,
  className,
}: SqlQueryEditorProps) {
  const [expandedId, setExpandedId] = useState<string | null>(
    queries.length > 0 ? queries[0].id : null
  )

  const handleQueryChange = useCallback(
    (index: number, updates: Partial<SqlQuery>) => {
      const newQueries = [...queries]
      newQueries[index] = { ...newQueries[index], ...updates }
      onQueriesChange(newQueries)
    },
    [queries, onQueriesChange]
  )

  const handleAddQuery = useCallback(() => {
    const newQuery: SqlQuery = {
      id: `query_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      variableName: `data${queries.length + 1}`,
      templateLiteral: "SELECT * FROM ",
    }
    onQueriesChange([...queries, newQuery])
    setExpandedId(newQuery.id)
  }, [queries, onQueriesChange])

  const handleDeleteQuery = useCallback(
    (index: number) => {
      const newQueries = queries.filter((_, i) => i !== index)
      onQueriesChange(newQueries)
      if (queries[index].id === expandedId && newQueries.length > 0) {
        setExpandedId(newQueries[0].id)
      }
    },
    [queries, onQueriesChange, expandedId]
  )

  return (
    <div className={`space-y-3 ${className ?? ""}`}>
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Data Queries</h3>
        <button
          onClick={handleAddQuery}
          className="px-2 py-1 text-xs bg-primary/10 text-primary hover:bg-primary/20 rounded"
        >
          + Add Query
        </button>
      </div>

      {queries.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No SQL queries. Add one to fetch data for this block.
        </p>
      )}

      <div className="space-y-2">
        {queries.map((query, index) => (
          <QueryCard
            key={query.id}
            query={query}
            index={index}
            isExpanded={expandedId === query.id}
            onToggle={() => setExpandedId(expandedId === query.id ? null : query.id)}
            onChange={(updates) => handleQueryChange(index, updates)}
            onDelete={() => handleDeleteQuery(index)}
            databaseSchema={databaseSchema}
          />
        ))}
      </div>
    </div>
  )
}

interface QueryCardProps {
  query: SqlQuery
  index: number
  isExpanded: boolean
  onToggle: () => void
  onChange: (updates: Partial<SqlQuery>) => void
  onDelete: () => void
  databaseSchema?: Record<string, string[]>
}

/**
 * Individual query card with collapsible editor
 */
function QueryCard({
  query,
  index,
  isExpanded,
  onToggle,
  onChange,
  onDelete,
  databaseSchema,
}: QueryCardProps) {
  return (
    <div className="border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div
        onClick={onToggle}
        className="flex items-center gap-2 px-3 py-2 bg-muted/30 cursor-pointer hover:bg-muted/50"
      >
        <span className="text-xs text-muted-foreground">{isExpanded ? "▼" : "▶"}</span>

        <code className="text-xs">
          <span className="text-purple-500">const</span>{" "}
          <span className="text-blue-500">{query.variableName}</span>{" "}
          <span className="text-muted-foreground">=</span>{" "}
          <span className="text-purple-500">await</span>{" "}
          <span className="text-green-500">ctx.sql</span>
          {query.resultType && (
            <span className="text-yellow-600">{`<${query.resultType}>`}</span>
          )}
          <span className="text-muted-foreground">`...`</span>
        </code>

        <div className="flex-1" />

        <button
          onClick={(e) => {
            e.stopPropagation()
            onDelete()
          }}
          className="px-1.5 py-0.5 text-xs text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded"
        >
          ×
        </button>
      </div>

      {/* Expanded editor */}
      {isExpanded && (
        <div className="p-3 space-y-3 border-t border-border">
          {/* Variable name */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-20">Variable:</label>
            <input
              type="text"
              value={query.variableName}
              onChange={(e) => onChange({ variableName: e.target.value })}
              className="flex-1 px-2 py-1 text-sm font-mono bg-background border border-border rounded"
              placeholder="data"
            />
          </div>

          {/* Result type */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-muted-foreground w-20">Type:</label>
            <input
              type="text"
              value={query.resultType ?? ""}
              onChange={(e) => onChange({ resultType: e.target.value || undefined })}
              className="flex-1 px-2 py-1 text-sm font-mono bg-background border border-border rounded"
              placeholder="Record<string, unknown>[]"
            />
          </div>

          {/* SQL editor */}
          <div>
            <label className="block text-xs text-muted-foreground mb-1">SQL Query:</label>
            <textarea
              value={query.templateLiteral}
              onChange={(e) => onChange({ templateLiteral: e.target.value })}
              className="w-full px-2 py-1.5 text-sm font-mono bg-background border border-border rounded resize-y min-h-[100px]"
              placeholder="SELECT * FROM users WHERE active = ${true}"
              spellCheck={false}
            />
          </div>

          {/* Interpolations */}
          {query.interpolations && query.interpolations.length > 0 && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Template Variables:
              </label>
              <div className="space-y-1">
                {query.interpolations.map((interp, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs font-mono">
                    <span className="text-purple-500">${interp.index + 1}</span>
                    <span className="text-muted-foreground">=</span>
                    <code className="flex-1 px-1.5 py-0.5 bg-muted rounded">
                      {interp.expression}
                    </code>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Database schema hint */}
          {databaseSchema && Object.keys(databaseSchema).length > 0 && (
            <div>
              <label className="block text-xs text-muted-foreground mb-1">
                Available Tables:
              </label>
              <div className="flex flex-wrap gap-1">
                {Object.entries(databaseSchema).map(([table, columns]) => (
                  <button
                    key={table}
                    onClick={() => {
                      const sql = query.templateLiteral
                      const cursor = sql.length
                      onChange({
                        templateLiteral: sql.slice(0, cursor) + table + sql.slice(cursor),
                      })
                    }}
                    className="px-1.5 py-0.5 text-xs bg-muted hover:bg-muted/80 rounded"
                    title={columns.join(", ")}
                  >
                    {table}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SqlQueryEditor
