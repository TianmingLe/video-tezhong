import type { ConfigRecord, TaskRecord, TaskStatus } from '../main/db/types'
import type { UpdateEvent, UpdateInstallResult, UpdateState } from '../main/update/UpdateService'

export type JobConfig = {
  runId: string
  script: string
  args: string[]
  env?: Record<string, string>
}

export type JobStartResult =
  | { success: true; state: 'running' }
  | { success: true; state: 'queued'; position: number }
  | { success: false; error: string }

export type JobStatusEvent =
  | { runId: string; status: 'started'; pid: number }
  | { runId: string; status: 'exited'; code: number | null; signal: string | null }
  | { runId: string; status: 'error'; error: string }

export type ExportLogResult = { success: true } | { success: false; error: string }

export type AppNavigateEvent = { path: string }

export type AppNotifyEvent = { level: 'info' | 'warning' | 'error'; message: string }

export type DbState = { isReadOnly: boolean }

export type TrayLeftClickMode = 'menu' | 'toggle' | 'none'

export type TrayRightClickMode = 'menu' | 'none'

export type TrayConfig = {
  leftClick: TrayLeftClickMode
  rightClick: TrayRightClickMode
  showBadgeOnRunning: boolean
}

export type { TaskRecord, ConfigRecord, TaskStatus } from '../main/db/types'
export type { UpdateState, UpdateEvent, UpdateInstallResult } from '../main/update/UpdateService'

export type JobQueueStatus = {
  running: string[]
  pending: number
}

export type JobGetArchivedLogResult =
  | { success: true; offset: number; nextOffset: number; eof: boolean; text: string }
  | { success: false; error: string }

export type DesktopApi = {
  version: string
  job: {
    start: (config: JobConfig) => Promise<JobStartResult>
    cancel: (runId: string) => Promise<{ success: boolean }>
    onLog: (runId: string, callback: (line: string) => void) => () => void
    onStatus: (runId: string, callback: (ev: JobStatusEvent) => void) => () => void
    onQueueUpdate: (callback: (ev: JobQueueStatus) => void) => () => void
    exportLog: (runId: string) => Promise<ExportLogResult>
    queueStatus: () => Promise<JobQueueStatus>
    history: () => Promise<TaskRecord[]>
    getArchivedLog: (runId: string, offset: number, chunkSize: number) => Promise<JobGetArchivedLogResult>
  }
  kb: {
    list: () => Promise<ConfigRecord[]>
    save: (input: Omit<ConfigRecord, 'id'>) => Promise<number>
    setDefault: (id: number) => Promise<{ success: true }>
  }
  tray: {
    getConfig: () => Promise<TrayConfig>
    updateConfig: (partial: Partial<TrayConfig>) => Promise<TrayConfig>
  }
  app: {
    onNavigate: (callback: (ev: AppNavigateEvent) => void) => () => void
    onNotify: (callback: (ev: AppNotifyEvent) => void) => () => void
    getDbState: () => Promise<DbState>
  }
  update: {
    check: () => Promise<UpdateState>
    install: () => Promise<UpdateInstallResult>
    getState: () => Promise<UpdateState>
    onEvent: (callback: (ev: UpdateEvent) => void) => () => void
  }
}
