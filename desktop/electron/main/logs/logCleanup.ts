type FsLike = {
  existsSync: (p: string) => boolean
  mkdirSync: (p: string, opts: { recursive: boolean }) => void
  readdirSync: (p: string) => string[]
  statSync: (p: string) => { isFile: () => boolean; mtimeMs: number }
  unlinkSync: (p: string) => void
}

type PathLike = {
  resolve: (...args: string[]) => string
  join: (...args: string[]) => string
  sep: string
}

export type LogCleanup = {
  preview: (args?: { keep?: number }) => Promise<{ toDelete: number; total: number }>
  cleanup: (
    args?: { keep?: number }
  ) => Promise<{ success: true; deleted: number } | { success: false; error: string }>
}

export function createLogCleanup(args: { userDataPath: string; fs: FsLike; path: PathLike }): LogCleanup {
  const fs = args.fs
  const path = args.path
  const userDataPath = path.resolve(String(args.userDataPath || ''))
  const logsDir = path.join(userDataPath, 'logs')

  const normalizeKeep = (keep: unknown): number => {
    const n = typeof keep === 'number' ? keep : 50
    if (!Number.isFinite(n)) return 50
    return Math.max(0, Math.floor(n))
  }

  const safeJoin = (baseDir: string, name: string): string => {
    const base = path.resolve(baseDir)
    const full = path.resolve(base, name)
    if (!full.startsWith(base + path.sep)) throw new Error('invalid file path')
    return full
  }

  const listLogFiles = (): { filePath: string; mtimeMs: number }[] => {
    if (!fs.existsSync(logsDir)) return []

    let entries: string[] = []
    try {
      entries = fs.readdirSync(logsDir)
    } catch {
      return []
    }

    const out: { filePath: string; mtimeMs: number }[] = []
    for (const name of entries) {
      if (!name.endsWith('.log')) continue
      const filePath = safeJoin(logsDir, name)
      try {
        const st = fs.statSync(filePath)
        if (!st.isFile()) continue
        out.push({ filePath, mtimeMs: st.mtimeMs })
      } catch {}
    }
    out.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return out
  }

  const preview: LogCleanup['preview'] = async (input) => {
    const keep = normalizeKeep(input?.keep)
    const files = listLogFiles()
    const total = files.length
    const toDelete = Math.max(0, total - keep)
    return { toDelete, total }
  }

  const cleanup: LogCleanup['cleanup'] = async (input) => {
    const keep = normalizeKeep(input?.keep)
    try {
      if (!fs.existsSync(logsDir)) return { success: true, deleted: 0 }
      fs.mkdirSync(logsDir, { recursive: true })

      const files = listLogFiles()
      const doomed = files.slice(keep)
      for (const f of doomed) {
        fs.unlinkSync(f.filePath)
      }
      return { success: true, deleted: doomed.length }
    } catch (e) {
      return { success: false, error: String((e as Error)?.message || e) }
    }
  }

  return { preview, cleanup }
}

