import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/main'
    },
    resolve: {
      alias: {
        '@shared': path.join(__dirname, 'electron/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      outDir: 'dist/preload'
    },
    resolve: {
      alias: {
        '@shared': path.join(__dirname, 'electron/shared')
      }
    }
  },
  renderer: {
    root: 'electron/renderer',
    plugins: [react()],
    build: {
      outDir: 'dist/renderer',
      emptyOutDir: true
    },
    resolve: {
      alias: {
        '@renderer': path.join(__dirname, 'electron/renderer/src'),
        '@shared': path.join(__dirname, 'electron/shared')
      }
    }
  }
})

