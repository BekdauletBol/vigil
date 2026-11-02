/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API = process.env.VITE_API_PROXY ?? 'http://localhost:8000'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/v1/ws': { target: API.replace(/^http/, 'ws'), ws: true },
      '/api': { target: API, changeOrigin: true },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    coverage: { reporter: ['text', 'lcov'], include: ['src/**/*.{ts,tsx}'] },
  },
})
