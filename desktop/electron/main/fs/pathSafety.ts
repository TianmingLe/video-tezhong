import path from 'node:path'

function looksLikeWin32Path(p: string): boolean {
  const s = String(p || '')
  if (s.includes('\\')) return true
  if (/^[a-zA-Z]:[\\/]/.test(s)) return true
  return false
}

export function assertPathInside(baseDirPath: string, targetPath: string): string {
  const baseRaw = String(baseDirPath || '')
  const targetRaw = String(targetPath || '')
  if (!baseRaw || !targetRaw) throw new Error('invalid path')

  const api = looksLikeWin32Path(baseRaw) || looksLikeWin32Path(targetRaw) ? path.win32 : path.posix

  const baseResolved = api.resolve(baseRaw)
  const targetResolved = api.resolve(targetRaw)

  const baseForRel = api === path.win32 ? baseResolved.toLowerCase() : baseResolved
  const targetForRel = api === path.win32 ? targetResolved.toLowerCase() : targetResolved

  const rel = api.relative(baseForRel, targetForRel)
  if (rel.startsWith('..') || api.isAbsolute(rel)) throw new Error('invalid path')
  return targetResolved
}

