/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The Python backend (python -m shinobi.server). In development Vite forwards these paths to it,
// so the app always talks to its own origin (same URLs in development and in the built app).
const BACKEND = process.env.SHINOBI_BACKEND ?? 'http://127.0.0.1:8000'

export default defineConfig({
  plugins: [react()],
  // separate caches let two dev servers run side by side (VITE_CACHE_DIR=node_modules/.vite-x)
  cacheDir: process.env.VITE_CACHE_DIR ?? 'node_modules/.vite',
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': BACKEND,
      '/references': BACKEND,
      '/audio': BACKEND,
      '/ws': { target: BACKEND, ws: true },
    },
  },
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    environment: 'node',
  },
})
