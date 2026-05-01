import { app, BrowserWindow, Notification, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ipcChannels } from '@shared/ipc'
import { PythonProcessManager } from './process/PythonProcessManager'
import { TrayController } from './tray/TrayController'
import type { TrayConfig } from './tray/types'
import { WindowController } from './window/WindowController'
import { buildNotificationPayload } from './tray/notification'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const processManager = new PythonProcessManager({ pythonBin: 'python3', maxLogLines: 1000 })
const trayController = TrayController.getInstance()
let activeRunId: string | null = null
let isQuitting = false
app.on('before-quit', () => {
  isQuitting = true
})

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

  if (process.platform !== 'darwin') {
    win.on('close', (e) => {
      if (isQuitting) return
      e.preventDefault()
      win.hide()
    })
  }

  return win
}

const windowController = new WindowController({
  createWindow: createMainWindow,
  onWindowVisibilityChange: (visible) => trayController.setWindowVisible(visible)
})

app.whenReady().then(() => {
  trayController.init({
    windowController,
    config: { tooltip: 'OmniScraper Desktop' },
    trayConfigPersistence: { userDataPath: app.getPath('userData'), fs },
    onCancelRun: async (runId) => {
      await processManager.kill(runId)
    }
  })

  processManager.onLog((ev) => {
    windowController.getWindow()?.webContents.send(ipcChannels.jobLog, ev)
  })
  processManager.onExit((ev) => {
    if (activeRunId === ev.runId) {
      activeRunId = null
      trayController.setActiveRunId(null)
    }
    windowController.getWindow()?.webContents.send(ipcChannels.jobStatus, { status: 'exited', ...ev })

    const payload = buildNotificationPayload({ runId: ev.runId, exitCode: ev.code, platform: process.platform })
    const n = new Notification(payload)
    n.on('click', () => {
      windowController.show()
      windowController.getWindow()?.focus()
      windowController.getWindow()?.webContents.send('app:navigate', { path: `/report/${ev.runId}` })
    })
    n.show()
  })
  processManager.onStart((ev) => {
    activeRunId = ev.runId
    trayController.setActiveRunId(ev.runId)
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

    const payload = buildNotificationPayload({ runId: ev.runId, exitCode: 1, platform: process.platform })
    const n = new Notification(payload)
    n.on('click', () => {
      windowController.show()
      windowController.getWindow()?.focus()
      windowController.getWindow()?.webContents.send('app:navigate', { path: `/report/${ev.runId}` })
    })
    n.show()
  })

  ipcMain.handle(ipcChannels.jobStart, async (_evt, cfg) => {
    const res = await processManager.start(cfg)
    return res
  })

  ipcMain.handle(ipcChannels.jobCancel, async (_evt, runId: string) => {
    await processManager.kill(runId)
    if (activeRunId === runId) {
      activeRunId = null
      trayController.setActiveRunId(null)
    }
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

  ipcMain.handle(ipcChannels.trayGetConfig, async () => {
    return trayController.getTrayConfig()
  })

  ipcMain.handle(ipcChannels.trayUpdateConfig, async (_evt, partial: Partial<TrayConfig> | null) => {
    return trayController.updateTrayConfig(partial ?? {})
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
