import React, { useState, useCallback, useRef, useEffect } from 'react'
import { useEditor, type Mutation, PlateVisualEditor } from '../src'
import { useRsc } from '../src/rsc'
import { simpleBlockSource, cardBlockSource, dataBlockSource, chartBlockSource } from './fixtures/simple-block'
import { CodeEditor } from './components/CodeEditor'
import { OplogView } from './components/OplogView'
import { PropsInspector } from './components/PropsInspector'
import { cn } from './lib/utils'

const FIXTURES = {
  simple: { label: 'Simple Block', source: simpleBlockSource },
  card: { label: 'Card Block', source: cardBlockSource },
  data: { label: 'Data Block', source: dataBlockSource },
  chart: { label: 'Chart Block', source: chartBlockSource },
}

export function App() {
  const [fixture, setFixture] = useState<keyof typeof FIXTURES>('simple')
  const editor = useEditor(FIXTURES[fixture].source)
  const { init, ready } = useRsc()

  // Initialize RSC on mount
  useEffect(() => {
    init().then((success) => {
      console.log('[App] RSC context initialized:', success)
    })
  }, [init])

  const sourceRef = useRef<'plate' | 'code' | null>(null)

  const handleFixtureChange = useCallback((newFixture: keyof typeof FIXTURES) => {
    setFixture(newFixture)
    editor.setSource(FIXTURES[newFixture].source)
  }, [editor])

  const handleMutation = useCallback((mutation: Mutation) => {
    editor.applyMutation(mutation)
  }, [editor])

  const handleSelect = useCallback((path: (string | number)[] | null) => {
    editor.setSelected(path)
  }, [editor])

  const handlePlateSourceChange = useCallback((newSource: string) => {
    if (sourceRef.current === 'code') return
    sourceRef.current = 'plate'
    editor.setSource(newSource)
    setTimeout(() => { sourceRef.current = null }, 0)
  }, [editor])

  const handleCodeSourceChange = useCallback((newSource: string) => {
    if (sourceRef.current === 'plate') return
    sourceRef.current = 'code'
    editor.setSource(newSource)
    setTimeout(() => { sourceRef.current = null }, 0)
  }, [editor])

  return (
    <div className="dark flex h-screen bg-background text-foreground">
      {/* Sidebar */}
      <aside className="w-56 flex-shrink-0 border-r border-border bg-card flex flex-col">
        {/* Logo */}
        <div className="h-14 flex items-center px-4 border-b border-border">
          <h1 className="text-lg font-semibold">Hands Editor</h1>
        </div>

        {/* Fixtures Nav */}
        <nav className="flex-1 p-2 space-y-1">
          <div className="px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Fixtures
          </div>
          {(Object.keys(FIXTURES) as Array<keyof typeof FIXTURES>).map((key) => (
            <button
              key={key}
              onClick={() => handleFixtureChange(key)}
              className={cn(
                'w-full text-left px-3 py-2 rounded-md text-sm transition-colors',
                fixture === key
                  ? 'bg-accent text-accent-foreground font-medium'
                  : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground'
              )}
            >
              {FIXTURES[key].label}
            </button>
          ))}
        </nav>

        {/* History Controls */}
        <div className="p-3 border-t border-border space-y-2">
          <div className="px-2 py-1 text-xs font-medium text-muted-foreground uppercase tracking-wider">
            History
          </div>
          <div className="flex gap-1">
            <button
              onClick={editor.undo}
              disabled={!editor.canUndo}
              className={cn(
                'flex-1 px-3 py-1.5 rounded-md text-sm border border-border bg-secondary transition-colors',
                editor.canUndo
                  ? 'hover:bg-accent text-foreground'
                  : 'opacity-50 cursor-not-allowed text-muted-foreground'
              )}
            >
              ↶ Undo
            </button>
            <button
              onClick={editor.redo}
              disabled={!editor.canRedo}
              className={cn(
                'flex-1 px-3 py-1.5 rounded-md text-sm border border-border bg-secondary transition-colors',
                editor.canRedo
                  ? 'hover:bg-accent text-foreground'
                  : 'opacity-50 cursor-not-allowed text-muted-foreground'
              )}
            >
              ↷ Redo
            </button>
          </div>
          <button
            onClick={editor.clearHistory}
            className="w-full px-3 py-1.5 rounded-md text-sm border border-border bg-secondary hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            Clear History
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Error Banner */}
        {editor.state.error && (
          <div className="flex items-center justify-between px-4 py-2 bg-destructive/20 border-b border-destructive/30 text-destructive-foreground">
            <span className="text-sm">Error: {editor.state.error}</span>
            <button
              onClick={editor.clearError}
              className="text-sm hover:underline"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Panels */}
        <div className="flex-1 grid grid-cols-[1fr_1fr_380px] divide-x divide-border overflow-hidden">
          {/* Visual Editor Panel */}
          <div className="flex flex-col overflow-hidden">
            <PanelHeader title="Visual Editor" badge="Plate" />
            <div className="flex-1 overflow-hidden bg-background">
              <PlateVisualEditor
                source={editor.state.source}
                onSourceChange={handlePlateSourceChange}
              />
            </div>
          </div>

          {/* Code Editor Panel */}
          <div className="flex flex-col overflow-hidden">
            <PanelHeader title="Source Code" badge="TypeScript" />
            <div className="flex-1 overflow-hidden">
              <CodeEditor
                source={editor.state.source}
                onChange={handleCodeSourceChange}
              />
            </div>
          </div>

          {/* Right Panel: Inspector + Oplog */}
          <div className="flex flex-col overflow-hidden divide-y divide-border">
            {/* Props Inspector */}
            <div className="flex-1 flex flex-col overflow-hidden">
              <PanelHeader title="Props Inspector" />
              <div className="flex-1 overflow-auto p-3">
                <PropsInspector
                  ast={editor.state.ast}
                  selectedPath={editor.state.selectedPath}
                  onMutation={handleMutation}
                />
              </div>
            </div>

            {/* Oplog */}
            <div className="h-52 flex-shrink-0 flex flex-col">
              <PanelHeader
                title="Oplog"
                badge={`${editor.state.oplog.cursor} / ${editor.state.oplog.entries.length}`}
              />
              <div className="flex-1 overflow-auto p-3">
                <OplogView oplog={editor.state.oplog} />
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}

function PanelHeader({ title, badge }: { title: string; badge?: string }) {
  return (
    <div className="h-10 flex items-center justify-between px-3 border-b border-border bg-card flex-shrink-0">
      <h2 className="text-sm font-medium text-muted-foreground">{title}</h2>
      {badge && (
        <span className="text-xs px-2 py-0.5 rounded bg-secondary text-muted-foreground">
          {badge}
        </span>
      )}
    </div>
  )
}
