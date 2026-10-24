import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173
  },
  preview: {
    host: '0.0.0.0',
    allowedHosts: true
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1200
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts']
  }
})
