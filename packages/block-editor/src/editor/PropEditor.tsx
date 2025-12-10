/**
 * Prop Editor - Property panel for editing selected node props
 */

import { useState, useCallback } from "react"
import type { JsxNode, PropValue, PropSchema, PropDefinition } from "../model/block-model"

export interface PropEditorProps {
  /** The selected node */
  node: JsxNode | null

  /** Prop schema for the node's component */
  schema: PropSchema | null

  /** Callback when props change */
  onChange: (updates: Partial<JsxNode>) => void

  /** Class name for the container */
  className?: string
}

/**
 * Property editor panel
 */
export function PropEditor({ node, schema, onChange, className }: PropEditorProps) {
  if (!node) {
    return (
      <div className={`w-72 border-l bg-muted/20 p-4 ${className ?? ""}`}>
        <p className="text-sm text-muted-foreground">
          Select a component to edit its properties
        </p>
      </div>
    )
  }

  const handlePropChange = useCallback(
    (propName: string, value: PropValue) => {
      const newProps = { ...node.props, [propName]: value }
      onChange({ props: newProps })
    },
    [node.props, onChange]
  )

  const handlePropDelete = useCallback(
    (propName: string) => {
      const newProps = { ...node.props }
      delete newProps[propName]
      onChange({ props: newProps })
    },
    [node.props, onChange]
  )

  // For text nodes, show text editor
  if (node.type === "text") {
    return (
      <div className={`w-72 border-l bg-muted/20 ${className ?? ""}`}>
        <div className="p-3 border-b">
          <h2 className="text-sm font-semibold">Text Node</h2>
        </div>
        <div className="p-3">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            Content
          </label>
          <textarea
            value={node.text ?? ""}
            onChange={(e) => onChange({ text: e.target.value })}
            className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded resize-y min-h-[80px]"
            placeholder="Enter text..."
          />
        </div>
      </div>
    )
  }

  // For expression nodes, show expression editor
  if (node.type === "expression") {
    return (
      <div className={`w-72 border-l bg-muted/20 ${className ?? ""}`}>
        <div className="p-3 border-b">
          <h2 className="text-sm font-semibold">Expression</h2>
        </div>
        <div className="p-3">
          <label className="block text-xs font-medium text-muted-foreground mb-1">
            JavaScript Expression
          </label>
          <textarea
            value={node.expression ?? ""}
            onChange={(e) => onChange({ expression: e.target.value })}
            className="w-full px-2 py-1.5 text-sm font-mono bg-background border border-border rounded resize-y min-h-[80px]"
            placeholder="{data.map(...)}"
          />
        </div>
      </div>
    )
  }

  // For elements, show prop editors
  return (
    <div className={`w-72 border-l bg-muted/20 overflow-y-auto ${className ?? ""}`}>
      <div className="p-3 border-b">
        <h2 className="text-sm font-semibold">{node.tagName}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">Edit component properties</p>
      </div>

      <div className="p-3 space-y-4">
        {/* Show props from schema */}
        {schema &&
          Object.entries(schema.properties).map(([propName, propDef]) => (
            <PropField
              key={propName}
              name={propName}
              definition={propDef}
              value={node.props?.[propName]}
              required={schema.required.includes(propName)}
              onChange={(value) => handlePropChange(propName, value)}
              onDelete={() => handlePropDelete(propName)}
            />
          ))}

        {/* Show existing props not in schema */}
        {node.props &&
          Object.entries(node.props)
            .filter(([name]) => !schema?.properties[name])
            .map(([propName, propValue]) => (
              <PropField
                key={propName}
                name={propName}
                definition={{ type: "unknown" }}
                value={propValue}
                required={false}
                onChange={(value) => handlePropChange(propName, value)}
                onDelete={() => handlePropDelete(propName)}
              />
            ))}

        {/* Add prop button */}
        <AddPropButton
          existingProps={Object.keys(node.props ?? {})}
          onAdd={(name) => handlePropChange(name, { type: "literal", value: "" })}
        />
      </div>
    </div>
  )
}

interface PropFieldProps {
  name: string
  definition: PropDefinition
  value: PropValue | undefined
  required: boolean
  onChange: (value: PropValue) => void
  onDelete: () => void
}

/**
 * Individual prop field editor
 */
