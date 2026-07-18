import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts', 'scripts/**/*.test.ts'],
    // Keep adapters on mock in CI/tests even if .env.local enables real.
    env: {
      VITE_EMAIL_ADAPTER: 'mock',
      VITE_MAPS_ADAPTER: 'mock',
      VITE_ADSB_ADAPTER: 'mock',
      VITE_LLM_ADAPTER: 'mock',
      VITE_COMMS_ADAPTER: 'mock',
      VITE_QB_ADAPTER: 'mock',
    },
  },
})
