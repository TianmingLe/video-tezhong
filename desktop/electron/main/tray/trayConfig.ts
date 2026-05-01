import path from 'node:path'
import type { TrayConfig } from './types'

export function getDefaultTrayConfig(platform: NodeJS.Platform): TrayConfig {
  if (platform === 'darwin') return { leftClick: 'menu', rightClick: 'menu', showBadgeOnRunning: false }
  return { leftClick: 'toggle', rightClick: 'menu', showBadgeOnRunning: false }
}

export type TrayConfigFs = {
  readFileSync: (filePath: string, encoding: 'utf-8') => string
  writeFileSync: (filePath: string, data: string, encoding: 'utf-8') => void
  existsSync: (filePath: string) => boolean
  mkdirSync: (dirPath: string, opts: { recursive: boolean }) => void
}

export function getTrayConfigFilePath(userDataPath: string): string {
  return path.join(userDataPath, 'tray-config.json')
}

export function loadTrayConfig(args: { platform: NodeJS.Platform; userDataPath: string; fs: TrayConfigFs }): TrayConfig {
  const defaults = getDefaultTrayConfig(args.platform)
  const filePath = getTrayConfigFilePath(args.userDataPath)
  if (!args.fs.existsSync(filePath)) return defaults
  try {
    const raw = args.fs.readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as Partial<TrayConfig> | null
    const cfg = { ...defaults, ...(parsed ?? {}) }
    if (cfg.leftClick !== 'menu' && cfg.leftClick !== 'toggle' && cfg.leftClick !== 'none') cfg.leftClick = defaults.leftClick
    if (cfg.rightClick !== 'menu' && cfg.rightClick !== 'none') cfg.rightClick = defaults.rightClick
    if (typeof cfg.showBadgeOnRunning !== 'boolean') cfg.showBadgeOnRunning = defaults.showBadgeOnRunning
    return cfg
  } catch {
    return defaults
  }
}

export function saveTrayConfig(args: { userDataPath: string; fs: TrayConfigFs; config: TrayConfig }): void {
  const filePath = getTrayConfigFilePath(args.userDataPath)
  args.fs.mkdirSync(args.userDataPath, { recursive: true })
  args.fs.writeFileSync(filePath, JSON.stringify(args.config, null, 2), 'utf-8')
}
