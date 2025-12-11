import React from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { javascript } from '@codemirror/lang-javascript'
import { oneDark } from '@codemirror/theme-one-dark'

interface CodeEditorProps {
  source: string
  onChange?: (source: string) => void
  readOnly?: boolean
}

export function CodeEditor({ source, onChange, readOnly = false }: CodeEditorProps) {
  return (
    <CodeMirror
      value={source}
      height="100%"
      theme={oneDark}
      extensions={[javascript({ jsx: true, typescript: true })]}
      onChange={onChange}
      readOnly={readOnly}
      basicSetup={{
        lineNumbers: true,
        highlightActiveLineGutter: true,
        highlightActiveLine: true,
        foldGutter: true,
        autocompletion: false,
      }}
      style={{
        height: '100%',
        fontSize: '13px',
      }}
    />
  )
}
