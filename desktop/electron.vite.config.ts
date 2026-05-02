import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import fs from 'node:fs'

function copyMainAssets() {
  return {
    name: 'copy-main-assets',
    closeBundle() {
      const src = path.join(__dirname, 'electron/main/db/schema.sql')
      const dst = path.join(__dirname, 'dist/main/schema.sql')
      fs.mkdirSync(path.dirname(dst), { recursive: true })
      fs.copyFileSync(src, dst)
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin(), copyMainAssets()],
    build: {
      outDir: 'dist/main',
      rollupOptions: {
        input: path.join(__dirname, 'electron/main/index.ts')
      }
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
      outDir: 'dist/preload',
      rollupOptions: {
        input: path.join(__dirname, 'electron/preload/index.ts')
      }
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
      emptyOutDir: true,
      rollupOptions: {
        input: path.join(__dirname, 'electron/renderer/index.html')
      }
    },
    resolve: {
      alias: {
        '@renderer': path.join(__dirname, 'electron/renderer/src'),
        '@shared': path.join(__dirname, 'electron/shared')
      }
    }
  }
})
