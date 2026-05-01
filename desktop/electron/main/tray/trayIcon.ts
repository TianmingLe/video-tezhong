import path from 'node:path'

export type TrayIconConfig =
  | string
  | {
      darwin?: string
      win32?: string
      linux?: string
      fallback?: string
    }

export type TrayIconCandidateArgs = {
  platform: NodeJS.Platform
  icon?: TrayIconConfig
  appPath?: string
  resourcesPath?: string
  cwd?: string
}

function normalizeBases(bases: Array<string | undefined>): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const b of bases) {
    const v = (b || '').trim()
    if (!v) continue
    const abs = path.resolve(v)
    if (seen.has(abs)) continue
    seen.add(abs)
    out.push(abs)
  }
  return out
}

function platformIconPath(platform: NodeJS.Platform, icon: TrayIconConfig | undefined): string | undefined {
  if (!icon) return undefined
  if (typeof icon === 'string') return icon
  if (platform === 'darwin') return icon.darwin ?? icon.fallback
  if (platform === 'win32') return icon.win32 ?? icon.fallback
  if (platform === 'linux') return icon.linux ?? icon.fallback
  return icon.fallback
}

function defaultNames(platform: NodeJS.Platform): string[] {
  if (platform === 'darwin') return ['Template@2x.png', 'trayTemplate.png', 'tray.png', 'iconTemplate.png', 'icon.png']
  if (platform === 'win32') return ['icon.png', 'tray.ico', 'tray.png', 'icon.ico']
  return ['icon.png', 'tray.png']
}

export function getTrayIconCandidatePaths(args: TrayIconCandidateArgs): string[] {
  const bases = normalizeBases([args.resourcesPath, args.appPath, args.cwd])
  const candidates: string[] = []

  const byPlatform = platformIconPath(args.platform, args.icon)
  if (byPlatform) candidates.push(byPlatform)

  if (typeof args.icon === 'object' && args.icon) {
    const extra = [args.icon.fallback, args.icon.darwin, args.icon.win32, args.icon.linux].filter(
      (x): x is string => typeof x === 'string' && !!x.trim()
    )
    for (const p of extra) {
      if (!candidates.includes(p)) candidates.push(p)
    }
  }

  for (const base of bases) {
    for (const name of defaultNames(args.platform)) {
      candidates.push(path.join(base, 'tray', name))
      candidates.push(path.join(base, 'resources', 'tray', name))
      candidates.push(path.join(base, 'assets', name))
      candidates.push(path.join(base, name))
    }
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const p of candidates) {
    const s = String(p || '').trim()
    if (!s) continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out
}

export function pickFirstExistingPath(
  candidates: string[],
  existsSync: (p: string) => boolean
): string | undefined {
  for (const p of candidates) {
    try {
      if (existsSync(p)) return p
    } catch {}
  }
  return undefined
}
