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

export type TrayLeftClickMode = 'menu' | 'toggle' | 'none'

export type TrayRightClickMode = 'menu' | 'none'

export type TrayConfig = {
  leftClick: TrayLeftClickMode
  rightClick: TrayRightClickMode
  showBadgeOnRunning: boolean
}

export type TaskHistoryStatus = 'queued' | 'running' | 'exited' | 'error' | 'cancelled'

export type TaskHistoryItem = {
  runId: string
  scriptName: string
  scenario: string
  status: TaskHistoryStatus
  exitCode: number | null
  startTime: number | null
  endTime: number | null
}

export type JobSnapshot = {
  runId: string
  state: TaskHistoryStatus
  pid: number | null
  exitCode: number | null
  signal: string | null
  error: string | null
}

export type JobQueueStatus = {
  maxConcurrency: number
  running: JobSnapshot[]
  queued: JobSnapshot[]
  jobs: Record<string, JobSnapshot>
}

export type KbItem = {
  id: number
  name: string
  script: string
  scenario: string
  gatewayWs: string | null
  env: Record<string, string>
  isDefault: boolean
}

export type KbSaveInput = {
  id?: number
  name: string
  script: string
  scenario: string
  gatewayWs?: string | null
  env?: Record<string, string>
  isDefault?: boolean
}

export type DesktopApi = {
  version: string
  job: {
    start: (config: JobConfig) => Promise<JobStartResult>
    cancel: (runId: string) => Promise<{ success: boolean }>
    onLog: (runId: string, callback: (line: string) => void) => () => void
    onStatus: (runId: string, callback: (ev: JobStatusEvent) => void) => () => void
    exportLog: (runId: string) => Promise<ExportLogResult>
    queueStatus: () => Promise<JobQueueStatus>
    history: () => Promise<TaskHistoryItem[]>
  }
  kb: {
    list: () => Promise<KbItem[]>
    save: (input: KbSaveInput) => Promise<KbItem>
    setDefault: (id: number) => Promise<KbItem>
  }
  tray: {
    getConfig: () => Promise<TrayConfig>
    updateConfig: (partial: Partial<TrayConfig>) => Promise<TrayConfig>
  }
  app: {
    onNavigate: (callback: (ev: AppNavigateEvent) => void) => () => void
  }
}
