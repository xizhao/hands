import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'demo'),
  build: {
    target: 'esnext', // Support top-level await
  },
  esbuild: {
    target: 'esnext', // Support top-level await in dev
  },
  resolve: {
    alias: {
      '@hands/editor': resolve(__dirname, 'src'),
      // Use WASM entry for oxc-parser in browser
      'oxc-parser': resolve(__dirname, '../../node_modules/.bun/oxc-parser@0.102.0/node_modules/oxc-parser/src-js/wasm.js'),
      // Resolve WASM binding (manually installed since bun prefers native)
      '@oxc-parser/binding-wasm32-wasi': resolve(__dirname, '../../node_modules/@oxc-parser+binding-wasm32-wasi'),
    },
  },
  define: {
    // Webpack shims for react-server-dom-webpack
    // These allow the Flight client to work in a Vite environment
    __webpack_require__: 'globalThis.__webpack_require__',
  },
  server: {
    port: 5166, // Use 5166 to avoid conflicts with main app
  },
  optimizeDeps: {
    include: [
      '@codemirror/lang-javascript',
      '@uiw/react-codemirror',
      'react-server-dom-webpack/client',
    ],
    // Exclude oxc-parser from optimization - WASM needs top-level await
    exclude: ['oxc-parser', '@oxc-parser/binding-wasm32-wasi'],
    esbuildOptions: {
      target: 'esnext',
    },
  },
})
