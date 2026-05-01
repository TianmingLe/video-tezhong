import { app, BrowserWindow, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ipcChannels } from '@shared/ipc'
import { PythonProcessManager } from './process/PythonProcessManager'
import { WindowController } from './window/WindowController'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const processManager = new PythonProcessManager({ pythonBin: 'python3', maxLogLines: 1000 })

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
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
    win.loadURL(rendererUrl)
  } else {
    win.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  return win
}

const windowController = new WindowController({
  createWindow: createMainWindow,
  onWindowVisibilityChange: () => {}
})

app.whenReady().then(() => {
  processManager.onLog((ev) => {
    windowController.getWindow()?.webContents.send(ipcChannels.jobLog, ev)
  })
  processManager.onExit((ev) => {
    windowController.getWindow()?.webContents.send(ipcChannels.jobStatus, { status: 'exited', ...ev })
  })
  processManager.onStart((ev) => {
    windowController.getWindow()?.webContents.send(ipcChannels.jobStatus, {
      runId: ev.runId,
      status: 'started',
      pid: ev.pid
    })
  })
  processManager.onError((ev) => {
    windowController.getWindow()?.webContents.send(ipcChannels.jobStatus, {
      runId: ev.runId,
      status: 'error',
      error: ev.error
    })
  })

  ipcMain.handle(ipcChannels.jobStart, async (_evt, cfg) => {
    const res = await processManager.start(cfg)
    return res
  })

  ipcMain.handle(ipcChannels.jobCancel, async (_evt, runId: string) => {
    await processManager.kill(runId)
    return { success: true }
  })

  ipcMain.handle(ipcChannels.jobExportLog, async (_evt, runId: string) => {
    const logs = processManager.getLogs(runId).join('\n') + '\n'
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出日志',
      defaultPath: `${runId}.log`,
      filters: [{ name: 'Log', extensions: ['log', 'txt'] }]
    })
    if (canceled || !filePath) return { success: false, error: 'cancelled' }
    try {
      fs.writeFileSync(filePath, logs, 'utf-8')
      return { success: true }
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) }
    }
  })

  windowController.show()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      windowController.show()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
