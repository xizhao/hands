import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useEditor, type Mutation } from '../src'
import { simpleBlockSource, cardBlockSource, dataBlockSource } from './fixtures/simple-block'
import { PlateVisualEditor } from './plate/PlateVisualEditor'
import { CodeEditor } from './components/CodeEditor'
import { OplogView } from './components/OplogView'
import { PropsInspector } from './components/PropsInspector'

const FIXTURES = {
  simple: simpleBlockSource,
  card: cardBlockSource,
  data: dataBlockSource,
}

export function App() {
  const [fixture, setFixture] = useState<keyof typeof FIXTURES>('simple')
  const editor = useEditor(FIXTURES[fixture])

  // Track which side initiated the change to prevent loops
  const sourceRef = useRef<'plate' | 'code' | null>(null)

  const handleFixtureChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newFixture = e.target.value as keyof typeof FIXTURES
    setFixture(newFixture)
    editor.setSource(FIXTURES[newFixture])
  }, [editor])

  // Handle mutations from props inspector
  const handleMutation = useCallback((mutation: Mutation) => {
    editor.applyMutation(mutation)
  }, [editor])

  // Handle selection
  const handleSelect = useCallback((path: (string | number)[] | null) => {
    editor.setSelected(path)
  }, [editor])

  // Handle source change from Plate editor
  const handlePlateSourceChange = useCallback((newSource: string) => {
    if (sourceRef.current === 'code') return
    sourceRef.current = 'plate'
    editor.setSource(newSource)
    // Reset after a tick
    setTimeout(() => { sourceRef.current = null }, 0)
  }, [editor])

  // Handle source change from code editor
  const handleCodeSourceChange = useCallback((newSource: string) => {
    if (sourceRef.current === 'plate') return
    sourceRef.current = 'code'
    editor.setSource(newSource)
    // Reset after a tick
    setTimeout(() => { sourceRef.current = null }, 0)
  }, [editor])

  return (
    <div style={styles.container}>
      {/* Header */}
      <header style={styles.header}>
        <h1 style={styles.title}>Oplog WYSIWYG Editor</h1>
        <div style={styles.controls}>
          <select
            value={fixture}
            onChange={handleFixtureChange}
            style={styles.select}
          >
            <option value="simple">Simple Block</option>
            <option value="card">Card Block</option>
            <option value="data">Data Block</option>
          </select>

          <div style={styles.buttonGroup}>
            <button
              onClick={editor.undo}
              disabled={!editor.canUndo}
              style={{
                ...styles.button,
                opacity: editor.canUndo ? 1 : 0.5,
              }}
            >
              ⟲ Undo
            </button>
            <button
              onClick={editor.redo}
              disabled={!editor.canRedo}
              style={{
                ...styles.button,
                opacity: editor.canRedo ? 1 : 0.5,
              }}
            >
              ⟳ Redo
            </button>
            <button onClick={editor.clearHistory} style={styles.button}>
              ✕ Clear
            </button>
          </div>
        </div>
      </header>

      {/* Error display */}
      {editor.state.error && (
        <div style={styles.error}>
          Error: {editor.state.error}
          <button onClick={editor.clearError} style={styles.dismissButton}>
            ✕
          </button>
        </div>
      )}

      {/* Main content - 3 columns */}
      <div style={styles.main}>
        {/* Left: Plate Visual Editor */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Visual Editor</h2>
            <span style={styles.badge}>Plate • real components</span>
          </div>
          <div style={styles.canvasContainer}>
            <PlateVisualEditor
              source={editor.state.source}
              onSourceChange={handlePlateSourceChange}
            />
          </div>
        </div>

        {/* Middle: Code Editor (now editable) */}
        <div style={styles.panel}>
          <div style={styles.panelHeader}>
            <h2 style={styles.panelTitle}>Source Code</h2>
            <span style={styles.badge}>editable • bidirectional sync</span>
          </div>
          <div style={styles.codeContainer}>
            <CodeEditor
              source={editor.state.source}
              onChange={handleCodeSourceChange}
            />
          </div>
        </div>

        {/* Right: Props Inspector + Oplog */}
        <div style={styles.panel}>
          <div style={styles.splitPanel}>
            {/* Props Inspector */}
            <div style={styles.inspectorSection}>
              <div style={styles.panelHeader}>
                <h2 style={styles.panelTitle}>Props Inspector</h2>
              </div>
              <div style={styles.inspectorContent}>
                <PropsInspector
                  ast={editor.state.ast}
                  selectedPath={editor.state.selectedPath}
                  onMutation={handleMutation}
                />
              </div>
            </div>

            {/* Oplog */}
            <div style={styles.oplogSection}>
              <div style={styles.panelHeader}>
                <h2 style={styles.panelTitle}>Oplog</h2>
                <span style={styles.badge}>
                  {editor.state.oplog.cursor} / {editor.state.oplog.entries.length}
                </span>
              </div>
              <div style={styles.oplogContent}>
                <OplogView oplog={editor.state.oplog} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    flexDirection: 'column',
    height: '100vh',
    backgroundColor: '#1a1a1a',
    color: '#e0e0e0',
  },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '12px 16px',
    borderBottom: '1px solid #333',
    backgroundColor: '#252525',
    flexShrink: 0,
  },
  title: {
    margin: 0,
    fontSize: '18px',
    fontWeight: 600,
  },
  controls: {
    display: 'flex',
    gap: '16px',
    alignItems: 'center',
  },
  select: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #444',
    backgroundColor: '#2a2a2a',
    color: '#e0e0e0',
    fontSize: '14px',
  },
  buttonGroup: {
    display: 'flex',
    gap: '4px',
  },
  button: {
    padding: '6px 12px',
    borderRadius: '4px',
    border: '1px solid #444',
    backgroundColor: '#2a2a2a',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '14px',
    transition: 'all 0.15s ease',
  },
  error: {
    padding: '8px 16px',
    backgroundColor: '#4a1515',
    borderBottom: '1px solid #6a2525',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexShrink: 0,
  },
  dismissButton: {
    background: 'none',
    border: 'none',
    color: '#e0e0e0',
    cursor: 'pointer',
    fontSize: '16px',
  },
  main: {
    flex: 1,
    display: 'grid',
    gridTemplateColumns: '1fr 1fr 350px',
    gap: '1px',
    backgroundColor: '#333',
    overflow: 'hidden',
  },
  panel: {
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: '#1a1a1a',
    overflow: 'hidden',
  },
  splitPanel: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
  },
  panelHeader: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '8px 12px',
    borderBottom: '1px solid #333',
    backgroundColor: '#222',
    flexShrink: 0,
  },
  panelTitle: {
    margin: 0,
    fontSize: '14px',
    fontWeight: 500,
    color: '#888',
  },
  badge: {
    fontSize: '11px',
    padding: '2px 6px',
    borderRadius: '4px',
    backgroundColor: '#333',
    color: '#888',
  },
  canvasContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  codeContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  inspectorSection: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderBottom: '1px solid #333',
  },
  inspectorContent: {
    flex: 1,
    overflow: 'auto',
  },
  oplogSection: {
    height: '200px',
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
  },
  oplogContent: {
    flex: 1,
    overflow: 'auto',
    padding: '12px',
  },
}
