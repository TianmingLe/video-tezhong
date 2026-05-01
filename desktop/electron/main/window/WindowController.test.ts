import { describe, expect, test, vi } from 'vitest'
import type { BrowserWindow } from 'electron'
import { WindowController } from './WindowController'

class FakeWindow {
  private listeners: Record<string, Array<() => void>> = {}
  private visible = false
  private minimized = false

  on(event: 'show' | 'hide' | 'closed', listener: () => void): void {
    this.listeners[event] ??= []
    this.listeners[event].push(listener)
  }

  isVisible(): boolean {
    return this.visible
  }

  isMinimized(): boolean {
    return this.minimized
  }

  restore(): void {
    this.minimized = false
  }

  show(): void {
    this.visible = true
    for (const cb of this.listeners.show ?? []) cb()
  }

  hide(): void {
    this.visible = false
    for (const cb of this.listeners.hide ?? []) cb()
  }

  close(): void {
    this.visible = false
    for (const cb of this.listeners.closed ?? []) cb()
  }

  setMinimized(v: boolean): void {
    this.minimized = v
  }
}

describe('WindowController', () => {
  test('show: 首次创建窗口并触发可见回调', () => {
    const onVis = vi.fn()
    const win = new FakeWindow()
    const createWindow = vi.fn(() => win as unknown as BrowserWindow)
    const controller = new WindowController({ createWindow, onWindowVisibilityChange: onVis })

    controller.show()

    expect(createWindow).toHaveBeenCalledTimes(1)
    expect(controller.getWindow()).toBe(win as unknown as BrowserWindow)
    expect(onVis).toHaveBeenCalledWith(true)
  })

  test('toggleVisibility: 在 show/hide 间切换并触发回调', () => {
    const onVis = vi.fn()
    const win = new FakeWindow()
    const controller = new WindowController({
      createWindow: () => win as unknown as BrowserWindow,
      onWindowVisibilityChange: onVis
    })

    controller.toggleVisibility()
    controller.toggleVisibility()

    expect(onVis.mock.calls.map((c) => c[0])).toEqual([true, false])
  })

  test('closed: 关闭后清空引用并触发不可见回调', () => {
    const onVis = vi.fn()
    const win = new FakeWindow()
    const controller = new WindowController({
      createWindow: () => win as unknown as BrowserWindow,
      onWindowVisibilityChange: onVis
    })

    controller.show()
    win.close()

    expect(controller.getWindow()).toBe(null)
    expect(onVis.mock.calls.map((c) => c[0])).toEqual([true, false])
  })

  test('restore: 最小化时 show 会调用 restore（若存在）', () => {
    const win = new FakeWindow()
    win.setMinimized(true)

    const controller = new WindowController({ createWindow: () => win as unknown as BrowserWindow })
    controller.show()

    expect(win.isMinimized()).toBe(false)
  })
})
