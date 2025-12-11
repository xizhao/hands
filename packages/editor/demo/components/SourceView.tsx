import React from 'react'

interface SourceViewProps {
  source: string
}

export function SourceView({ source }: SourceViewProps) {
  return (
    <pre style={styles.pre}>
      <code style={styles.code}>{source}</code>
    </pre>
  )
}

const styles: Record<string, React.CSSProperties> = {
  pre: {
    margin: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Monaco, Consolas, monospace',
    fontSize: '13px',
    lineHeight: '1.5',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  code: {
    color: '#e0e0e0',
  },
}
