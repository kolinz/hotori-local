import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  root: 'renderer',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'renderer/src'),
    },
  },
  build: {
    outDir: '../dist',
    emptyOutDir: true,
  },
  server: {
    port: 5173,
  },
  base: './',
})
