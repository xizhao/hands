import React from 'react'
import type { JsxNode, NodePath } from '../../src'

interface AstViewProps {
  ast: JsxNode | null
  selectedPath: NodePath | null
}

export function AstView({ ast, selectedPath }: AstViewProps) {
  if (!ast) {
    return (
      <div style={styles.empty}>
        No AST parsed yet.
      </div>
    )
  }

  return (
    <div style={styles.container}>
      <AstNode node={ast} path={[]} selectedPath={selectedPath} depth={0} />
    </div>
  )
}

interface AstNodeProps {
  node: JsxNode
  path: NodePath
  selectedPath: NodePath | null
  depth: number
}

function AstNode({ node, path, selectedPath, depth }: AstNodeProps) {
  const isSelected = selectedPath && pathEquals(path, selectedPath)
  const indent = depth * 16

  if (node.type === 'text') {
    const nodeText = node.text ?? ''
    const text = nodeText.length > 30 ? nodeText.slice(0, 30) + '...' : nodeText
    return (
      <div
        style={{
          ...styles.node,
          ...(isSelected ? styles.selected : {}),
          paddingLeft: indent + 8,
        }}
      >
        <span style={styles.textIndicator}>T</span>
        <span style={styles.textValue}>"{text}"</span>
      </div>
    )
  }

  if (node.type === 'expression') {
    const nodeExpr = node.expression ?? ''
    const expr = nodeExpr.length > 30 ? nodeExpr.slice(0, 30) + '...' : nodeExpr
    return (
      <div
        style={{
          ...styles.node,
          ...(isSelected ? styles.selected : {}),
          paddingLeft: indent + 8,
        }}
      >
        <span style={styles.exprIndicator}>{'{ }'}</span>
        <span style={styles.exprValue}>{expr}</span>
      </div>
    )
  }

  // Element node
  const propCount = Object.keys(node.props ?? {}).length
  const childCount = (node.children ?? []).length

  return (
    <div style={styles.nodeGroup}>
      <div
        style={{
          ...styles.node,
          ...(isSelected ? styles.selected : {}),
          paddingLeft: indent + 8,
        }}
      >
        <span style={styles.tagName}>&lt;{node.tagName}&gt;</span>
        {propCount > 0 && (
          <span style={styles.propCount}>{propCount} props</span>
        )}
        {childCount > 0 && (
          <span style={styles.childCount}>{childCount} children</span>
        )}
      </div>
      {(node.children ?? []).map((child, index) => (
        <AstNode
          key={child.id}
          node={child}
          path={[...path, 'children', index]}
          selectedPath={selectedPath}
          depth={depth + 1}
        />
      ))}
    </div>
  )
}

function pathEquals(a: NodePath, b: NodePath): boolean {
  if (a.length !== b.length) return false
  return a.every((segment, i) => segment === b[i])
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontSize: '12px',
  },
  empty: {
    color: '#666',
    fontSize: '13px',
    fontStyle: 'italic',
  },
  nodeGroup: {
    display: 'flex',
    flexDirection: 'column',
  },
  node: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 8px',
    borderRadius: '4px',
    cursor: 'pointer',
  },
  selected: {
    backgroundColor: '#2a3a4a',
    border: '1px solid #4a6a8a',
  },
  tagName: {
    color: '#7eb3ff',
    fontWeight: 500,
  },
  propCount: {
    color: '#888',
    fontSize: '11px',
  },
  childCount: {
    color: '#666',
    fontSize: '11px',
  },
  textIndicator: {
    color: '#888',
    fontSize: '10px',
    padding: '1px 4px',
    backgroundColor: '#333',
    borderRadius: '2px',
  },
  textValue: {
    color: '#a5d6a7',
  },
  exprIndicator: {
    color: '#ffb74d',
    fontSize: '10px',
  },
  exprValue: {
    color: '#ffb74d',
  },
}
