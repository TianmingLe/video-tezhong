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

  const toHistoryItem = (row: { run_id: string; script: string; scenario: string; status: string; exit_code: number | null; start_time: number | null; end_time: number | null }) => ({
    runId: row.run_id,
    scriptName: row.script,
    scenario: row.scenario,
    status: row.status,
    exitCode: row.exit_code,
    startTime: row.start_time,
    endTime: row.end_time
  })

  const parseEnv = (raw: string): Record<string, string> => {
    const s = String(raw ?? '').trim()
    if (!s) return {}
    try {
      const parsed = JSON.parse(s) as unknown
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
      const out: Record<string, string> = {}
      for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
        const key = String(k || '').trim()
        if (!key) continue
        out[key] = String(v ?? '')
      }
      return out
    } catch {
      return {}
    }
  }

  const stringifyEnv = (env: unknown): string => {
    if (!env || typeof env !== 'object' || Array.isArray(env)) return ''
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(env as Record<string, unknown>)) {
      const key = String(k || '').trim()
      if (!key) continue
      out[key] = String(v ?? '')
    }
    return JSON.stringify(out)
  }

  const toKbItem = (row: { id: number; name: string; script: string; scenario: string; gateway_ws: string | null; env: string; is_default: 0 | 1 }) => ({
    id: row.id,
    name: row.name,
    script: row.script,
    scenario: row.scenario,
    gatewayWs: row.gateway_ws,
    env: parseEnv(row.env),
    isDefault: row.is_default === 1
  })

  ipcMain.handle(ipcChannels.jobQueueStatus, async () => {
    return jobRuntime.queue.getSnapshot()
  })

  ipcMain.handle(ipcChannels.jobHistory, async () => {
    return tasksRepo.getAll().map(toHistoryItem)
  })

  ipcMain.handle(ipcChannels.kbList, async () => {
    return configsRepo.getAll().map(toKbItem)
  })

  ipcMain.handle(ipcChannels.kbSave, async (_evt, input: unknown) => {
    const o = (input && typeof input === 'object' ? (input as Record<string, unknown>) : null) ?? {}
    const id = typeof o.id === 'number' ? o.id : typeof o.id === 'string' ? Number(o.id) : NaN
    const name = String(o.name ?? '').trim()
    const script = String(o.script ?? '').trim()
    const scenario = String(o.scenario ?? '').trim()
    const gatewayWsRaw = o.gatewayWs
    const gateway_ws =
      gatewayWsRaw === null ? null : typeof gatewayWsRaw === 'string' ? gatewayWsRaw.trim() || null : null
    const env = stringifyEnv(o.env)
    const isDefault = typeof o.isDefault === 'boolean' ? o.isDefault : false

    let row =
      Number.isFinite(id) && id > 0
        ? configsRepo.update({
            id,
            name,
            script,
            scenario,
            gateway_ws,
            env,
            is_default: isDefault ? 1 : 0
          })
        : configsRepo.insert({
            name,
            script,
            scenario,
            gateway_ws,
            env,
            is_default: isDefault ? 1 : 0
          })

    if (isDefault) row = configsRepo.setDefault(row.id)
    return toKbItem(row)
  })

  ipcMain.handle(ipcChannels.kbSetDefault, async (_evt, id: number) => {
    return toKbItem(configsRepo.setDefault(id))
  })

  ipcMain.handle('history:list', async () => {
    return tasksRepo.getAll().map(toHistoryItem)
  })

  ipcMain.handle('history:get', async (_evt, runId: string) => {
    const row = tasksRepo.getById(runId)
    return row ? toHistoryItem(row) : null
  })

  ipcMain.handle('templates:list', async () => {
    return configsRepo.getAll().map((row) => ({
      id: String(row.id),
      title: row.name,
      tags: [],
      createdAt: 0,
      config: { scriptName: row.script, scenario: row.scenario }
    }))
  })

  ipcMain.handle('templates:save', async (_evt, input: unknown) => {
    const o = (input && typeof input === 'object' ? (input as Record<string, unknown>) : null) ?? {}
    const rawCfg = o.config
    const cfg = rawCfg && typeof rawCfg === 'object' ? (rawCfg as Record<string, unknown>) : {}

    const id = typeof o.id === 'number' ? o.id : typeof o.id === 'string' ? Number(o.id) : NaN
    const title = String(o.title ?? o.name ?? '').trim()
    const script = String(cfg.scriptName ?? o.script ?? '').trim()
    const scenario = String(cfg.scenario ?? o.scenario ?? '').trim()
    const tags = Array.isArray(o.tags) ? o.tags.map((t) => String(t ?? '').trim()).filter(Boolean) : []

    const row =
      Number.isFinite(id) && id > 0
        ? configsRepo.update({ id, name: title, script, scenario, env: '', gateway_ws: null })
        : configsRepo.insert({ name: title, script, scenario, env: '', gateway_ws: null, is_default: 0 })

    return { id: String(row.id), title: row.name, tags, createdAt: 0, config: { scriptName: row.script, scenario: row.scenario } }
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
