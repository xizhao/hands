/**
 * Sandbox Entry Point
 *
 * This file is the entry point for the sandboxed editor iframe.
 * It sets up React and renders the SandboxEditor component.
 */

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { SandboxEditor } from './SandboxEditor'

// Import styles from demo (reuse existing styles)
import '../../demo/index.css'

const root = document.getElementById('root')
if (!root) {
  throw new Error('Root element not found')
}

createRoot(root).render(
  <StrictMode>
    <SandboxEditor />
  </StrictMode>
)
