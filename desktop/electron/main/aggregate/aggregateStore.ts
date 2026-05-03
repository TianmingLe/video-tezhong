import path from 'node:path'

export type AggregateStoreFs = {
  existsSync: (p: string) => boolean
  mkdirSync: (p: string, opts: { recursive: boolean }) => void
  readdirSync: (p: string) => string[]
  statSync: (p: string) => { isDirectory: () => boolean; mtimeMs: number }
  writeFileSync: (p: string, data: string, enc: 'utf-8') => void
  readFileSync: (p: string, enc: 'utf-8') => string
  rmSync: (p: string, opts?: { recursive?: boolean; force?: boolean }) => void
  copyFileSync: (src: string, dst: string) => void
}

type ListItem = { dirName: string; dirPath: string; mtimeMs: number }

function assertSafeSegment(s: string): void {
  if (!s) throw new Error('segment is required')
  if (s.includes('..') || s.includes('/') || s.includes('\\')) throw new Error('invalid segment')
}

function assertSafeFileName(s: string): void {
  assertSafeSegment(s)
  if (s.length > 200) throw new Error('name too long')
}

export function getAggregatesRoot(userDataPath: string): string {
  return path.join(userDataPath, 'results', 'aggregates')
}

export function createAggregateStore(args: { userDataPath: string; fs: AggregateStoreFs; now?: () => number }) {
  const now = args.now ?? (() => Date.now())
  const root = getAggregatesRoot(args.userDataPath)

  const ensureRoot = () => {
    args.fs.mkdirSync(root, { recursive: true })
  }

  const resolveDir = (dirName: string) => {
    assertSafeSegment(dirName)
    const dirPath = path.join(root, dirName)
    const rel = path.relative(root, dirPath)
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('invalid dirPath')
    return dirPath
  }

  const list = (): ListItem[] => {
    if (!args.fs.existsSync(root)) return []
    ensureRoot()
    const names = args.fs.readdirSync(root)
    const rows: ListItem[] = []
    for (const name of names) {
      try {
        assertSafeSegment(name)
        const p = path.join(root, name)
        const st = args.fs.statSync(p)
        if (!st.isDirectory()) continue
        rows.push({ dirName: name, dirPath: p, mtimeMs: st.mtimeMs })
      } catch {
        continue
      }
    }
    rows.sort((a, b) => b.mtimeMs - a.mtimeMs)
    return rows
  }

  const save = (input: { runs: string[]; files: Record<string, string> }) => {
    ensureRoot()
    const ts = now()
    const n = Array.isArray(input.runs) ? input.runs.length : 0
    const dirName = `${ts}_${n}`
    const dirPath = resolveDir(dirName)
    args.fs.mkdirSync(dirPath, { recursive: true })

    const meta = { createdAt: ts, runs: input.runs ?? [] }
    args.fs.writeFileSync(path.join(dirPath, 'meta.json'), JSON.stringify(meta, null, 2), 'utf-8')

    const names: string[] = []
    for (const [name, text] of Object.entries(input.files ?? {})) {
      assertSafeFileName(name)
      const p = path.join(dirPath, name)
      args.fs.writeFileSync(p, String(text ?? ''), 'utf-8')
      names.push(name)
    }
    names.sort()
    return { dirName, dirPath, files: ['meta.json', ...names] }
  }

  const readFile = (input: { dirName: string; name: string; maxBytes?: number }) => {
    const dirPath = resolveDir(input.dirName)
    assertSafeFileName(input.name)
    const filePath = path.join(dirPath, input.name)
    const rel = path.relative(dirPath, filePath)
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw new Error('invalid filePath')
    const text = args.fs.readFileSync(filePath, 'utf-8')
    const max = typeof input.maxBytes === 'number' && Number.isFinite(input.maxBytes) ? Math.max(1, Math.floor(input.maxBytes)) : undefined
    if (max && Buffer.byteLength(text, 'utf-8') > max) return text.slice(0, max)
    return text
  }

  const deleteAgg = (input: { dirName: string; names?: string[] }) => {
    const dirPath = resolveDir(input.dirName)
    const names = input.names
    if (!names || names.length === 0) {
      args.fs.rmSync(dirPath, { recursive: true, force: true })
      return
    }
    for (const name of names) {
      assertSafeFileName(name)
      const filePath = path.join(dirPath, name)
      args.fs.rmSync(filePath, { force: true })
    }
  }

  const copyToDir = (input: { dirName: string; names: string[]; destDirPath: string }) => {
    const dirPath = resolveDir(input.dirName)
    if (!input.destDirPath) throw new Error('destDirPath is required')
    for (const name of input.names) {
      assertSafeFileName(name)
      const src = path.join(dirPath, name)
      const dst = path.join(input.destDirPath, name)
      args.fs.copyFileSync(src, dst)
    }
  }

  return { root, list, save, readFile, delete: deleteAgg, copyToDir }
}
