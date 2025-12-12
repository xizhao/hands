/**
 * Sandbox Entry Point - RSC-First Block Editor
 *
 * Uses the new RSC-first editor architecture:
 * - RSC renders the live block output
 * - Edit overlay provides selection and interaction
 * - No Plate - direct AST ↔ DOM mapping
 */

// MUST BE FIRST: Initialize shared React for RSC client components
import '../rsc/shared-react'

import { StrictMode, useEffect, useState, useCallback } from 'react'
import { createRoot } from 'react-dom/client'
import { RscProvider, initFlightClient, setRuntimePort } from '../rsc'
import { OverlayEditor } from '../overlay'

import './styles.css'

const params = new URLSearchParams(window.location.search)
const blockId = params.get('blockId')
// runtimePort is the main API port (55100) for /workbook/* endpoints
const runtimePort = params.get('runtimePort')
const runtimePortNum = runtimePort ? parseInt(runtimePort, 10) : null
// workerPort is the Vite worker port (55200+) for RSC /blocks/* endpoints
const workerPort = params.get('workerPort')
const workerPortNum = workerPort ? parseInt(workerPort, 10) : runtimePortNum
const readOnly = params.get('readOnly') === 'true'

// Listen for styles from parent
window.addEventListener('message', (e) => {
  if (e.data?.type === 'styles') {
    let style = document.getElementById('parent-styles') as HTMLStyleElement
    if (!style) {
      style = document.createElement('style')
      style.id = 'parent-styles'
      document.head.appendChild(style)
    }
    style.textContent = e.data.css

    if (e.data.css.includes('color-scheme:dark')) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }
})

// Tell parent we're ready
window.parent.postMessage({ type: 'sandbox-ready' }, '*')

// Set runtime port for RSC client module loading (vite-proxy is on main runtime port)
if (runtimePortNum) {
  setRuntimePort(runtimePortNum)
}

function SandboxApp() {
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [rscReady, setRscReady] = useState(false)

  // Initialize RSC Flight client
  useEffect(() => {
    initFlightClient().then((success) => {
      console.log('[Sandbox] RSC initialized:', success)
      setRscReady(success)
    })
  }, [])

  // Fetch block source
  useEffect(() => {
    if (!blockId || !runtimePortNum) {
      setError('Missing blockId or runtimePort')
      return
    }

    fetch(`http://localhost:${runtimePortNum}/workbook/blocks/${blockId}/source`)
      .then(res => res.ok ? res.json() : Promise.reject('Failed to load'))
      .then(data => setSource(data.source))
      .catch(err => setError(String(err)))
  }, [])

  // Save source changes
  const handleSave = useCallback((newSource: string) => {
    if (readOnly || !blockId || !runtimePortNum) return

    fetch(`http://localhost:${runtimePortNum}/workbook/blocks/${blockId}/source`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: newSource }),
    }).catch(console.error)
  }, [])

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        {error}
      </div>
    )
  }

  if (!rscReady || source === null) {
    return (
      <div className="flex items-center justify-center h-screen text-muted-foreground">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-muted-foreground/30 border-t-muted-foreground rounded-full animate-spin" />
          <span className="text-sm">Loading...</span>
        </div>
      </div>
    )
  }

  return (
    <RscProvider port={workerPortNum!} enabled>
      <OverlayEditor
        blockId={blockId!}
        initialSource={source}
        runtimePort={runtimePortNum!}
        workerPort={workerPortNum!}
        readOnly={readOnly}
      />
    </RscProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SandboxApp />
  </StrictMode>
)
