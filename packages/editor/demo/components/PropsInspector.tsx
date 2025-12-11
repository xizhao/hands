import React, { useCallback, useState } from 'react'
import type { JsxNode, NodePath, Mutation, PropValue } from '../../src'
import { literal, expression } from '../../src'

interface PropsInspectorProps {
  ast: JsxNode | null
  selectedPath: NodePath | null
  onMutation: (mutation: Mutation) => void
}

export function PropsInspector({ ast, selectedPath, onMutation }: PropsInspectorProps) {
  if (!selectedPath || !ast) {
    return (
      <div style={styles.empty}>
        Click an element in the canvas to inspect its props.
      </div>
    )
  }

  const node = getNodeAtPath(ast, selectedPath)
  if (!node) {
    return (
      <div style={styles.empty}>
        Node not found at selected path.
      </div>
    )
  }

  if (node.type === 'text') {
    return (
      <TextEditor
        node={node}
        path={selectedPath}
        onMutation={onMutation}
      />
    )
  }

  if (node.type === 'expression') {
    return (
      <div style={styles.container}>
        <div style={styles.header}>
          <span style={styles.nodeType}>Expression</span>
        </div>
        <div style={styles.expressionPreview}>
          {node.expression}
        </div>
      </div>
    )
  }

  // Element node
  return (
    <ElementInspector
      node={node}
      path={selectedPath}
      onMutation={onMutation}
    />
  )
}

interface TextEditorProps {
  node: JsxNode
  path: NodePath
  onMutation: (mutation: Mutation) => void
}

function TextEditor({ node, path, onMutation }: TextEditorProps) {
  const [value, setValue] = useState(node.text ?? '')

  const handleBlur = useCallback(() => {
    if (value !== node.text) {
      onMutation({
        type: 'set-text',
        path,
        text: value,
      })
    }
  }, [value, node.text, path, onMutation])

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.nodeType}>Text</span>
      </div>
      <div style={styles.field}>
        <label style={styles.label}>Content</label>
        <textarea
          style={styles.textarea}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onBlur={handleBlur}
          rows={3}
        />
      </div>
    </div>
  )
}

interface ElementInspectorProps {
  node: JsxNode
  path: NodePath
  onMutation: (mutation: Mutation) => void
}

function ElementInspector({ node, path, onMutation }: ElementInspectorProps) {
  const props = node.props ?? {}
  const propEntries = Object.entries(props)

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <span style={styles.tagName}>&lt;{node.tagName}&gt;</span>
        <span style={styles.pathDisplay}>{formatPath(path)}</span>
      </div>

      <div style={styles.propsSection}>
        <div style={styles.sectionTitle}>Props</div>
        {propEntries.length === 0 ? (
          <div style={styles.noProps}>No props defined</div>
        ) : (
          propEntries.map(([propName, propValue]) => (
            <PropEditor
              key={propName}
              propName={propName}
              propValue={propValue}
              path={path}
              onMutation={onMutation}
            />
          ))
        )}
      </div>

      <AddPropButton path={path} existingProps={Object.keys(props)} onMutation={onMutation} />

      <div style={styles.actions}>
        <button
          style={styles.deleteButton}
          onClick={() => onMutation({ type: 'delete-node', path })}
        >
          Delete Element
        </button>
      </div>
    </div>
  )
}

interface PropEditorProps {
  propName: string
  propValue: PropValue
  path: NodePath
  onMutation: (mutation: Mutation) => void
}

function PropEditor({ propName, propValue, path, onMutation }: PropEditorProps) {
  const [isEditing, setIsEditing] = useState(false)
  const [editValue, setEditValue] = useState(getEditableValue(propValue))

  const handleSave = useCallback(() => {
    setIsEditing(false)
    const newValue = parseEditedValue(editValue, propValue.type)
    onMutation({
      type: 'set-prop',
      path,
      prop: propName,
      value: newValue,
    })
  }, [editValue, propValue.type, path, propName, onMutation])

  const handleDelete = useCallback(() => {
    onMutation({
      type: 'delete-prop',
      path,
      prop: propName,
    })
  }, [path, propName, onMutation])

  return (
    <div style={styles.propRow}>
      <span style={styles.propName}>{propName}</span>
      {isEditing ? (
        <div style={styles.editRow}>
          <input
            style={styles.input}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onBlur={handleSave}
            onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            autoFocus
          />
        </div>
      ) : (
        <div style={styles.valueRow}>
          <span
            style={styles.propValue}
            onClick={() => setIsEditing(true)}
          >
            {formatPropValueDisplay(propValue)}
          </span>
          <button style={styles.deleteIcon} onClick={handleDelete}>×</button>
        </div>
      )}
    </div>
  )
}

interface AddPropButtonProps {
  path: NodePath
  existingProps: string[]
  onMutation: (mutation: Mutation) => void
}

