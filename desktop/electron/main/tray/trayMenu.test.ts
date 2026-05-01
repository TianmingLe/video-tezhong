import { describe, expect, test } from 'vitest'
import { buildTrayMenuTemplate } from './trayMenu'
import { getDefaultTrayConfig } from './trayConfig'

describe('tray menu', () => {
  test('default config: darwin uses menu, win32 uses toggle', () => {
    expect(getDefaultTrayConfig('darwin').leftClick).toBe('menu')
    expect(getDefaultTrayConfig('win32').leftClick).toBe('toggle')
  })

  test('menu includes cancel when running', () => {
    const tpl = buildTrayMenuTemplate({
      platform: 'win32',
      isVisible: true,
      hasRunningJob: true,
      leftClickMode: 'toggle'
    })
    expect(tpl.some((i) => i.type !== 'separator' && i.label === '取消当前任务')).toBe(true)
  })

  test('show/hide label changes with visibility', () => {
    const a = buildTrayMenuTemplate({ platform: 'win32', isVisible: true, hasRunningJob: false, leftClickMode: 'toggle' })
    const b = buildTrayMenuTemplate({ platform: 'win32', isVisible: false, hasRunningJob: false, leftClickMode: 'toggle' })
    const aLabel = a.find((i) => i.type !== 'separator' && (i.label === '隐藏窗口' || i.label === '显示窗口'))?.label
    const bLabel = b.find((i) => i.type !== 'separator' && (i.label === '隐藏窗口' || i.label === '显示窗口'))?.label
    expect(aLabel).toBe('隐藏窗口')
    expect(bLabel).toBe('显示窗口')
  })
})

