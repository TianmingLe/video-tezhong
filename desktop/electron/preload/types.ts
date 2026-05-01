export type JobConfig = {
  runId: string
  script: string
  args: string[]
  env?: Record<string, string>
}

export type JobStartResult = { success: true; pid: number } | { success: false; error: string }

export type DesktopApi = {
  version: string
  job: {
    start: (config: JobConfig) => Promise<JobStartResult>
    cancel: (runId: string) => Promise<{ success: boolean }>
    onLog: (runId: string, callback: (line: string) => void) => () => void
  }
}
