import { app, BrowserWindow, Notification, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ipcChannels } from '@shared/ipc'
import { PythonProcessManager } from './process/PythonProcessManager'
import { TrayController } from './tray/TrayController'
import { WindowController } from './window/WindowController'
import { runNotifyFlow } from './notify/notifyFlow'
import type { TrayConfig } from './tray/types'
import { createHistoryStore, type StoreAdapter as HistoryStoreAdapter } from './store/historyStore'
import { createTemplatesStore } from './store/templatesStore'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const processManager = new PythonProcessManager({ pythonBin: 'python3', maxLogLines: 1000 })
const trayController = TrayController.getInstance()
let activeRunId: string | null = null
let isQuitting = false
app.on('before-quit', () => {
  isQuitting = true
})

function inferScenario(args: unknown): string {
  if (!Array.isArray(args)) return ''
  const parts = args.map((x) => String(x))
  const idx = parts.indexOf('--scenario')
  if (idx < 0) return ''
  return String(parts[idx + 1] ?? '').trim()
}

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

function createJsonFileStoreAdapter(args: { userDataPath: string; name: string }): HistoryStoreAdapter {
  const filePath = path.join(args.userDataPath, `${args.name}.json`)

  const readRoot = (): Record<string, unknown> => {
    if (!fs.existsSync(filePath)) return {}
    try {
      const raw = fs.readFileSync(filePath, 'utf-8')
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      return parsed as Record<string, unknown>
    } catch {
      return {}
    }
  }

  const writeRoot = (root: Record<string, unknown>) => {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(root, null, 2), 'utf-8')
  }

  return {
    get: <T>(key: string) => {
      const root = readRoot()
      return root[key] as T
    },
    set: <T>(key: string, value: T) => {
      const root = readRoot()
      root[key] = value as unknown
      writeRoot(root)
    }
  }
}

app.whenReady().then(() => {
  const userDataPath = app.getPath('userData')
  process.env.OMNI_USER_DATA_PATH = userDataPath

  const historyStore = createHistoryStore({ adapter: createJsonFileStoreAdapter({ userDataPath, name: 'history' }) })
  const templatesStore = createTemplatesStore({
    adapter: createJsonFileStoreAdapter({ userDataPath, name: 'templates' }),
    key: 'taskTemplates'
  })

  trayController.init({
    windowController,
    config: { tooltip: 'OmniScraper Desktop' },
    trayConfigPersistence: { userDataPath, fs },
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
    historyStore.applyStatusChange({ runId: ev.runId, status: 'exited', exitCode: ev.code, ts: Date.now() })
    windowController.getWindow()?.webContents.send(ipcChannels.jobStatus, { status: 'exited', ...ev })
    runNotifyFlow({
      runId: ev.runId,
      exitCode: ev.code,
      platform: process.platform,
      deps: {
        createNotification: (payload) => {
          const n = new Notification(payload)
          return {
            onClick: (cb) => n.on('click', cb),
            show: () => n.show()
          }
        },
        showAndFocusWindow: () => {
          windowController.show()
          windowController.getWindow()?.focus()
        },
        sendNavigate: (path) => {
          windowController.getWindow()?.webContents.send('app:navigate', { path })
        }
      }
    })
  })
  processManager.onStart((ev) => {
    activeRunId = ev.runId
    trayController.setActiveRunId(ev.runId)
    historyStore.applyStatusChange({ runId: ev.runId, status: 'running', ts: Date.now() })
    windowController.getWindow()?.webContents.send(ipcChannels.jobStatus, {
      runId: ev.runId,
      status: 'started',
      pid: ev.pid
    })
  })
  processManager.onError((ev) => {
    historyStore.applyStatusChange({ runId: ev.runId, status: 'error', ts: Date.now() })
    windowController.getWindow()?.webContents.send(ipcChannels.jobStatus, {
      runId: ev.runId,
      status: 'error',
      error: ev.error
    })
    runNotifyFlow({
      runId: ev.runId,
      exitCode: 1,
      platform: process.platform,
      deps: {
        createNotification: (payload) => {
          const n = new Notification(payload)
          return {
            onClick: (cb) => n.on('click', cb),
            show: () => n.show()
          }
        },
        showAndFocusWindow: () => {
          windowController.show()
          windowController.getWindow()?.focus()
        },
        sendNavigate: (path) => {
          windowController.getWindow()?.webContents.send('app:navigate', { path })
        }
      }
    })
  })

  ipcMain.handle(ipcChannels.jobStart, async (_evt, cfg: { runId: string; script: string; args: string[] } | null) => {
    const runId = String(cfg?.runId || '').trim()
    if (runId) {
      historyStore.applyStatusChange({
        runId,
        status: 'queued',
        scriptName: path.basename(String(cfg?.script || '').trim()),
        scenario: inferScenario(cfg?.args),
        ts: Date.now()
      })
    }

    const res = await processManager.start(cfg as never)
    if (!res.success && runId) {
      historyStore.applyStatusChange({ runId, status: 'error', ts: Date.now() })
    }
    return res
  })

  ipcMain.handle(ipcChannels.jobCancel, async (_evt, runId: string) => {
    historyStore.applyStatusChange({ runId, status: 'cancelled', ts: Date.now() })
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

  ipcMain.handle(ipcChannels.historyList, async () => {
    return historyStore.list()
  })

  ipcMain.handle(ipcChannels.historyGet, async (_evt, runId: string) => {
    return historyStore.get(runId)
  })

  ipcMain.handle(ipcChannels.templatesList, async () => {
    return templatesStore.list()
  })

  ipcMain.handle(ipcChannels.templatesSave, async (_evt, input) => {
    return templatesStore.save(input)
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
