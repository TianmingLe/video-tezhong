import { describe, expect, test } from 'vitest'
import { createClusterStore, type ClusterStoreFs } from './clusterStore'

function createMemFs(): ClusterStoreFs & { files: Map<string, string>; dirs: Set<string> } {
  const files = new Map<string, string>()
  const dirs = new Set<string>()
  return {
    files,
    dirs,
    existsSync: (p) => files.has(p) || dirs.has(p),
    mkdirSync: (p, _opts) => {
      dirs.add(p)
    },
    readdirSync: (p) => {
      const out: string[] = []
      for (const d of dirs) {
        if (d.startsWith(p + '/')) {
          const rest = d.slice(p.length + 1)
          if (!rest.includes('/')) out.push(rest)
        }
      }
      return out
    },
    statSync: (p) => ({ isDirectory: () => dirs.has(p), mtimeMs: 1 } as any),
    writeFileSync: (p, data, _enc) => {
      files.set(p, String(data))
    },
    readFileSync: (p, _enc) => {
      const v = files.get(p)
      if (v == null) throw new Error('ENOENT')
      return v
    },
    rmSync: (p) => {
      files.delete(p)
      dirs.delete(p)
      for (const k of [...files.keys()]) if (k.startsWith(p + '/')) files.delete(k)
      for (const d of [...dirs]) if (d.startsWith(p + '/')) dirs.delete(d)
    },
    copyFileSync: (src, dst) => {
      const v = files.get(src)
      if (v == null) throw new Error('ENOENT')
      files.set(dst, v)
    }
  }
}

describe('clusterStore', () => {
  test('save+list+read+delete', () => {
    const fs = createMemFs()
    const store = createClusterStore({ userDataPath: '/ud', fs, now: () => 1700000000000 })
    const saved = store.save({ runs: ['r1'], files: { 'cluster_summary.md': '# ok', 'cluster_result.json': '{}' } })
    expect(store.list().length).toBe(1)
    expect(store.readFile({ dirName: saved.dirName, name: 'cluster_summary.md' })).toContain('# ok')
    store.delete({ dirName: saved.dirName })
    expect(store.list().length).toBe(0)
  })
})

