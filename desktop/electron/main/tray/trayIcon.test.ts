import { describe, expect, test } from 'vitest'
import { getTrayIconCandidatePaths, pickFirstExistingPath } from './trayIcon'

describe('trayIcon', () => {
  test('pickFirstExistingPath: 返回第一个存在的路径', () => {
    const exists = (p: string) => p === '/b'
    expect(pickFirstExistingPath(['/a', '/b', '/c'], exists)).toBe('/b')
  })

  test('getTrayIconCandidatePaths: 优先使用平台特定 icon', () => {
    const paths = getTrayIconCandidatePaths({
      platform: 'darwin',
      icon: { darwin: '/darwin.png', win32: '/win.ico', fallback: '/fallback.png' },
      appPath: '/app',
      resourcesPath: '/res',
      cwd: '/cwd'
    })
    expect(paths[0]).toBe('/darwin.png')
    expect(paths).toContain('/fallback.png')
  })

  test('getTrayIconCandidatePaths: string icon 直接置顶', () => {
    const paths = getTrayIconCandidatePaths({
      platform: 'linux',
      icon: '/direct.png',
      appPath: '/app',
      resourcesPath: '/res'
    })
    expect(paths[0]).toBe('/direct.png')
  })
})

