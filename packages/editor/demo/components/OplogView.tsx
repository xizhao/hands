import React from 'react'
import type { Oplog, Mutation } from '../../src'

interface OplogViewProps {
  oplog: Oplog
}

export function OplogView({ oplog }: OplogViewProps) {
  const { entries, cursor } = oplog

  if (entries.length === 0) {
    return (
      <div style={styles.empty}>
        No mutations yet. Try clicking "Test: Set Prop" or "Test: Insert".
      </div>
    )
  }

  return (
    <div style={styles.container}>
      {entries.map((entry, index) => {
        const isCurrent = index === cursor - 1
        const isFuture = index >= cursor

        return (
          <div
            key={entry.id}
            style={{
              ...styles.entry,
              ...(isCurrent ? styles.current : {}),
              ...(isFuture ? styles.future : {}),
            }}
          >
            <span style={styles.indicator}>
              {isCurrent ? '●' : isFuture ? '○' : '▸'}
            </span>
            <span style={styles.type}>{entry.mutation.type}</span>
            <span style={styles.details}>{getMutationDetails(entry.mutation)}</span>
          </div>
        )
      })}
    </div>
  )
}

function getMutationDetails(mutation: Mutation): string {
  switch (mutation.type) {
    case 'set-prop':
      return `${mutation.prop} @ [${mutation.path.join(', ')}]`
    case 'delete-prop':
      return `${mutation.prop} @ [${mutation.path.join(', ')}]`
    case 'insert-node':
      return `${mutation.node.type === 'element' ? mutation.node.tagName : 'text'} @ [${mutation.path.join(', ')}][${mutation.index}]`
    case 'delete-node':
      return `@ [${mutation.path.join(', ')}]`
    case 'move-node':
      return `[${mutation.fromPath.join(', ')}] → [${mutation.toPath.join(', ')}]`
    case 'set-text':
      return `"${mutation.text.slice(0, 20)}${mutation.text.length > 20 ? '...' : ''}" @ [${mutation.path.join(', ')}]`
    case 'wrap-node':
      return `with ${mutation.wrapper.type === 'element' ? mutation.wrapper.tagName : 'text'} @ [${mutation.path.join(', ')}]`
    case 'unwrap-node':
      return `@ [${mutation.path.join(', ')}]`
    default:
      return ''
  }
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  empty: {
    color: '#666',
    fontSize: '13px',
    fontStyle: 'italic',
  },
  entry: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 8px',
    borderRadius: '4px',
    fontSize: '12px',
    backgroundColor: '#252525',
  },
  current: {
    backgroundColor: '#2a3a2a',
    border: '1px solid #4a6a4a',
  },
  future: {
    opacity: 0.5,
  },
  indicator: {
    color: '#888',
    width: '12px',
    textAlign: 'center',
  },
  type: {
    color: '#7eb3ff',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontWeight: 500,
  },
  details: {
    color: '#888',
    fontFamily: 'ui-monospace, SFMono-Regular, monospace',
    fontSize: '11px',
  },
}
