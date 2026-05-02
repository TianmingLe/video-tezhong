import { app, BrowserWindow, Notification, dialog, ipcMain } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ipcChannels } from '@shared/ipc'
import { PythonProcessManager } from './process/PythonProcessManager'
import { MAX_ARCHIVED_LOG_CHUNK_SIZE, createLogArchive, readArchivedLog } from './logs'
import { TrayController } from './tray/TrayController'
import { WindowController } from './window/WindowController'
import { runNotifyFlow } from './notify/notifyFlow'
import type { TrayConfig } from './tray/types'
import { getDb } from './db'
import { createTasksRepo } from './db/tasksRepo'
import { createConfigsRepo } from './db/configsRepo'
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
  const userDataPath = app.getPath('userData')
  process.env.OMNI_USER_DATA_PATH = userDataPath

  const logArchive = createLogArchive({ userDataPath })
  logArchive.ensureDir()

  const db = getDb()
  const tasksRepo = createTasksRepo(db)
  const configsRepo = createConfigsRepo(db)

  const processManager = new PythonProcessManager({
    pythonBin: 'python3',
    maxLogLines: 1000,
    logSink: ({ runId, line }) => {
      logArchive.appendLog(runId, line)
    }
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

  ipcMain.handle(ipcChannels.jobGetArchivedLog, async (_evt, input: unknown) => {
    const o = (input && typeof input === 'object' ? (input as Record<string, unknown>) : null) ?? {}
    const runId = String(o.runId ?? '').trim()
    if (!runId) return { success: false, error: 'runId is required' }
    if (runId.includes('..') || runId.includes('/') || runId.includes('\\')) return { success: false, error: 'invalid runId' }

    const offsetRaw = Number(o.offset ?? 0)
    const chunkSizeRaw = Number(o.chunkSize ?? MAX_ARCHIVED_LOG_CHUNK_SIZE)
    const offset = Number.isFinite(offsetRaw) ? offsetRaw : 0
    const chunkSize = Number.isFinite(chunkSizeRaw)
      ? Math.min(Math.max(1, Math.floor(chunkSizeRaw)), MAX_ARCHIVED_LOG_CHUNK_SIZE)
      : MAX_ARCHIVED_LOG_CHUNK_SIZE

    return readArchivedLog({ userDataPath, runId, offset, chunkSize })
  })

  ipcMain.handle(ipcChannels.jobQueueStatus, async () => {
    const snap = jobRuntime.queue.getSnapshot()
    return { running: snap.running.map((x) => x.runId), pending: snap.queued.length }
  })

  ipcMain.handle(ipcChannels.jobHistory, async () => {
    return tasksRepo.getAll()
  })

  ipcMain.handle(ipcChannels.kbList, async () => {
    return configsRepo.getAll()
  })

  ipcMain.handle(ipcChannels.kbSave, async (_evt, input: unknown) => {
    const o = (input && typeof input === 'object' ? (input as Record<string, unknown>) : null) ?? {}
    const name = String(o.name ?? '').trim()
    const script = String(o.script ?? '').trim()
    const scenario = String(o.scenario ?? '').trim()
    const gateway_ws = o.gateway_ws === null ? null : typeof o.gateway_ws === 'string' ? o.gateway_ws.trim() || null : null
    const env = typeof o.env === 'string' ? o.env : ''
    const is_default = typeof o.is_default === 'number' ? (o.is_default === 1 ? 1 : 0) : 0

    const row = configsRepo.insert({ name, script, scenario, gateway_ws, env, is_default })
    if (is_default === 1) configsRepo.setDefault(row.id)
    return row.id
  })

  ipcMain.handle(ipcChannels.kbSetDefault, async (_evt, id: number) => {
    configsRepo.setDefault(id)
    return { success: true as const }
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
