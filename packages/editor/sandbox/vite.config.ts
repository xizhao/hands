import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from 'tailwindcss';
import autoprefixer from 'autoprefixer';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: __dirname,
  resolve: {
    // Prefer 'worker' condition for packages like decode-named-character-reference
    conditions: ['worker', 'import', 'module', 'browser', 'default'],
    alias: {
      '@hands/editor': path.resolve(__dirname, '../src'),
    },
  },
  worker: {
    format: 'es',
    rollupOptions: {
      output: {
        inlineDynamicImports: true,
      },
    },
  },
  // Override resolve conditions to prefer 'worker' over 'browser'
  // This prevents decode-named-character-reference from using its DOM version in workers
  optimizeDeps: {
    esbuildOptions: {
      conditions: ['worker', 'module', 'import', 'default'],
    },
  },
  css: {
    postcss: {
      plugins: [
        tailwindcss({ config: path.resolve(__dirname, 'tailwind.config.js') }),
        autoprefixer(),
      ],
    },
  },
  server: {
    port: 5180,
  },
});