function AddPropButton({ path, existingProps, onMutation }: AddPropButtonProps) {
  const [isAdding, setIsAdding] = useState(false)
  const [newPropName, setNewPropName] = useState('')
  const [newPropValue, setNewPropValue] = useState('')

  const handleAdd = useCallback(() => {
    if (newPropName && !existingProps.includes(newPropName)) {
      onMutation({
        type: 'set-prop',
        path,
        prop: newPropName,
        value: literal(newPropValue),
      })
      setNewPropName('')
      setNewPropValue('')
      setIsAdding(false)
    }
  }, [newPropName, newPropValue, existingProps, path, onMutation])

  if (!isAdding) {
    return (
      <button style={styles.addButton} onClick={() => setIsAdding(true)}>
        + Add Prop
      </button>
    )
  }

  return (
    <div style={styles.addPropForm}>
      <input
        style={styles.input}
        placeholder="prop name"
        value={newPropName}
        onChange={(e) => setNewPropName(e.target.value)}
        autoFocus
      />
      <input
        style={styles.input}
        placeholder="value"
        value={newPropValue}
        onChange={(e) => setNewPropValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <button style={styles.saveButton} onClick={handleAdd}>Add</button>
      <button style={styles.cancelButton} onClick={() => setIsAdding(false)}>Cancel</button>
    </div>
  )
}

// Utility functions
function getNodeAtPath(root: JsxNode, path: NodePath): JsxNode | null {
  let current: JsxNode | undefined = root

  for (let i = 0; i < path.length; i += 2) {
    if (path[i] !== 'children') return null
    const index = path[i + 1] as number
    current = current?.children?.[index]
    if (!current) return null
  }

  return current || root
}

function getEditableValue(propValue: PropValue): string {
  if (propValue.type === 'literal') {
    return typeof propValue.value === 'string'
      ? propValue.value
      : JSON.stringify(propValue.value)
  }
  return String(propValue.value ?? '')
}

function parseEditedValue(value: string, originalType: string): PropValue {
  // Try to parse as JSON first
  try {
    const parsed = JSON.parse(value)
    return literal(parsed)
  } catch {
    // If it looks like an expression (contains variables, etc.)
    if (value.includes('.') || value.includes('(') || /^[a-z_]\w*$/i.test(value)) {
      return expression(value)
    }
    // Otherwise treat as string literal
    return literal(value)
  }
}

function formatPropValueDisplay(propValue: PropValue): string {
  if (propValue.type === 'literal') {
    const v = propValue.value
    if (typeof v === 'string') return `"${v}"`
    if (typeof v === 'boolean') return v ? 'true' : 'false'
    if (v === null) return 'null'
    return String(v)
  }
  if (propValue.type === 'expression') {
    return `{${propValue.value}}`
  }
  return '?'
}

function formatPath(path: NodePath): string {
  return path.length === 0 ? 'root' : path.filter((_, i) => i % 2 === 1).join('.')
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    padding: '12px',
  },
  empty: {
    color: '#666',
    fontSize: '13px',
    padding: '16px',
    textAlign: 'center',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: '16px',
    paddingBottom: '12px',
    borderBottom: '1px solid #333',
  },
  tagName: {
    color: '#7eb3ff',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '15px',
    fontWeight: 600,
  },
  nodeType: {
    color: '#888',
    fontSize: '13px',
    fontWeight: 500,
  },
  pathDisplay: {
    color: '#666',
    fontSize: '11px',
    fontFamily: 'ui-monospace, monospace',
  },
  propsSection: {
    marginBottom: '16px',
  },
  sectionTitle: {
    color: '#888',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.5px',
    marginBottom: '8px',
  },
  noProps: {
    color: '#555',
    fontSize: '12px',
    fontStyle: 'italic',
  },
  propRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginBottom: '8px',
    padding: '6px 8px',
    backgroundColor: '#252525',
    borderRadius: '4px',
  },
  propName: {
    color: '#9cdcfe',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
    minWidth: '80px',
  },
  propValue: {
    color: '#ce9178',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
    cursor: 'pointer',
    flex: 1,
  },
  valueRow: {
    display: 'flex',
    alignItems: 'center',
    flex: 1,
    gap: '8px',
  },
  editRow: {
    flex: 1,
  },
  input: {
    width: '100%',
    padding: '4px 8px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#e0e0e0',
    fontSize: '12px',
    fontFamily: 'ui-monospace, monospace',
  },
  textarea: {
    width: '100%',
    padding: '8px',
    backgroundColor: '#1a1a1a',
    border: '1px solid #444',
    borderRadius: '4px',
    color: '#e0e0e0',
    fontSize: '12px',
    fontFamily: 'ui-monospace, monospace',
    resize: 'vertical',
  },
  deleteIcon: {
    background: 'none',
    border: 'none',
    color: '#666',
    cursor: 'pointer',
    fontSize: '16px',
    padding: '0 4px',
  },
  addButton: {
    width: '100%',
    padding: '8px',
    backgroundColor: '#252525',
    border: '1px dashed #444',
    borderRadius: '4px',
    color: '#888',
    cursor: 'pointer',
    fontSize: '12px',
    marginBottom: '16px',
  },
  addPropForm: {
    display: 'flex',
    gap: '8px',
    marginBottom: '16px',
    flexWrap: 'wrap',
  },
  saveButton: {
    padding: '4px 12px',
    backgroundColor: '#2a5a2a',
    border: 'none',
    borderRadius: '4px',
    color: '#fff',
    cursor: 'pointer',
    fontSize: '12px',
  },
  cancelButton: {
    padding: '4px 12px',
    backgroundColor: '#333',
    border: 'none',
    borderRadius: '4px',
    color: '#888',
    cursor: 'pointer',
    fontSize: '12px',
  },
  actions: {
    borderTop: '1px solid #333',
    paddingTop: '12px',
  },
  deleteButton: {
    width: '100%',
    padding: '8px',
    backgroundColor: '#3a2525',
    border: '1px solid #5a3535',
    borderRadius: '4px',
    color: '#ff8a8a',
    cursor: 'pointer',
    fontSize: '12px',
  },
  field: {
    marginBottom: '12px',
  },
  label: {
    display: 'block',
    color: '#888',
    fontSize: '11px',
    marginBottom: '4px',
  },
  expressionPreview: {
    padding: '12px',
    backgroundColor: '#2a2a1a',
    borderRadius: '4px',
    color: '#ffb74d',
    fontFamily: 'ui-monospace, monospace',
    fontSize: '12px',
    whiteSpace: 'pre-wrap',
  },
}
