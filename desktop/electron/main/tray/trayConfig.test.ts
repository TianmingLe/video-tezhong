import { describe, expect, test } from 'vitest'
import { getDefaultTrayConfig, getTrayConfigFilePath, loadTrayConfig, saveTrayConfig, type TrayConfigFs } from './trayConfig'

function createMemFs(): TrayConfigFs & { files: Map<string, string> } {
  const files = new Map<string, string>()
  return {
    files,
    existsSync: (p) => files.has(p),
    readFileSync: (p, _enc) => {
      const v = files.get(p)
      if (v == null) throw new Error('ENOENT')
      return v
    },
    writeFileSync: (p, data, _enc) => {
      files.set(p, data)
    },
    mkdirSync: (_p, _opts) => {}
  }
}

describe('trayConfig persistence', () => {
  test('loadTrayConfig: missing file returns defaults', () => {
    const fs = createMemFs()
    const cfg = loadTrayConfig({ platform: 'win32', userDataPath: '/ud', fs })
    expect(cfg).toEqual(getDefaultTrayConfig('win32'))
  })

  test('saveTrayConfig + loadTrayConfig: roundtrip', () => {
    const fs = createMemFs()
    const config = { leftClick: 'none', rightClick: 'none', showBadgeOnRunning: true } as const
    saveTrayConfig({ userDataPath: '/ud', fs, config })
    const cfg = loadTrayConfig({ platform: 'win32', userDataPath: '/ud', fs })
    expect(cfg).toEqual(config)
  })

  test('loadTrayConfig: invalid values fallback to defaults', () => {
    const fs = createMemFs()
    const filePath = getTrayConfigFilePath('/ud')
    fs.writeFileSync(filePath, JSON.stringify({ leftClick: 'show', rightClick: 'bad', showBadgeOnRunning: 'no' }), 'utf-8')

    const cfg = loadTrayConfig({ platform: 'darwin', userDataPath: '/ud', fs })
    expect(cfg.leftClick).toBe('menu')
    expect(cfg.rightClick).toBe('menu')
    expect(cfg.showBadgeOnRunning).toBe(false)
  })
})
