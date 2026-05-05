export type DiagnosticsResult = {
  checks: Array<{
    name: string
    status: 'ok' | 'warning' | 'error'
    detail: string
    suggestion?: string
  }>
  summary: string
}

export function runDesktopDiagnostics(args: {
  userDataPath: string
  projectRoot: string
}): Promise<DiagnosticsResult>
