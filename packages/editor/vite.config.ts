import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  root: resolve(__dirname, 'demo'),
  resolve: {
    alias: {
      '@hands/editor': resolve(__dirname, 'src'),
    },
  },
  define: {
    // Webpack shims for react-server-dom-webpack
    // These allow the Flight client to work in a Vite environment
    __webpack_require__: 'globalThis.__webpack_require__',
  },
  server: {
    port: 5173,
  },
  optimizeDeps: {
    include: [
      '@codemirror/lang-javascript',
      '@uiw/react-codemirror',
      'react-server-dom-webpack/client',
    ],
  },
})
