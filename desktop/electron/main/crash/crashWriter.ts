import path from 'node:path'

export type CrashFs = {
  mkdirSync: (p: string, opts: { recursive: boolean }) => void
  writeFileSync: (p: string, data: string, enc: BufferEncoding) => void
}

export type CrashReport = {
  schemaVersion: 1
  ts: number
  processType: 'main' | 'renderer'
  eventType: string
  error?: { name: string; message: string; stack?: string }
  details?: Record<string, unknown>
  context: { lastRunId: string | null }
  system: {
    platform: NodeJS.Platform
    arch: string
    electron?: string
    chrome?: string
    node: string
  }
}

export type CrashWriter = {
  write: (report: CrashReport) => { success: true; filePath: string } | { success: false; error: string }
}

function safeString(v: unknown, maxLen: number): string {
  const s = typeof v === 'string' ? v : v == null ? '' : String(v)
  return s.length > maxLen ? s.slice(0, maxLen) : s
}

function safeJson(v: unknown): string {
  try {
    return JSON.stringify(v, (_k, val) => {
      if (typeof val === 'bigint') return String(val)
      return val
    })
  } catch {
    return JSON.stringify({ unserializable: true })
  }
}

function formatFileTs(ts: number): string {
  return new Date(ts).toISOString().replace(/[:.]/g, '-')
}

export function createCrashWriter(args: {
  userDataPath: string
  fs: CrashFs
  now?: () => number
  idFactory?: () => string
}): CrashWriter {
  const now = args.now ?? (() => Date.now())
  const idFactory =
    args.idFactory ??
    (() => {
      try {
        return Math.random().toString(16).slice(2, 10)
      } catch {
        return 'unknown'
      }
    })

  const crashDir = path.join(args.userDataPath, 'crash')

  const write: CrashWriter['write'] = (report) => {
    try {
      args.fs.mkdirSync(crashDir, { recursive: true })
      const ts = typeof report.ts === 'number' && Number.isFinite(report.ts) ? report.ts : now()
      const fileName = `${formatFileTs(ts)}-${safeString(report.processType, 20)}-${idFactory()}.json`
      const filePath = path.join(crashDir, fileName)
      const body = safeJson(report)
      args.fs.writeFileSync(filePath, body + '\n', 'utf8')
      return { success: true, filePath }
    } catch (e) {
      return { success: false, error: safeString((e as Error)?.message ?? e, 500) }
    }
  }

  return { write }
}

