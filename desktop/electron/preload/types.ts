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

export type DesktopApi = {
  version: string
  job: {
    start: (config: JobConfig) => Promise<JobStartResult>
    cancel: (runId: string) => Promise<{ success: boolean }>
    onLog: (runId: string, callback: (line: string) => void) => () => void
    onStatus: (runId: string, callback: (ev: JobStatusEvent) => void) => () => void
    exportLog: (runId: string) => Promise<ExportLogResult>
  }
  app: {
    onNavigate: (callback: (ev: AppNavigateEvent) => void) => () => void
  }
}
