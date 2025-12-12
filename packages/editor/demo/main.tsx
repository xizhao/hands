import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { RscProvider, initFlightClient } from '../src/rsc'
import './index.css'

// Import the shared React module to ensure window.__HANDS_REACT__ is initialized.
// The import map in index.html redirects all React imports to this module,
// ensuring both editor and runtime client components use the same React instance.
import './shared-react'

console.log('[editor] React singleton initialized via shared-react.ts')

// Initialize Flight client on startup
initFlightClient().then((success) => {
  console.log('[rsc] Flight client initialized:', success)
})

// RSC port configuration
// Default: 56600 (Reserved port for editor demo, avoids main app conflicts)
// The runtime handles the /rsc/* routes and forwards them to the Vite worker
//
// To start the runtime:
//   cd packages/runtime && bun run dev -- --workbook-id=demo --workbook-dir=<path> --port=56600
//
// URL params:
//   ?rscPort=56600 - Connect to runtime (default)
//   ?rsc=false     - Disable RSC entirely
const params = new URLSearchParams(window.location.search)
const rscPort = parseInt(params.get('rscPort') || '56600', 10)
const rscEnabled = params.get('rsc') !== 'false'

console.log(`[demo] RSC port: ${rscPort}, enabled: ${rscEnabled}`)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RscProvider port={rscPort} enabled={rscEnabled}>
      <App />
    </RscProvider>
  </React.StrictMode>
)
