/**
 * Vite config for the EditorSandbox entry point
 *
 * Build: vite build --config vite.sandbox.config.ts
 * Dev:   vite --config vite.sandbox.config.ts
 *
 * Outputs to ../desktop/dist/editor/ for Tauri to serve
 */

import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  base: '/editor/', // Served from /editor/ path in desktop
  build: {
    target: 'esnext',
    outDir: resolve(__dirname, '../desktop/dist/editor'),
    emptyDirOnBuild: true,
    rollupOptions: {
      input: {
        sandbox: resolve(__dirname, 'sandbox.html'),
      },
    },
  },
  esbuild: {
    target: 'esnext',
  },
  resolve: {
    alias: {
      '@hands/editor': resolve(__dirname, 'src'),
      'oxc-parser': resolve(__dirname, '../../node_modules/.bun/oxc-parser@0.102.0/node_modules/oxc-parser/src-js/wasm.js'),
      '@oxc-parser/binding-wasm32-wasi': resolve(__dirname, '../../node_modules/@oxc-parser+binding-wasm32-wasi'),
    },
  },
  server: {
    port: 5167, // Different port from demo (5166)
    cors: true,
    headers: {
      'Access-Control-Allow-Origin': '*',
    },
  },
  optimizeDeps: {
    include: [
      '@codemirror/lang-javascript',
      '@uiw/react-codemirror',
    ],
    exclude: ['oxc-parser', '@oxc-parser/binding-wasm32-wasi'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
})
