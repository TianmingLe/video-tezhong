import { app, BrowserWindow, Notification, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ipcChannels } from '@shared/ipc'
import { PythonProcessManager } from './process/PythonProcessManager'
import { createLogArchive } from './logs'
import { TrayController } from './tray/TrayController'
import { WindowController } from './window/WindowController'
import { runNotifyFlow } from './notify/notifyFlow'
import type { TrayConfig } from './tray/types'
import { createTemplatesStore } from './store/templatesStore'
import { getDb } from './db'
import { createTasksRepo } from './db/tasksRepo'
import treeKill from 'tree-kill'
import { createJobRuntime } from './job/jobRuntime'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const trayController = TrayController.getInstance()
let activeRunId: string | null = null
let isQuitting = false
app.on('before-quit', () => {
  isQuitting = true
})

type StoreAdapter = {
  get: <T>(key: string) => T | undefined
  set: <T>(key: string, value: T) => void
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

function createJsonFileStoreAdapter(args: { userDataPath: string; name: string }): StoreAdapter {
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

  const logArchive = createLogArchive({ userDataPath })
  logArchive.ensureDir()

  const db = getDb()
  const tasksRepo = createTasksRepo(db)

  const processManager = new PythonProcessManager({
    pythonBin: 'python3',
    maxLogLines: 1000,
    logSink: ({ runId, line }) => {
      logArchive.appendLog(runId, line)
    }
  })

  const templatesStore = createTemplatesStore({
    adapter: createJsonFileStoreAdapter({ userDataPath, name: 'templates' }),
    key: 'taskTemplates'
  })

  const killTree = async (pid: number): Promise<void> => {
    await new Promise<void>((resolve) => {
      treeKill(pid, 'SIGKILL', () => resolve())
    })
  }

  const jobRuntime = createJobRuntime({ processManager, tasksRepo, killTree, maxConcurrency: 2 })

  trayController.init({
    windowController,
    config: { tooltip: 'OmniScraper Desktop' },
    trayConfigPersistence: { userDataPath, fs },
    onCancelRun: async (runId) => {
      await jobRuntime.cancel(runId)
    }
  })

  processManager.onLog((ev) => {
    windowController.getWindow()?.webContents.send(ipcChannels.jobLog, ev)
  })
  processManager.onExit((ev) => {
    if (activeRunId === ev.runId) {
      const running = jobRuntime.queue.getSnapshot().running
      const next = running.length ? running[running.length - 1]!.runId : null
      activeRunId = next
      trayController.setActiveRunId(next)
    }
    windowController.getWindow()?.webContents.send(ipcChannels.jobStatus, { status: 'exited', ...ev })

    const cur = tasksRepo.getById(ev.runId)
    if (cur?.status === 'cancelled') return
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

  ipcMain.handle(ipcChannels.jobStart, async (_evt, cfg: { runId: string; script: string; args: string[]; env?: Record<string, string> } | null) => {
    return await jobRuntime.enqueue(cfg as never)
  })

  ipcMain.handle(ipcChannels.jobCancel, async (_evt, runId: string) => {
    await jobRuntime.cancel(runId)
    if (activeRunId === runId) {
      const running = jobRuntime.queue.getSnapshot().running
      const next = running.length ? running[running.length - 1]!.runId : null
      activeRunId = next
      trayController.setActiveRunId(next)
    }
    return { success: true }
  })

  ipcMain.handle(ipcChannels.jobExportLog, async (_evt, runId: string) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: '导出日志',
      defaultPath: `${runId}.log`,
      filters: [{ name: 'Log', extensions: ['log', 'txt'] }]
    })
    if (canceled || !filePath) return { success: false, error: 'cancelled' }

    const fallbackContent = processManager.getLogs(runId).join('\n') + '\n'
    return logArchive.exportLog(runId, filePath, { fallbackContent })
  })

  ipcMain.handle(ipcChannels.historyList, async () => {
    return tasksRepo.getAll().map((row) => ({
      runId: row.run_id,
      scriptName: row.script,
      scenario: row.scenario,
      status: row.status,
      exitCode: row.exit_code,
      startTime: row.start_time,
      endTime: row.end_time
    }))
  })

  ipcMain.handle(ipcChannels.historyGet, async (_evt, runId: string) => {
    const row = tasksRepo.getById(runId)
    if (!row) return null
    return {
      runId: row.run_id,
      scriptName: row.script,
      scenario: row.scenario,
      status: row.status,
      exitCode: row.exit_code,
      startTime: row.start_time,
      endTime: row.end_time
    }
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
