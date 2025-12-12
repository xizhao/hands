/**
 * Sandbox Entry Point
 *
 * Reads blockId and runtimePort from URL params.
 * Fetches block source from runtime, saves on changes.
 */

import { StrictMode, useEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { PlateVisualEditor } from '../plate/PlateVisualEditor'
import { RscProvider, setRuntimePort } from '../rsc'

import '../../demo/index.css'

const params = new URLSearchParams(window.location.search)
const blockId = params.get('blockId')
const runtimePort = params.get('runtimePort')
const readOnly = params.get('readOnly') === 'true'

// Add sandbox class for transparent background
document.body.classList.add('sandbox')

function SandboxApp() {
  const [source, setSource] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Fetch block source on mount
  useEffect(() => {
    if (!blockId || !runtimePort) {
      setError('Missing blockId or runtimePort in URL params')
      return
    }

    setRuntimePort(parseInt(runtimePort, 10))

    fetch(`http://localhost:${runtimePort}/workbook/blocks/${blockId}/source`)
      .then(res => res.ok ? res.json() : res.json().then(d => Promise.reject(d.error)))
      .then(data => setSource(data.source))
      .catch(err => setError(String(err)))
  }, [])

  const handleSourceChange = (newSource: string) => {
    setSource(newSource)
    if (readOnly || !blockId || !runtimePort) return

    fetch(`http://localhost:${runtimePort}/workbook/blocks/${blockId}/source`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: newSource }),
    }).catch(console.error)
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen text-red-500">
        <p>{error}</p>
      </div>
    )
  }

  if (source === null) {
    return (
      <div className="flex items-center justify-center h-screen text-gray-500">
        Loading...
      </div>
    )
  }

  return (
    <RscProvider port={parseInt(runtimePort!, 10)} enabled={!!runtimePort}>
      <PlateVisualEditor
        source={source}
        onSourceChange={handleSourceChange}
        className="h-screen"
      />
    </RscProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <SandboxApp />
  </StrictMode>
)
