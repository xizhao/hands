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
  server: {
    port: 5173,
  },
  optimizeDeps: {
    include: ['@codemirror/lang-javascript', '@uiw/react-codemirror'],
  },
})
