import type { TrayConfig } from './types'

export function getDefaultTrayConfig(platform: NodeJS.Platform): TrayConfig {
  if (platform === 'darwin') return { leftClick: 'menu' }
  return { leftClick: 'toggle' }
}

