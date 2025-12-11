import React from 'react'
import ReactDOM from 'react-dom/client'
import { App } from './App'
import { RscProvider, initFlightClient } from '../src/rsc'
import './index.css'

// Initialize Flight client on startup
initFlightClient().then((success) => {
  console.log('[rsc] Flight client initialized:', success)
})

// RSC port configuration
// Default: 55000 (Runtime API, which proxies to Vite worker at 55200)
// The runtime handles the /rsc/* routes and forwards them to the Vite worker
//
// To start the runtime:
//   cd packages/runtime && bun run dev -- --workbook-id=demo --workbook-dir=<path>
//
// URL params:
//   ?rscPort=55000 - Connect to runtime (default)
//   ?rscPort=55200 - Connect directly to Vite worker (for debugging)
//   ?rsc=false     - Disable RSC entirely
const params = new URLSearchParams(window.location.search)
const rscPort = parseInt(params.get('rscPort') || '55000', 10)
const rscEnabled = params.get('rsc') !== 'false'

console.log(`[demo] RSC port: ${rscPort}, enabled: ${rscEnabled}`)

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RscProvider port={rscPort} enabled={rscEnabled}>
      <App />
    </RscProvider>
  </React.StrictMode>
)
