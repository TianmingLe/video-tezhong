import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ipcChannels } from '@shared/ipc'
import { PythonProcessManager } from './process/PythonProcessManager'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

let mainWindow: BrowserWindow | null = null
const processManager = new PythonProcessManager({ pythonBin: 'python3', maxLogLines: 1000 })

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  const rendererUrl = process.env.ELECTRON_RENDERER_URL
  if (rendererUrl) {
    mainWindow.loadURL(rendererUrl)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  processManager.onLog((ev) => {
    mainWindow?.webContents.send(ipcChannels.jobLog, ev)
  })
  processManager.onExit((ev) => {
    mainWindow?.webContents.send(ipcChannels.jobStatus, { status: 'exited', ...ev })
  })
  processManager.onStart((ev) => {
    mainWindow?.webContents.send(ipcChannels.jobStatus, { runId: ev.runId, status: 'started', pid: ev.pid })
  })
  processManager.onError((ev) => {
    mainWindow?.webContents.send(ipcChannels.jobStatus, { runId: ev.runId, status: 'error', error: ev.error })
  })

  ipcMain.handle(ipcChannels.jobStart, async (_evt, cfg) => {
    const res = await processManager.start(cfg)
    return res
  })

  ipcMain.handle(ipcChannels.jobCancel, async (_evt, runId: string) => {
    await processManager.kill(runId)
    return { success: true }
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