function PropField({
  name,
  definition,
  value,
  required,
  onChange,
  onDelete,
}: PropFieldProps) {
  const editor = definition.editor ?? getDefaultEditor(definition.type)

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">
          {name}
          {required && <span className="text-destructive ml-0.5">*</span>}
        </label>
        {!required && (
          <button
            onClick={onDelete}
            className="text-xs text-muted-foreground hover:text-destructive"
          >
            ×
          </button>
        )}
      </div>

      {definition.description && (
        <p className="text-xs text-muted-foreground">{definition.description}</p>
      )}

      {editor === "text" && (
        <input
          type="text"
          value={getStringValue(value)}
          onChange={(e) => onChange({ type: "literal", value: e.target.value })}
          placeholder={name}
          className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded"
        />
      )}

      {editor === "number" && (
        <input
          type="number"
          value={getNumberValue(value)}
          onChange={(e) => onChange({ type: "literal", value: parseFloat(e.target.value) || 0 })}
          className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded"
        />
      )}

      {editor === "boolean" && (
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={getBooleanValue(value)}
            onChange={(e) => onChange({ type: "literal", value: e.target.checked })}
            className="rounded border-border"
          />
          <span className="text-sm">{getBooleanValue(value) ? "true" : "false"}</span>
        </label>
      )}

      {editor === "select" && definition.literalOptions && (
        <select
          value={getStringValue(value)}
          onChange={(e) => onChange({ type: "literal", value: e.target.value })}
          className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded"
        >
          <option value="">Select...</option>
          {definition.literalOptions.map((opt) => (
            <option key={String(opt)} value={String(opt)}>
              {String(opt)}
            </option>
          ))}
        </select>
      )}

      {editor === "textarea" && (
        <textarea
          value={getStringValue(value)}
          onChange={(e) => onChange({ type: "literal", value: e.target.value })}
          className="w-full px-2 py-1.5 text-sm bg-background border border-border rounded resize-y min-h-[60px]"
        />
      )}

      {editor === "code" && (
        <textarea
          value={value?.rawSource ?? getStringValue(value)}
          onChange={(e) =>
            onChange({ type: "expression", value: e.target.value, rawSource: e.target.value })
          }
          className="w-full px-2 py-1.5 text-sm font-mono bg-background border border-border rounded resize-y min-h-[60px]"
          placeholder="JavaScript expression..."
        />
      )}

      {editor === "json" && (
        <textarea
          value={JSON.stringify(value?.value ?? null, null, 2)}
          onChange={(e) => {
            try {
              const parsed = JSON.parse(e.target.value)
              onChange({ type: "literal", value: parsed })
            } catch {
              // Keep raw value for invalid JSON
              onChange({ type: "expression", value: e.target.value, rawSource: e.target.value })
            }
          }}
          className="w-full px-2 py-1.5 text-sm font-mono bg-background border border-border rounded resize-y min-h-[60px]"
        />
      )}
    </div>
  )
}

/**
 * Get default editor type for a prop type
 */
function getDefaultEditor(type: string): PropDefinition["editor"] {
  switch (type) {
    case "string":
      return "text"
    case "number":
      return "number"
    case "boolean":
      return "boolean"
    case "object":
    case "array":
      return "json"
    default:
      return "code"
  }
}

/**
 * Extract string value from PropValue
 */
function getStringValue(value: PropValue | undefined): string {
  if (!value) return ""
  if (value.type === "literal" && typeof value.value === "string") {
    return value.value
  }
  return value.rawSource ?? String(value.value ?? "")
}

/**
 * Extract number value from PropValue
 */
function getNumberValue(value: PropValue | undefined): number {
  if (!value) return 0
  if (value.type === "literal" && typeof value.value === "number") {
    return value.value
  }
  return parseFloat(String(value.value)) || 0
}

/**
 * Extract boolean value from PropValue
 */
function getBooleanValue(value: PropValue | undefined): boolean {
  if (!value) return false
  if (value.type === "literal" && typeof value.value === "boolean") {
    return value.value
  }
  return Boolean(value.value)
}

interface AddPropButtonProps {
  existingProps: string[]
  onAdd: (name: string) => void
}

/**
 * Button to add a new prop
 */
function AddPropButton({ existingProps, onAdd }: AddPropButtonProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newPropName, setNewPropName] = useState("")

  const handleAdd = () => {
    if (newPropName && !existingProps.includes(newPropName)) {
      onAdd(newPropName)
      setNewPropName("")
      setIsAdding(false)
    }
  }

  if (isAdding) {
    return (
      <div className="flex gap-2">
        <input
          type="text"
          value={newPropName}
          onChange={(e) => setNewPropName(e.target.value)}
          placeholder="prop name"
          className="flex-1 px-2 py-1 text-sm bg-background border border-border rounded"
          autoFocus
          onKeyDown={(e) => {
            if (e.key === "Enter") handleAdd()
            if (e.key === "Escape") setIsAdding(false)
          }}
        />
        <button
          onClick={handleAdd}
          disabled={!newPropName || existingProps.includes(newPropName)}
          className="px-2 py-1 text-sm bg-primary text-primary-foreground rounded disabled:opacity-50"
        >
          Add
        </button>
        <button
          onClick={() => setIsAdding(false)}
          className="px-2 py-1 text-sm text-muted-foreground hover:text-foreground"
        >
          ×
        </button>
      </div>
    )
  }

  return (
    <button
      onClick={() => setIsAdding(true)}
      className="w-full px-2 py-1.5 text-sm text-muted-foreground hover:text-foreground border border-dashed border-border rounded hover:border-border"
    >
      + Add property
    </button>
  )
}

export default PropEditor
