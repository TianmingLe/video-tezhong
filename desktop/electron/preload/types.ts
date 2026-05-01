export type JobConfig = {
  runId: string
  script: string
  args: string[]
  env?: Record<string, string>
}

export type JobStartResult = { success: true; pid: number } | { success: false; error: string }

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

export type TaskTemplateConfig = {
  scriptName: string
  scenario: string
}

export type TaskTemplate = {
  id: string
  title: string
  tags: string[]
  createdAt: number
  config: TaskTemplateConfig
}

export type TaskTemplateSaveInput = { title: string; tags: string[]; config: TaskTemplateConfig }

export type HistoryItem = TaskHistoryItem

export type TemplateItem = TaskTemplate

export type TemplateSaveInput = { id?: string; title: string; tags: string[]; config: TaskTemplateConfig }

export type DesktopApi = {
  version: string
  job: {
    start: (config: JobConfig) => Promise<JobStartResult>
    cancel: (runId: string) => Promise<{ success: boolean }>
    onLog: (runId: string, callback: (line: string) => void) => () => void
    onStatus: (runId: string, callback: (ev: JobStatusEvent) => void) => () => void
    exportLog: (runId: string) => Promise<ExportLogResult>
  }
  history: {
    list: () => Promise<HistoryItem[]>
    get: (runId: string) => Promise<HistoryItem | null>
  }
  templates: {
    list: () => Promise<TemplateItem[]>
    save: (input: TemplateSaveInput) => Promise<TemplateItem>
  }
  tray: {
    getConfig: () => Promise<TrayConfig>
    updateConfig: (partial: Partial<TrayConfig>) => Promise<TrayConfig>
  }
  app: {
    onNavigate: (callback: (ev: AppNavigateEvent) => void) => () => void
  }
}
