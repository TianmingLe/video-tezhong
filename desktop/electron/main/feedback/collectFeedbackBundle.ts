import type { TasksRepo } from '../db/tasksRepo'

type FsLike = {
  existsSync: (p: string) => boolean
  readdirSync: (p: string) => string[]
  statSync: (p: string) => { isFile: () => boolean; mtimeMs: number }
  readFileSync: (p: string, enc: 'utf-8') => string
}

type PathLike = {
  resolve: (...args: string[]) => string
  join: (...args: string[]) => string
  sep: string
}

export type FeedbackBundle = { markdown: string }

export type FeedbackCollector = {
  collectBundle: (input?: { userInput?: string }) => FeedbackBundle
}

type CrashFile = {
  name: string
  filePath: string
  mtimeMs: number
}

type CrashReport =
  | { ok: true; file: CrashFile; data: unknown }
  | { ok: false; file: CrashFile; error: string }

export function createFeedbackCollector(args: {
  userDataPath: string
  tasksRepo: TasksRepo
  appVersion: string
  fs: FsLike
  path: PathLike
  platform?: string
  arch?: string
  nodeVersion?: string
  electronVersion?: string
  maxCrashReports?: number
  maxStackChars?: number
}): FeedbackCollector {
  const fs = args.fs
  const path = args.path
  const userDataPath = path.resolve(String(args.userDataPath || ''))
  const crashDir = path.join(userDataPath, 'crash')

  const platform = String(args.platform ?? process.platform)
  const arch = String(args.arch ?? process.arch)
  const appVersion = String(args.appVersion ?? '')
  const nodeVersion = String(args.nodeVersion ?? process.versions.node ?? '')
  const electronVersion = String(args.electronVersion ?? process.versions.electron ?? '')

  const maxCrashReports = typeof args.maxCrashReports === 'number' ? Math.max(0, Math.floor(args.maxCrashReports)) : 2
  const maxStackChars = typeof args.maxStackChars === 'number' ? Math.max(0, Math.floor(args.maxStackChars)) : 2000

  const safeJoin = (baseDir: string, name: string): string => {
    const base = path.resolve(baseDir)
    const full = path.resolve(base, name)
    if (!full.startsWith(base + path.sep)) throw new Error('invalid file path')
    return full
  }

  const truncate = (s: string): { text: string; truncated: boolean } => {
    const str = String(s ?? '')
    if (!Number.isFinite(maxStackChars) || maxStackChars <= 0) return { text: '', truncated: str.length > 0 }
    if (str.length <= maxStackChars) return { text: str, truncated: false }
    return { text: str.slice(0, maxStackChars), truncated: true }
  }

  const applyStackTruncation = (data: unknown): unknown => {
    if (!data || typeof data !== 'object') return data
    const o = data as Record<string, unknown>
    const out: Record<string, unknown> = { ...o }

    const maybeTruncate = (container: Record<string, unknown>, key: string) => {
      const v = container[key]
      if (typeof v !== 'string') return
      const r = truncate(v)
      container[key] = r.truncated ? `${r.text}\n(truncated)` : r.text
    }

    maybeTruncate(out, 'stack')

    const errRaw = out.error
    if (errRaw && typeof errRaw === 'object') {
      const errObj = errRaw as Record<string, unknown>
      const errOut: Record<string, unknown> = { ...errObj }
      maybeTruncate(errOut, 'stack')
      out.error = errOut
    }

    return out
  }

  const listCrashFiles = (): CrashFile[] => {
    if (!fs.existsSync(crashDir)) return []
    let entries: string[] = []
    try {
      entries = fs.readdirSync(crashDir)
    } catch {
      return []
    }

    const out: CrashFile[] = []
    for (const name of entries) {
      if (!name.endsWith('.json')) continue
      let filePath: string
      try {
        filePath = safeJoin(crashDir, name)
      } catch {
        continue
      }
      try {
        const st = fs.statSync(filePath)
        if (!st.isFile()) continue
        out.push({ name, filePath, mtimeMs: st.mtimeMs })
      } catch {}
    }

    out.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return out.slice(0, maxCrashReports)
  }

  const readCrashReports = (): CrashReport[] => {
    const files = listCrashFiles()
    const out: CrashReport[] = []
    for (const f of files) {
      try {
        const raw = fs.readFileSync(f.filePath, 'utf-8')
        const data = applyStackTruncation(JSON.parse(raw))
        out.push({ ok: true, file: f, data })
      } catch (e) {
        out.push({ ok: false, file: f, error: String((e as Error)?.message || e) })
      }
    }
    return out
  }

  const renderSystemInfoTable = (): string => {
    const rows: Array<[string, string]> = [
      ['platform', platform],
      ['arch', arch],
      ['appVersion', appVersion],
      ['nodeVersion', nodeVersion],
      ['electronVersion', electronVersion]
    ]

    const head = ['| Key | Value |', '| --- | --- |']
    const body = rows.map(([k, v]) => `| ${k} | ${String(v || '-').replace(/\r?\n/g, ' ')} |`)
    return [...head, ...body].join('\n')
  }

  const renderCrashReports = (): string => {
    const crashes = readCrashReports()
    if (!crashes.length) return '无'

    const parts: string[] = []
    for (const c of crashes) {
      const summary = `${c.file.name} (${new Date(c.file.mtimeMs).toISOString()})`
      parts.push('<details>')
      parts.push(`<summary>${summary}</summary>`)
      parts.push('')
      if (c.ok) {
        parts.push('```json')
        parts.push(JSON.stringify(c.data, null, 2))
        parts.push('```')
      } else {
        parts.push(`解析失败：${c.error}`)
      }
      parts.push('')
      parts.push('</details>')
    }
    return parts.join('\n')
  }

  const renderLastTask = (): string => {
    let last: any = null
    try {
      last = args.tasksRepo.getAll()[0] ?? null
    } catch {}
    if (!last) return '无'

    const rows: Array<[string, string]> = [
      ['runId', String(last.run_id ?? '')],
      ['script', String(last.script ?? '')],
      ['scenario', String(last.scenario ?? '')],
      ['status', String(last.status ?? '')],
      ['exitCode', last.exit_code === null || typeof last.exit_code === 'undefined' ? '-' : String(last.exit_code)]
    ]
    const head = ['| Field | Value |', '| --- | --- |']
    const body = rows.map(([k, v]) => `| ${k} | ${String(v || '-').replace(/\r?\n/g, ' ')} |`)
    return [...head, ...body].join('\n')
  }

  const collectBundle: FeedbackCollector['collectBundle'] = (input) => {
    const userInput = String(input?.userInput ?? '')

    const parts: string[] = []
    parts.push('## User Input')
    parts.push('')
    parts.push('```')
    parts.push(userInput)
    parts.push('```')
    parts.push('')
    parts.push('## System Info')
    parts.push('')
    parts.push(renderSystemInfoTable())
    parts.push('')
    parts.push('## Crash Reports')
    parts.push('')
    parts.push(renderCrashReports())
    parts.push('')
    parts.push('## Last Task')
    parts.push('')
    parts.push(renderLastTask())
    parts.push('')

    return { markdown: parts.join('\n') }
  }

  return { collectBundle }
}

